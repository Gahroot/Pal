/**
 * Per-turn telemetry accumulator for voice calls.
 *
 * Records named timestamps for each phase of a user<->agent turn
 * (listen -> silence -> agent -> TTS -> playback) and emits a compact summary
 * at turn end. Anything slower than a configured threshold is flagged with a
 * visible warning prefix so speed regressions jump out in the console.
 *
 * Ported from CallMetrics.swift.
 */

// ─── Thresholds ──────────────────────────────────────────────────────────────

/** Max comfortable gap from user stopping -> us detecting end of speech. */
const _SLOW_SILENCE_DETECT = 1.2;
void _SLOW_SILENCE_DETECT; // reserved for future threshold warnings
/** Max comfortable LLM time-to-first-token. */
const SLOW_AGENT_TTFB = 1.5;
/** Max time from first TTS enqueue -> first audio buffer ready. */
const SLOW_FIRST_AUDIO_READY = 0.8;
/** Max end-to-end from user finishing -> user hearing agent's first word. */
const SLOW_E2E = 2.0;
/** Any mid-stream playback gap > this is logged as dead-air. */
const DEAD_AIR_THRESHOLD = 0.25;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSeconds(seconds: number | null): string {
  if (seconds === null) return '\u2014'; // em dash
  return seconds.toFixed(2);
}

function since(start: Date | null): string {
  if (!start) return '\u2014';
  const elapsed = (Date.now() - start.getTime()) / 1000;
  return `${formatSeconds(elapsed)}s`;
}

function interval(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  return (b.getTime() - a.getTime()) / 1000;
}

// ─── CallMetrics ─────────────────────────────────────────────────────────────

export class CallMetrics {
  // State
  private turnNumber = 0;

  // Milestones. null means "not reached this turn yet".
  private tTurnStart: Date | null = null;
  private tFirstSpeech: Date | null = null;
  private tSilenceDetected: Date | null = null;
  private tAgentRequest: Date | null = null;
  private tFirstDelta: Date | null = null;
  private tFirstTTSEnqueue: Date | null = null;
  private tFirstAudioReady: Date | null = null;
  private tFirstAudioPlayback: Date | null = null;
  private tTTSFinished: Date | null = null;
  private tTurnEnd: Date | null = null;

  // Aggregates
  private deltaCount = 0;
  private deltaCharCount = 0;
  private toolCalls: { name: string; ms: number }[] = [];
  private deadAirEvents: number[] = [];

  // ─── Turn Lifecycle ──────────────────────────────────────────────────────

  /** Called by CallSession when it starts listening for the next user turn. */
  beginTurn(): void {
    this.turnNumber++;
    this.tTurnStart = new Date();
    this.tFirstSpeech = null;
    this.tSilenceDetected = null;
    this.tAgentRequest = null;
    this.tFirstDelta = null;
    this.tFirstTTSEnqueue = null;
    this.tFirstAudioReady = null;
    this.tFirstAudioPlayback = null;
    this.tTTSFinished = null;
    this.tTurnEnd = null;
    this.deltaCount = 0;
    this.deltaCharCount = 0;
    this.toolCalls = [];
    this.deadAirEvents = [];
    console.info(
      `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501 TURN ${this.turnNumber} LISTEN \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`,
    );
  }

  /** First RMS crossing the speech threshold in this turn. */
  noteFirstSpeech(): void {
    if (this.tFirstSpeech) return;
    this.tFirstSpeech = new Date();
    console.info(`[CallMetrics] User started speaking (${since(this.tTurnStart)})`);
  }

  /** VoiceService finalized a transcript (silence detected). */
  noteSilenceDetected(wordCount: number): void {
    if (this.tSilenceDetected) return;
    this.tSilenceDetected = new Date();
    const elapsed = formatSeconds(interval(this.tFirstSpeech, this.tSilenceDetected));
    console.info(`[CallMetrics] Silence detected (${wordCount} words, user spoke for ${elapsed}s)`);
  }

  /** Agent HTTP request went out. */
  noteAgentRequestSent(): void {
    if (this.tAgentRequest) return;
    this.tAgentRequest = new Date();
    const gap = formatSeconds(interval(this.tSilenceDetected, this.tAgentRequest));
    console.info(`[CallMetrics] Agent request sent (silence->request: ${gap}s)`);
  }

  /** First text delta from the LLM -- critical "time to first token". */
  noteFirstDelta(text: string): void {
    this.deltaCount++;
    this.deltaCharCount += text.length;
    if (this.tFirstDelta) return;
    this.tFirstDelta = new Date();
    const ttfb = interval(this.tAgentRequest, this.tFirstDelta) ?? 0;
    if (ttfb > SLOW_AGENT_TTFB) {
      console.warn(
        `[CallMetrics] SLOW Agent TTFB: ${formatSeconds(ttfb)}s (threshold ${formatSeconds(SLOW_AGENT_TTFB)}s)`,
      );
    } else {
      console.info(`[CallMetrics] First LLM token after ${formatSeconds(ttfb)}s`);
    }
  }

  /** A tool finished. Recorded as part of the turn's aggregate timing. */
  noteToolComplete(name: string, durationMs: number): void {
    this.toolCalls.push({ name, ms: durationMs });
    console.info(`[CallMetrics] Tool ${name} -- ${durationMs}ms`);
  }

