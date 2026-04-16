import type { ContentBlock, StreamEventCallback, ToolUseCall } from '../../../types/index.js';

/**
 * Accumulated state for a single tool call being streamed incrementally.
 * OpenAI streams tool calls by index, with id and name in the first chunk
 * and argument fragments in subsequent chunks.
 */
interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Result produced by the OpenAI stream parser after all events are consumed.
 */
export interface OpenAIParseResult {
  contentBlocks: ContentBlock[];
  stopReason: string | null;
  reasoningContent: string | null;
}

/**
 * Parses SSE events from OpenAI-compatible streaming APIs.
 *
 * OpenAI streams use `data: {json}` lines with `choices[0].delta` containing
 * content, tool_calls, and reasoning_content. Terminated by `data: [DONE]`.
 */
export async function parseOpenAIStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: StreamEventCallback,
): Promise<OpenAIParseResult> {
  const decoder = new TextDecoder();
  const contentBlocks: ContentBlock[] = [];
  let stopReason: string | null = null;

  // Text accumulation
  const textParts: string[] = [];

  // Reasoning/thinking content accumulation
  const reasoningParts: string[] = [];

  // Tool call accumulation keyed by index
  const activeToolCalls = new Map<number, ToolCallAccumulator>();

  let buffer = '';

  function flushText(): void {
    if (textParts.length === 0) return;
    contentBlocks.push({ type: 'text', text: textParts.join('') });
    textParts.length = 0;
  }

  function flushToolCalls(): void {
    const sorted = [...activeToolCalls.entries()].sort((a, b) => a[0] - b[0]);
    for (const [, tc] of sorted) {
      let input: Record<string, unknown> = {};
      if (tc.arguments) {
        try {
          const parsed: unknown = JSON.parse(tc.arguments);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            input = parsed as Record<string, unknown>;
          }
        } catch {
          console.warn(`Failed to parse tool args for ${tc.name}: ${tc.arguments.slice(0, 200)}`);
        }
      }
      contentBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input });
    }
    activeToolCalls.clear();
  }

  function flushAll(): void {
    flushText();
    flushToolCalls();
  }

  function processLine(line: string): void {
    if (!line.startsWith('data: ')) return;
    const payload = line.slice(6);

    if (payload === '[DONE]') {
      flushAll();
      return;
    }

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      console.warn(`OpenAI stream: JSON parse failed: ${payload.slice(0, 200)}`);
      return;
    }

    // Check for error
    const error = obj['error'] as Record<string, unknown> | undefined;
    if (error && typeof error['message'] === 'string') {
      throw new Error(`Stream error: ${error['message']}`);
    }

    const choices = obj['choices'] as Record<string, unknown>[] | undefined;
    if (!choices || choices.length === 0) return;
    const choice = choices[0];

    // Finish reason
    const reason = choice['finish_reason'] as string | null | undefined;
    if (reason) {
      // Map OpenAI finish reasons to Anthropic equivalents
      switch (reason) {
        case 'tool_calls':
          stopReason = 'tool_use';
          break;
        case 'stop':
          stopReason = 'end_turn';
          break;
        case 'length':
          stopReason = 'max_tokens';
          break;
        default:
          stopReason = reason;
      }
    }

    const delta = choice['delta'] as Record<string, unknown> | undefined;
    if (!delta) return;

    // Reasoning/thinking content (Moonshot non-standard field)
    const reasoning = delta['reasoning_content'] as string | undefined;
    if (reasoning) {
      reasoningParts.push(reasoning);
    }

    // Text content
    const content = delta['content'] as string | undefined;
    if (content) {
      textParts.push(content);
      onEvent({ type: 'textDelta', text: content });
    }

    // Tool calls (streamed incrementally)
    const toolCalls = delta['tool_calls'] as Record<string, unknown>[] | undefined;
    if (toolCalls) {
      for (const tc of toolCalls) {
        const index = tc['index'] as number | undefined;
        if (index === undefined) continue;

        const id = tc['id'] as string | undefined;
        const fn = tc['function'] as Record<string, unknown> | undefined;
        const name = fn?.['name'] as string | undefined;

        if (id && fn && name) {
          // First chunk for this tool: includes id and function name
          flushText();
          activeToolCalls.set(index, {
            id,
            name,
            arguments: (fn['arguments'] as string) ?? '',
          });
          onEvent({ type: 'toolUseStart', name, id });
        } else if (fn) {
          // Subsequent chunks: append to arguments
          const args = fn['arguments'] as string | undefined;
          if (args) {
            const existing = activeToolCalls.get(index);
            if (existing) {
              existing.arguments += args;
            }
          }
        }
      }
    }
  }

  // Read the stream
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // Keep the last incomplete line in the buffer
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        processLine(trimmed);
      }
    }
  }

  // Process any remaining data in the buffer
  if (buffer.trim()) {
    processLine(buffer.trim());
  }

  flushAll();

  return {
    contentBlocks,
    stopReason,
    reasoningContent: reasoningParts.length > 0 ? reasoningParts.join('') : null,
  };
}

/** Helper to extract ToolUseCall[] from ContentBlock[]. */
export function extractToolUseCalls(blocks: ContentBlock[]): ToolUseCall[] {
  return blocks
    .filter((b): b is ContentBlock & { type: 'tool_use' } => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));
}
