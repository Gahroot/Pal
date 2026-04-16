/**
 * Voice capture service — bridges to Rust audio/STT via Tauri invoke and events.
 *
 * Singleton that manages the STT pipeline. The actual audio capture, VAD, and
 * speech recognition happen in Rust; this TypeScript layer provides the API and
 * event routing.
 *
 * Ported from VoiceService.swift.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ─── Types ───────────────────────────────────────────────────────────────────

export type VoiceState = 'idle' | 'capturing';

export interface CaptureOptions {
  /** Silence duration (seconds) before auto-finalizing. Default: 1.0 */
  silenceDuration?: number;
  /** Mute system audio while capturing. Default: true */
  muteSystem?: boolean;
}

interface AudioLevelPayload {
  rms: number;
  isSpeech: boolean;
}

interface TranscriptionPayload {
  text: string;
}

// ─── VoiceService ────────────────────────────────────────────────────────────

export class VoiceService {
  private static _instance: VoiceService | null = null;

  static get shared(): VoiceService {
    if (!VoiceService._instance) {
      VoiceService._instance = new VoiceService();
    }
    return VoiceService._instance;
  }

  // ─── State ──────────────────────────────────────────────────────────────

  private _state: VoiceState = 'idle';
  get state(): VoiceState {
    return this._state;
  }

  // ─── Callbacks ──────────────────────────────────────────────────────────

  /** Called with audio level updates. */
  onAudioLevel: ((data: { rms: number; isSpeech: boolean }) => void) | null = null;
  /** Called with live partial transcript as the user speaks. */
  onPartialTranscript: ((text: string) => void) | null = null;
  /** Called when speech capture completes with transcribed text. */
  onCaptureComplete: ((text: string) => void) | null = null;
  /** Called once per capture session when the user first starts speaking. */
  onFirstSpeech: (() => void) | null = null;
  /** Called when capture fails to start. */
  onError: ((message: string) => void) | null = null;

  // ─── Event Listeners ────────────────────────────────────────────────────

  private unlisteners: UnlistenFn[] = [];
  private initialized = false;

  private constructor() {}

  /** Set up Tauri event listeners. Called lazily on first use. */
  private async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    this.unlisteners.push(
      await listen<AudioLevelPayload>('audio-level', (event) => {
        this.onAudioLevel?.(event.payload);
      }),
    );

    this.unlisteners.push(
      await listen<TranscriptionPayload>('transcription-partial', (event) => {
        this.onPartialTranscript?.(event.payload.text);
      }),
    );

    this.unlisteners.push(
      await listen<TranscriptionPayload>('transcription-final', (event) => {
        this._state = 'idle';
        this.onCaptureComplete?.(event.payload.text);
      }),
    );

    this.unlisteners.push(
      await listen('first-speech', () => {
        this.onFirstSpeech?.();
      }),
    );
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /** Starts capturing speech. Calls into Rust audio backend. */
  async startCapture(options: CaptureOptions = {}): Promise<void> {
    await this.init();

    if (this._state === 'capturing') {
      console.warn('[VoiceService] startCapture called while already capturing');
      return;
    }

    this._state = 'capturing';
    console.info('[VoiceService] Starting capture');

    try {
      await invoke('audio_start_capture', {
        silenceDuration: options.silenceDuration ?? 1.0,
        muteSystem: options.muteSystem ?? true,
      });
    } catch (e) {
      this._state = 'idle';
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[VoiceService] Failed to start capture: ${msg}`);
      this.onError?.(msg);
    }
  }

  /** Stops capture and returns to idle without invoking the completion callback. */
  async stopCapture(): Promise<void> {
    if (this._state !== 'capturing') return;

    console.info('[VoiceService] Stopping capture');
    this._state = 'idle';

    try {
      await invoke('audio_stop_capture');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[VoiceService] Failed to stop capture: ${msg}`);
    }
  }

  /** Clean up all event listeners. */
  destroy(): void {
    for (const unlisten of this.unlisteners) {
      unlisten();
    }
    this.unlisteners = [];
    this.initialized = false;
    this._state = 'idle';
  }
}
