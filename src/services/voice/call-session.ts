/**
 * Voice call session -- manages the full lifecycle of a voice call.
 *
 * Owns an AgentLoop, conversation history, voice capture callbacks,
 * TTS streaming, and per-turn metrics. The entire interaction happens
 * through voice.
 *
 * Flow: greeting -> listen -> agent + TTS -> listen -> loop
 *
 * Ported from CallSession.swift.
 */

import { VoiceService } from './voice-service.js';
import { SpeechService } from './speech-service.js';
import { CallMetrics } from './call-metrics.js';
import { AgentLoop, AgentEndCallError } from '../ai/agent-loop.js';
import type { ClaudeService } from '../ai/claude-service.js';
import { ToolRegistryImpl } from '../tools/tool-registry.js';
import { buildCallSystemPrompt } from '../ai/system-prompt.js';
import type { AgentEvent } from '../../types/index.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type AnyDict = Record<string, unknown>;

// ─── CallSession ─────────────────────────────────────────────────────────────

export class CallSession {
  // ─── State ──────────────────────────────────────────────────────────────

  private conversationHistory: AnyDict[] = [];
  private agentLoop: AgentLoop;
  private abortController: AbortController | null = null;
  private _isListening = false;
  private _isResponding = false;
  private _isActive = false;

  get isListening(): boolean {
    return this._isListening;
  }
  get isResponding(): boolean {
    return this._isResponding;
  }
  get isActive(): boolean {
    return this._isActive;
  }

  /** Per-turn telemetry. */
  private metrics = new CallMetrics();

  /** Last tool name emitted by the agent, for recording duration. */
  private pendingToolName: string | null = null;
  private pendingToolStart: number | null = null;

  /** Callback when the call ends (e.g. agent invoked end_call). */
  onCallEnded: (() => void) | null = null;

  // ─── Greeting ───────────────────────────────────────────────────────────

  private static readonly GREETING = 'Hey, what can I help you with today?';

