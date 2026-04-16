/**
 * Service for calling AI APIs. Supports Anthropic-compatible and
 * OpenAI-compatible providers via the model registry.
 *
 * Ported from ClaudeService.swift.
 */

import type {
  ClaudeResponse,
  ContentBlock,
  ModelInfo,
  StreamEventCallback,
  ToolUseCall,
} from '../../types/index.js';
import { providerForModel } from './model-registry.js';
import { parseOpenAIStream } from './stream-parsers/openai-parser.js';
import { parseAnthropicStream } from './stream-parsers/anthropic-parser.js';
import { convertMessageToOpenAI, convertToolToOpenAI } from './format-converters/anthropic-to-openai.js';
import { buildSystemPrompt } from './system-prompt.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type AnyDict = Record<string, unknown>;

export class ClaudeServiceError extends Error {
  readonly statusCode?: number;
  readonly body?: string;
  constructor(message: string, statusCode?: number, body?: string) {
    super(message);
    this.name = 'ClaudeServiceError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [2000, 4000, 8000];
const STREAM_TIMEOUT_MS = 300_000; // 5 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractTextContent(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function extractToolUseCalls(blocks: ContentBlock[]): ToolUseCall[] {
  return blocks
    .filter((b): b is ContentBlock & { type: 'tool_use' } => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));
}