  /** SpeechService started generating the first TTS buffer of this turn. */
  noteFirstTTSEnqueue(): void {
    if (this.tFirstTTSEnqueue) return;
    this.tFirstTTSEnqueue = new Date();
    const gap = formatSeconds(interval(this.tFirstDelta, this.tFirstTTSEnqueue));
    console.info(`[CallMetrics] First TTS chunk enqueued (delta->enqueue: ${gap}s)`);
  }

  /** First TTS buffer ready in the play queue (not yet playing). */
  noteFirstAudioReady(): void {
    if (this.tFirstAudioReady) return;
    this.tFirstAudioReady = new Date();
    const gap = interval(this.tFirstTTSEnqueue, this.tFirstAudioReady) ?? 0;
    if (gap > SLOW_FIRST_AUDIO_READY) {
      console.warn(
        `[CallMetrics] SLOW TTS gen: ${formatSeconds(gap)}s (threshold ${formatSeconds(SLOW_FIRST_AUDIO_READY)}s)`,
      );
    } else {
      console.info(`[CallMetrics] First audio buffer ready (${formatSeconds(gap)}s)`);
    }
  }

  /** User starts actually hearing the agent's voice -- the critical UX moment. */
  noteFirstAudioPlayback(): void {
    if (this.tFirstAudioPlayback) return;
    this.tFirstAudioPlayback = new Date();
    const e2e = interval(this.tSilenceDetected, this.tFirstAudioPlayback) ?? 0;
    if (e2e > SLOW_E2E) {
      console.warn(
        `[CallMetrics] SLOW E2E user->voice: ${formatSeconds(e2e)}s (threshold ${formatSeconds(SLOW_E2E)}s)`,
      );
    } else {
      console.info(`[CallMetrics] E2E user->voice: ${formatSeconds(e2e)}s`);
    }
  }

  /** Detected a gap in playback (queue went empty while stream still active). */
  notePlaybackGap(seconds: number): void {
    if (seconds < DEAD_AIR_THRESHOLD) return;
    this.deadAirEvents.push(seconds);
    console.warn(`[CallMetrics] Dead air: ${formatSeconds(seconds)}s gap between TTS buffers`);
  }

  /** TTS fully drained -- nothing left to say. */
  noteTTSFinished(): void {
    if (this.tTTSFinished) return;
    this.tTTSFinished = new Date();
  }

  /** End-of-turn summary. */
  endTurn(): void {
    this.tTurnEnd = new Date();
    this.emitSummary();
  }

  // ─── Summary ──────────────────────────────────────────────────────────────

  private emitSummary(): void {
    const userSpoke = interval(this.tFirstSpeech, this.tSilenceDetected);
    const silenceToRequest = interval(this.tSilenceDetected, this.tAgentRequest);
    const agentTTFB = interval(this.tAgentRequest, this.tFirstDelta);
    const agentTotal = interval(this.tAgentRequest, this.tFirstTTSEnqueue ?? this.tTTSFinished);
    const ttsGen = interval(this.tFirstTTSEnqueue, this.tFirstAudioReady);
    const ttsWait = interval(this.tFirstAudioReady, this.tFirstAudioPlayback);
    const e2e = interval(this.tSilenceDetected, this.tFirstAudioPlayback);
    const total = interval(this.tTurnStart, this.tTurnEnd);
    const toolsTotal = this.toolCalls.reduce((sum, t) => sum + t.ms, 0);
    const deadAirTotal = this.deadAirEvents.reduce((sum, d) => sum + d, 0);

    const bar = '\u2501'.repeat(13);
    const lines: string[] = [];
    lines.push(`${bar} TURN ${this.turnNumber} SUMMARY ${bar}`);
    lines.push(`  User spoke ............ ${formatSeconds(userSpoke)}s`);
    lines.push(`  Silence->request ....... ${formatSeconds(silenceToRequest)}s`);
    lines.push(
      `  Agent TTFB ............ ${formatSeconds(agentTTFB)}s   (${this.deltaCount} deltas, ${this.deltaCharCount} chars)`,
    );
    lines.push(`  Agent total ........... ${formatSeconds(agentTotal)}s`);
    if (this.toolCalls.length > 0) {
      const toolSummary = this.toolCalls.map((t) => `${t.name}=${t.ms}ms`).join(', ');
      lines.push(`  Tools (${this.toolCalls.length}) ${toolsTotal}ms ....... ${toolSummary}`);
    }
    lines.push(`  TTS gen (first chunk) . ${formatSeconds(ttsGen)}s`);
    lines.push(`  TTS ready->playback .... ${formatSeconds(ttsWait)}s`);
    if (this.deadAirEvents.length > 0) {
      lines.push(`  Dead air events .... ${this.deadAirEvents.length} (total ${formatSeconds(deadAirTotal)}s)`);
    }
    lines.push(`  E2E user->voice ..... ${formatSeconds(e2e)}s`);
    lines.push(`  Turn total ............ ${formatSeconds(total)}s`);
    lines.push('\u2501'.repeat(45));

    for (const line of lines) {
      console.info(`[CallMetrics] ${line}`);
    }
  }
}
