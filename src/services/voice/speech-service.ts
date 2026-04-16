/**
 * Text-to-speech service — bridges to Rust TTS backend via Tauri invoke and events.
 *
 * Supports streaming: feed text chunks as they arrive from the LLM, sentences
 * are spoken as they complete. Implements the same text draining strategy as
 * the Swift original (eager first flush, sentence/clause boundaries, idle timer).
 *
 * Ported from SpeechService.swift.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Max characters per TTS chunk. */
const MAX_CHUNK_CHARS = 200;
/** Minimum fragment length -- shorter pieces are merged to avoid choppy playback. */
const MIN_FRAGMENT_LENGTH = 20;
/** Minimum char count before the first eager flush. */
const EAGER_FLUSH_CHARS = 30;
/** After first flush, if buffer >= this, drain at clause boundary. */
const CLAUSE_FLUSH_CHARS = 60;
/** How long to wait after the last chunk before auto-flushing (ms). */
const FLUSH_DELAY = 300;

// ─── Regex Patterns ──────────────────────────────────────────────────────────

/** Sentence-ending punctuation followed by whitespace. */
const SENTENCE_PATTERN = /(?<=[.!?])\s+/g;
/** Clause boundary: comma, semicolon, colon, em/en dash followed by whitespace. */
const CLAUSE_PATTERN = /[,;:\u2014\u2013]\s+/g;