/** Returns true if the 429 response body indicates a hard usage cap. */
function isHardUsageLimit(body: string): boolean {
  const lower = body.toLowerCase();
  return lower.includes('usage_limit_reached') || lower.includes('usage limit');
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ClaudeService {
  private apiKey: string;
  private model: ModelInfo;

  constructor(model: ModelInfo, apiKey: string) {
    this.model = model;
    this.apiKey = apiKey;
  }

  /** Update the active model. */
  setModel(model: ModelInfo): void {
    this.model = model;
  }

  /** Update the API key. */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /** Get the current model. */
  get currentModel(): ModelInfo {
    return this.model;
  }

  // ─── Main API ─────────────────────────────────────────────────────────────

  /**
   * Sends a conversation with tool definitions and streams events back.
   * Automatically retries on 429 (rate limit) errors with exponential backoff.
   */
  async sendWithTools(
    messages: AnyDict[],
    tools: AnyDict[],
    systemPrompt?: string,
    maxTokens?: number,
    onEvent?: StreamEventCallback,
    signal?: AbortSignal,
  ): Promise<ClaudeResponse> {
    const noop: StreamEventCallback = () => {};
    const cb = onEvent ?? noop;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      signal?.throwIfAborted();

      try {
        return await this.sendOnce(messages, tools, systemPrompt, maxTokens, cb, signal);
      } catch (e) {
        if (
          e instanceof ClaudeServiceError &&
          e.statusCode === 429 &&
          attempt < MAX_RETRIES &&
          !isHardUsageLimit(e.body ?? '')
        ) {
          const delay = RETRY_DELAYS_MS[attempt] ?? 8000;
          console.warn(`Rate limited (429) attempt ${attempt + 1}/${MAX_RETRIES + 1} — retry in ${delay}ms`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw e;
      }
    }

    throw new ClaudeServiceError('Rate limited after max retries', 429, 'Exhausted retries');
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private async sendOnce(
    messages: AnyDict[],
    tools: AnyDict[],
    systemPrompt: string | undefined,
    maxTokens: number | undefined,
    onEvent: StreamEventCallback,
    signal?: AbortSignal,
  ): Promise<ClaudeResponse> {
    const provider = providerForModel(this.model);

    if (provider.apiFormat === 'anthropic') {
      return this.streamAnthropicRequest(messages, tools, systemPrompt, maxTokens, onEvent, signal);
    }

    return this.streamOpenAIRequest(messages, tools, systemPrompt, maxTokens, onEvent, signal);
  }

  // ─── Anthropic Streaming ──────────────────────────────────────────────────

  private async streamAnthropicRequest(
    messages: AnyDict[],
    tools: AnyDict[],
    systemPrompt: string | undefined,
    maxTokens: number | undefined,
    onEvent: StreamEventCallback,
    signal?: AbortSignal,
  ): Promise<ClaudeResponse> {
    const request = this.buildAnthropicRequest(messages, tools, systemPrompt, maxTokens);

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), STREAM_TIMEOUT_MS);

    // Combine user-provided signal and timeout
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(request.url, {
        ...request.init,
        signal: combinedSignal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '<no body>');
        throw new ClaudeServiceError(
          `Anthropic API error (HTTP ${response.status})`,
          response.status,
          body,
        );
      }

      if (!response.body) {
        throw new ClaudeServiceError('No response body from Anthropic API');
      }

      const reader = response.body.getReader();
      const result = await parseAnthropicStream(reader, onEvent);

      return {
        content: result.contentBlocks,
        stopReason: result.stopReason,
        textContent: extractTextContent(result.contentBlocks),
        toolUseCalls: extractToolUseCalls(result.contentBlocks),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildAnthropicRequest(
    messages: AnyDict[],
    tools: AnyDict[] | undefined,
    systemPrompt: string | undefined,
    maxTokens: number | undefined,
  ): { url: string; init: RequestInit } {
    const provider = providerForModel(this.model);

    // Build full system prompt with dynamic context
    let fullSystemPrompt = buildSystemPrompt();
    if (systemPrompt) {
      fullSystemPrompt += '\n\n' + systemPrompt;
    }

    const body: AnyDict = {
      model: this.model.id,
      max_tokens: maxTokens ?? this.model.maxOutputTokens,
      stream: true,
      system: [{ type: 'text', text: fullSystemPrompt }],
      messages,
      temperature: 1.0,
    };

    if (tools && tools.length > 0) {
      body['tools'] = tools;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'User-Agent': 'tama/1.0',
    };

    return {
      url: provider.baseURL,
      init: {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      },
    };
  }

  // ─── OpenAI-Compatible Streaming ──────────────────────────────────────────

  private async streamOpenAIRequest(
    messages: AnyDict[],
    tools: AnyDict[],
    systemPrompt: string | undefined,
    maxTokens: number | undefined,
    onEvent: StreamEventCallback,
    signal?: AbortSignal,
  ): Promise<ClaudeResponse> {
    const request = this.buildOpenAIRequest(messages, tools, systemPrompt, maxTokens);

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), STREAM_TIMEOUT_MS);

    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(request.url, {
        ...request.init,
        signal: combinedSignal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '<no body>');
        throw new ClaudeServiceError(
          `OpenAI API error (HTTP ${response.status})`,
          response.status,
          body,
        );
      }

      if (!response.body) {
        throw new ClaudeServiceError('No response body from OpenAI API');
      }

      const reader = response.body.getReader();
      const result = await parseOpenAIStream(reader, onEvent);

      return {
        content: result.contentBlocks,
        stopReason: result.stopReason,
        reasoningContent: result.reasoningContent ?? undefined,
        textContent: extractTextContent(result.contentBlocks),
        toolUseCalls: extractToolUseCalls(result.contentBlocks),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildOpenAIRequest(
    messages: AnyDict[],
    tools: AnyDict[] | undefined,
    systemPrompt: string | undefined,
    maxTokens: number | undefined,
  ): { url: string; init: RequestInit } {
    const provider = providerForModel(this.model);

    // Build system message content
    let systemContent = buildSystemPrompt();
    if (systemPrompt) {
      systemContent += '\n\n' + systemPrompt;
    }

    // OpenAI format: system message first, then convert messages
    const openAIMessages: AnyDict[] = [{ role: 'system', content: systemContent }];
    for (const msg of messages) {
      openAIMessages.push(...convertMessageToOpenAI(msg));
    }

    const body: AnyDict = {
      model: this.model.id,
      max_tokens: maxTokens ?? this.model.maxOutputTokens,
      stream: true,
      messages: openAIMessages,
    };

    // Convert tools from Anthropic format to OpenAI function calling format
    if (tools && tools.length > 0) {
      const openAITools = tools
        .map((t) => convertToolToOpenAI(t))
        .filter((t): t is AnyDict => t !== null);
      body['tools'] = openAITools;
    }

    // Disable thinking to avoid latency for providers that support it
    if (provider.usesCustomThinkingParam) {
      body['thinking'] = { type: 'disabled' };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'User-Agent': 'tama/1.0',
    };

    return {
      url: provider.baseURL,
      init: {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      },
    };
  }
}