  constructor(service: ClaudeService) {
    const registry = ToolRegistryImpl.defaultRegistry('.');
    this.agentLoop = new AgentLoop(service, registry);
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Starts the voice call -- speaks a greeting, then begins listening.
   */
  async start(): Promise<void> {
    if (this._isActive) {
      console.warn('[CallSession] start() called but already active');
      return;
    }
    console.info('[CallSession] === CALL SESSION START ===');
    this._isActive = true;
    this.installMetricsHooks();
    this.setupVoiceCallbacks();
    await this.speakGreeting();
  }

  /** Ends the voice call -- stops everything, cleans up. */
  end(): void {
    if (!this._isActive) {
      console.warn('[CallSession] end() called but not active');
      return;
    }
    console.info('[CallSession] === CALL SESSION END ===');
    this._isActive = false;

    this.abortController?.abort();
    this.abortController = null;

    SpeechService.shared.stop();
    void VoiceService.shared.stopCapture();

    this._isListening = false;
    this._isResponding = false;

    this.clearVoiceCallbacks();
    this.clearMetricsHooks();

    console.info(`[CallSession] Done -- ${this.conversationHistory.length} messages`);
  }

  // ─── Greeting ───────────────────────────────────────────────────────────

  private async speakGreeting(): Promise<void> {
    const greeting = CallSession.GREETING;
    console.info(`[CallSession] Speaking greeting: "${greeting}"`);

    await SpeechService.shared.beginStreaming();
    SpeechService.shared.feedChunk(greeting);
    await SpeechService.shared.finishStreaming();

    console.info('[CallSession] Greeting TTS finished');
    if (!this._isActive) return;
    this.startListening();
  }

  // ─── Voice Capture ──────────────────────────────────────────────────────

  private setupVoiceCallbacks(): void {
    const voice = VoiceService.shared;

    voice.onCaptureComplete = (text: string) => {
      console.info(`[CallSession] onCaptureComplete -- length=${text.length}`);
      this.handleCaptureComplete(text);
    };

    voice.onPartialTranscript = (partial: string) => {
      console.debug(`[CallSession] partial: "${partial.slice(0, 60)}"`);
    };

    voice.onAudioLevel = (_data) => {
      // Could wire to UI audio level indicator
    };

    voice.onError = (errorMessage: string) => {
      console.error(`[CallSession] Voice error: ${errorMessage}`);
    };
  }

  private clearVoiceCallbacks(): void {
    const voice = VoiceService.shared;
    voice.onCaptureComplete = null;
    voice.onPartialTranscript = null;
    voice.onAudioLevel = null;
    voice.onError = null;
    voice.onFirstSpeech = null;
  }

  /**
   * Start listening for user speech.
   * Silence window is shorter than default for snappy turn-taking.
   */
  private startListening(): void {
    if (!this._isActive) return;
    console.info('[CallSession] Listening (0.6s silence)');
    this._isListening = true;
    this._isResponding = false;
    this.metrics.beginTurn();

    void VoiceService.shared.startCapture({
      silenceDuration: 0.6,
      muteSystem: true,
    });
  }

  // ─── Metrics Wiring ─────────────────────────────────────────────────────

  private installMetricsHooks(): void {
    VoiceService.shared.onFirstSpeech = () => {
      this.metrics.noteFirstSpeech();
    };
    SpeechService.shared.onFirstChunkEnqueued = () => {
      this.metrics.noteFirstTTSEnqueue();
    };
    SpeechService.shared.onFirstAudioReady = () => {
      this.metrics.noteFirstAudioReady();
    };
    SpeechService.shared.onFirstAudioPlayback = () => {
      this.metrics.noteFirstAudioPlayback();
    };
    SpeechService.shared.onPlaybackGap = (gap: number) => {
      this.metrics.notePlaybackGap(gap);
    };
  }

  private clearMetricsHooks(): void {
    VoiceService.shared.onFirstSpeech = null;
    SpeechService.shared.onFirstChunkEnqueued = null;
    SpeechService.shared.onFirstAudioReady = null;
    SpeechService.shared.onFirstAudioPlayback = null;
    SpeechService.shared.onPlaybackGap = null;
  }

  // ─── Speech Handling ────────────────────────────────────────────────────

  private handleCaptureComplete(text: string): void {
    if (!this._isActive) return;

    const trimmed = text.trim();
    const words = trimmed.split(/\s+/).filter((w) => w.length > 0).length;
    console.info(`[CallSession] Received -- ${words} words, ${trimmed.length} chars`);
    this.metrics.noteSilenceDetected(words);

    if (trimmed.length === 0) {
      console.info('[CallSession] Empty transcript -- restarting listening');
      this.startListening();
      return;
    }

    console.info(`[CallSession] User said: "${trimmed.slice(0, 120)}"`);
    this._isListening = false;

    this.conversationHistory.push({ role: 'user', content: trimmed });
    console.info(`[CallSession] History: ${this.conversationHistory.length} messages`);

    void this.runAgent();
  }

  // ─── Agent ──────────────────────────────────────────────────────────────

  private async runAgent(): Promise<void> {
    if (!this._isActive) return;
    console.info('[CallSession] Starting agent run');
    this._isResponding = true;

    await SpeechService.shared.beginStreaming();
    this.metrics.noteAgentRequestSent();

    const messages = [...this.conversationHistory];
    console.info(`[CallSession] Sending ${messages.length} messages`);

    this.abortController = new AbortController();

    try {
      const updatedHistory = await this.agentLoop.run(
        messages,
        buildCallSystemPrompt(),
        300,
        (event: AgentEvent) => {
          this.handleAgentEvent(event);
        },
      );

      console.info(`[CallSession] Agent done -- ${updatedHistory.length} messages`);
      this.conversationHistory = updatedHistory;

      if (!this._isActive) return;

      console.info('[CallSession] Waiting for TTS...');
      await SpeechService.shared.finishStreaming();
      console.info('[CallSession] TTS finished');
      this.metrics.noteTTSFinished();
      this.metrics.endTurn();

      if (!this._isActive) return;
      this._isResponding = false;

      // Start listening for next utterance
      this.startListening();
    } catch (e) {
      if (e instanceof AgentEndCallError) {
        console.info('[CallSession] End call requested -- finishing TTS then hanging up');
        this.conversationHistory = e.conversation;
        await SpeechService.shared.finishStreaming();
        this.metrics.noteTTSFinished();
        this.metrics.endTurn();
        this.onCallEnded?.();
      } else if (e instanceof DOMException && e.name === 'AbortError') {
        console.info('[CallSession] Cancelled');
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[CallSession] Agent error: ${msg}`);
        this._isResponding = false;
        SpeechService.shared.stop();
        if (this._isActive) {
          this.startListening();
        }
      }
    }
  }

  private handleAgentEvent(event: AgentEvent): void {
    if (!this._isActive) return;

    switch (event.type) {
      case 'textDelta':
        this.metrics.noteFirstDelta(event.text);
        SpeechService.shared.feedChunk(event.text);
        break;
      case 'toolStart':
        console.info(`[CallSession] toolStart: ${event.name} (id=${event.id})`);
        this.pendingToolName = event.name;
        this.pendingToolStart = performance.now();
        SpeechService.shared.flushBuffer();
        break;
      case 'toolRunning':
        // Could update UI indicator
        break;
      case 'toolResult':
        if (this.pendingToolStart !== null && this.pendingToolName === event.name) {
          const ms = Math.round(performance.now() - this.pendingToolStart);
          this.metrics.noteToolComplete(event.name, ms);
        }
        this.pendingToolName = null;
        this.pendingToolStart = null;
        break;
      case 'turnComplete':
        console.info(`[CallSession] turnComplete -- ${event.text.length} chars`);
        break;
      case 'error':
        console.error(`[CallSession] Agent error event: ${event.message}`);
        break;
    }
  }
}