// ─── Markdown Stripping ──────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  let result = text;

  // Remove code blocks
  result = result.replace(/```[\s\S]*?```/g, '');
  // Remove inline code
  result = result.replace(/`[^`]+`/g, '');
  // Remove headers
  result = result.replace(/^#{1,6}\s+/gm, '');
  // Remove bold/italic markers
  result = result.replace(/[*_]{1,3}/g, '');
  // Remove bullet points
  result = result.replace(/^\s*[-*+]\s+/gm, '');
  // Remove links -- keep link text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Remove emojis (common Unicode ranges)
  result = result.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{E0020}-\u{E007F}]/gu,
    '',
  );
  // Strip emoji modifiers separately (variation selectors + ZWJ) — combining
  // them in the class above trips no-misleading-character-class.
  result = result.replace(/[\u{FE00}-\u{FE0F}\u{200D}]/gu, '');
  // Collapse multiple newlines
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

// ─── Text Splitting ──────────────────────────────────────────────────────────

/** Find the last match of a regex in a string. Returns the end index or -1. */
function lastMatchEnd(text: string, pattern: RegExp): number {
  // Reset regex state
  const re = new RegExp(pattern.source, pattern.flags);
  let lastEnd = -1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    lastEnd = match.index + match[0].length;
  }
  return lastEnd;
}

/** Split text into sentences using basic punctuation heuristics. */
function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  const re = /(?<=[.!?])\s+/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    sentences.push(text.slice(lastIdx, match.index + match[0].length));
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    sentences.push(text.slice(lastIdx));
  }
  if (sentences.length === 0 && text.length > 0) {
    sentences.push(text);
  }
  return sentences;
}

/** Split any sentence exceeding MAX_CHUNK_CHARS at clause boundaries. */
function splitLongSentences(sentences: string[]): string[] {
  const result: string[] = [];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length <= MAX_CHUNK_CHARS) {
      result.push(trimmed);
    } else {
      result.push(...splitAtClauseBoundaries(trimmed));
    }
  }
  return result;
}

/** Split a long sentence at comma, semicolon, or dash boundaries. */
function splitAtClauseBoundaries(text: string): string[] {
  const re = /[,;\u2014\u2013]\s+/g;
  const matches: { index: number; length: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    matches.push({ index: match.index, length: match[0].length });
  }

  if (matches.length === 0) {
    // No clause boundaries -- hard split at MAX_CHUNK_CHARS
    const chunks: string[] = [];
    for (let start = 0; start < text.length; start += MAX_CHUNK_CHARS) {
      chunks.push(text.slice(start, start + MAX_CHUNK_CHARS));
    }
    return chunks;
  }

  const chunks: string[] = [];
  let current = '';
  let lastEnd = 0;

  for (const m of matches) {
    const boundary = m.index + m.length;
    const piece = text.slice(lastEnd, boundary);
    if (current.length + piece.length > MAX_CHUNK_CHARS && current.length > 0) {
      chunks.push(current.trim());
      current = piece;
    } else {
      current += piece;
    }
    lastEnd = boundary;
  }

  // Remainder
  if (lastEnd < text.length) {
    current += text.slice(lastEnd);
  }
  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

/** Merge fragments shorter than MIN_FRAGMENT_LENGTH with adjacent chunks. */
function mergeShortFragments(chunks: string[]): string[] {
  if (chunks.length <= 1) return chunks;
  const result: string[] = [];
  let accumulator = '';

  for (const chunk of chunks) {
    if (accumulator.length === 0) {
      accumulator = chunk;
    } else if (accumulator.length < MIN_FRAGMENT_LENGTH || chunk.length < MIN_FRAGMENT_LENGTH) {
      accumulator += ' ' + chunk;
    } else {
      result.push(accumulator);
      accumulator = chunk;
    }
  }
  if (accumulator.length > 0) {
    result.push(accumulator);
  }
  return result;
}

// ─── TTS Status Event ────────────────────────────────────────────────────────

interface TTSStatusPayload {
  status: 'enqueued' | 'audio_ready' | 'playback_started' | 'playback_gap' | 'finished';
  gap?: number;
}

// ─── SpeechService ───────────────────────────────────────────────────────────

export class SpeechService {
  private static _instance: SpeechService | null = null;

  static get shared(): SpeechService {
    if (!SpeechService._instance) {
      SpeechService._instance = new SpeechService();
    }
    return SpeechService._instance;
  }

  // ─── Streaming State ────────────────────────────────────────────────────

  private streamBuffer = '';
  private isStreaming = false;
  private streamEnded = false;
  private pendingUtterances = 0;
  private hasFlushedFirst = false;
  private flushTimerId: ReturnType<typeof setTimeout> | null = null;

  /** Resolve function for the finishStreaming() promise. */
  private streamResolve: (() => void) | null = null;

  // ─── Telemetry Callbacks ────────────────────────────────────────────────

  /** Fires the first time a TTS chunk is handed to the Rust backend. */
  onFirstChunkEnqueued: (() => void) | null = null;
  /** Fires the first time a generated audio buffer lands in the play queue. */
  onFirstAudioReady: (() => void) | null = null;
  /** Fires the first time the audio engine starts playing a buffer this session. */
  onFirstAudioPlayback: (() => void) | null = null;
  /** Fires when a playback gap is detected. Argument is the gap duration in seconds. */
  onPlaybackGap: ((seconds: number) => void) | null = null;

  private firstChunkEnqueuedFired = false;
  private firstAudioReadyFired = false;
  private firstAudioPlaybackFired = false;

  // ─── Event Listeners ────────────────────────────────────────────────────

  private unlisteners: UnlistenFn[] = [];
  private initialized = false;

  private constructor() {}

  /** Set up Tauri event listeners. Called lazily on first use. */
  private async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    this.unlisteners.push(
      await listen<TTSStatusPayload>('tts-status', (event) => {
        this.handleTTSStatus(event.payload);
      }),
    );
  }

  private handleTTSStatus(payload: TTSStatusPayload): void {
    switch (payload.status) {
      case 'enqueued':
        if (!this.firstChunkEnqueuedFired) {
          this.firstChunkEnqueuedFired = true;
          this.onFirstChunkEnqueued?.();
        }
        break;
      case 'audio_ready':
        if (!this.firstAudioReadyFired) {
          this.firstAudioReadyFired = true;
          this.onFirstAudioReady?.();
        }
        break;
      case 'playback_started':
        if (!this.firstAudioPlaybackFired) {
          this.firstAudioPlaybackFired = true;
          this.onFirstAudioPlayback?.();
        }
        break;
      case 'playback_gap':
        if (payload.gap != null) {
          this.onPlaybackGap?.(payload.gap);
        }
        break;
      case 'finished':
        this.utteranceDidFinish();
        break;
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /** Begins a streaming speech session. Call feedChunk as text arrives, then finishStreaming. */
  async beginStreaming(): Promise<void> {
    await this.init();
    this.stop();

    this.streamBuffer = '';
    this.isStreaming = true;
    this.streamEnded = false;
    this.pendingUtterances = 0;
    this.hasFlushedFirst = false;
    this.streamResolve = null;
    this.clearFlushTimer();

    this.firstChunkEnqueuedFired = false;
    this.firstAudioReadyFired = false;
    this.firstAudioPlaybackFired = false;

    try {
      await invoke('tts_begin_stream');
    } catch (e) {
      console.error('[SpeechService] Failed to begin stream:', e);
    }

    console.info('[SpeechService] Streaming speech session started');
  }

  /**
   * Feeds a text chunk from the LLM stream.
   *
   * Strategy:
   * 1. First flush -- eagerly sent at the first clause/sentence boundary after
   *    EAGER_FLUSH_CHARS so TTS starts generating audio immediately.
   * 2. Subsequent flushes -- drained at sentence boundaries for natural pacing.
   * 3. Idle timer -- catches any remaining text after a short pause.
   */
  feedChunk(chunk: string): void {
    if (!this.isStreaming) return;
    this.streamBuffer += chunk;

    if (!this.hasFlushedFirst) {
      this.tryEagerFlush();
    } else {
      this.drainSentences();
    }

    this.scheduleFlush();
  }

  /**
   * Signals that the stream is complete. Speaks any remaining buffered text.
   * Returns a promise that resolves when all queued utterances finish speaking.
   */
  async finishStreaming(): Promise<void> {
    if (!this.isStreaming) return;
    this.streamEnded = true;
    this.clearFlushTimer();

    const remaining = stripMarkdown(this.streamBuffer).trim();
    this.streamBuffer = '';

    if (remaining.length > 0) {
      this.enqueueSentences(remaining);
    }

    if (this.pendingUtterances === 0) {
      console.info('[SpeechService] Streaming finished -- nothing to speak');
      this.completeStream();
      return;
    }

    console.info(`[SpeechService] Streaming finished -- waiting for ${this.pendingUtterances} utterances`);

    try {
      await invoke('tts_finish_stream');
    } catch (e) {
      console.error('[SpeechService] Failed to finish stream:', e);
    }

    return new Promise<void>((resolve) => {
      this.streamResolve = resolve;
    });
  }

  /** Stops any ongoing speech immediately. */
  stop(): void {
    const wasSpeaking = this.isStreaming;
    this.isStreaming = false;
    this.streamEnded = false;
    this.streamBuffer = '';
    this.pendingUtterances = 0;
    this.clearFlushTimer();

    if (wasSpeaking) {
      invoke('tts_stop').catch((e) => {
        console.error('[SpeechService] Failed to stop TTS:', e);
      });
      const resolve = this.streamResolve;
      this.streamResolve = null;
      resolve?.();
    }
  }

  /** Forces any buffered text to be spoken immediately (e.g. before a tool call pause). */
  flushBuffer(): void {
    if (!this.isStreaming) return;
    const text = stripMarkdown(this.streamBuffer).trim();

    // Skip flushing tiny fragments while more text is still streaming
    if (text.length < MIN_FRAGMENT_LENGTH && !this.streamEnded) {
      return;
    }

    console.info(`[SpeechService] flushBuffer -- text: ${text.slice(0, 80)}`);
    this.streamBuffer = '';

    if (text.length > 0) {
      this.enqueueSentences(text);
    }
  }

  /** Clean up all event listeners. */
  destroy(): void {
    this.stop();
    for (const unlisten of this.unlisteners) {
      unlisten();
    }
    this.unlisteners = [];
    this.initialized = false;
  }

  // ─── Eager Flush ────────────────────────────────────────────────────────

  private tryEagerFlush(): void {
    const cleaned = stripMarkdown(this.streamBuffer);

    // Try to find a sentence boundary first (works at any length)
    const sentenceEnd = lastMatchEnd(cleaned, SENTENCE_PATTERN);
    if (sentenceEnd > 0) {
      const toSpeak = cleaned.slice(0, sentenceEnd).trim();
      const remainder = cleaned.slice(sentenceEnd);
      this.streamBuffer = remainder;
      this.hasFlushedFirst = true;
      if (toSpeak.length > 0) {
        this.enqueueSentences(toSpeak);
      }
      return;
    }

    // No sentence boundary yet -- try clause boundary if we have enough text
    if (cleaned.length < EAGER_FLUSH_CHARS) return;

    const clauseEnd = lastMatchEnd(cleaned, CLAUSE_PATTERN);
    if (clauseEnd > 0) {
      const toSpeak = cleaned.slice(0, clauseEnd).trim();
      const remainder = cleaned.slice(clauseEnd);
      this.streamBuffer = remainder;
      this.hasFlushedFirst = true;
      if (toSpeak.length > 0) {
        this.enqueueSentences(toSpeak);
      }
      return;
    }

    // No boundaries at all -- hard flush everything we have
    const toSpeak = cleaned.trim();
    this.streamBuffer = '';
    this.hasFlushedFirst = true;
    if (toSpeak.length > 0) {
      this.enqueueSentences(toSpeak);
    }
  }

  // ─── Sentence Draining ──────────────────────────────────────────────────

  private drainSentences(): void {
    const cleaned = stripMarkdown(this.streamBuffer);

    // Prefer sentence boundaries when available
    const sentenceEnd = lastMatchEnd(cleaned, SENTENCE_PATTERN);
    if (sentenceEnd > 0) {
      this.drainAt(sentenceEnd, cleaned, 'sentence');
      return;
    }

    // No sentence boundary yet -- drain at last clause boundary once buffer
    // has enough content that generation latency would bite
    if (cleaned.length < CLAUSE_FLUSH_CHARS) return;
    const clauseEnd = lastMatchEnd(cleaned, CLAUSE_PATTERN);
    if (clauseEnd > 0) {
      this.drainAt(clauseEnd, cleaned, 'clause');
    }
  }

  private drainAt(boundaryEnd: number, cleaned: string, kind: string): void {
    const toSpeak = cleaned.slice(0, boundaryEnd).trim();
    const remainder = cleaned.slice(boundaryEnd);
    this.streamBuffer = remainder;
    console.info(`[SpeechService] drain(${kind}) -- spoke: ${toSpeak.slice(0, 80)}, remainder: ${remainder.slice(0, 40)}`);
    if (toSpeak.length > 0) {
      this.enqueueSentences(toSpeak);
    }
  }

  // ─── Utterance Enqueueing ───────────────────────────────────────────────

  private enqueueSentences(text: string): void {
    const sentences = splitIntoSentences(text);
    const chunks = splitLongSentences(sentences);
    const merged = mergeShortFragments(chunks);

    for (const chunk of merged) {
      const trimmed = chunk.trim();
      if (trimmed.length === 0) continue;
      this.enqueueUtterance(trimmed);
    }
  }

  private enqueueUtterance(text: string): void {
    this.pendingUtterances++;
    console.info(`[SpeechService] Enqueuing: ${text.slice(0, 60)}...`);

    invoke('tts_enqueue_text', { text }).catch((e) => {
      console.error('[SpeechService] Failed to enqueue text:', e);
      this.utteranceDidFinish();
    });
  }

  private utteranceDidFinish(): void {
    this.pendingUtterances = Math.max(0, this.pendingUtterances - 1);
    if (this.pendingUtterances === 0 && this.streamEnded) {
      this.completeStream();
    }
  }

  private completeStream(): void {
    this.isStreaming = false;
    this.streamEnded = false;
    const resolve = this.streamResolve;
    this.streamResolve = null;
    resolve?.();
  }

  // ─── Flush Timer ────────────────────────────────────────────────────────

  private scheduleFlush(): void {
    this.clearFlushTimer();
    this.flushTimerId = setTimeout(() => {
      this.flushBuffer();
    }, FLUSH_DELAY);
  }

  private clearFlushTimer(): void {
    if (this.flushTimerId !== null) {
      clearTimeout(this.flushTimerId);
      this.flushTimerId = null;
    }
  }
}
