import type { ContentBlock, StreamEventCallback, ToolUseCall } from '../../../types/index.js';

/**
 * Result produced by the Anthropic stream parser after all events are consumed.
 */
export interface AnthropicParseResult {
  contentBlocks: ContentBlock[];
  stopReason: string | null;
}

/**
 * Parses SSE events from the Anthropic streaming API, tracking text and
 * tool_use content blocks.
 *
 * Anthropic streams use `event: <type>` + `data: {json}` pairs with event
 * types: content_block_start, content_block_delta, content_block_stop,
 * message_delta, message_stop, error.
 */
export async function parseAnthropicStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: StreamEventCallback,
): Promise<AnthropicParseResult> {
  const decoder = new TextDecoder();
  const contentBlocks: ContentBlock[] = [];
  let stopReason: string | null = null;

  // Current event type (set by `event:` lines)
  let currentEvent = '';

  // Text accumulation
  const textParts: string[] = [];

  // Tool-use accumulation
  let toolId: string | null = null;
  let toolName: string | null = null;
  const toolJsonParts: string[] = [];

  function flushText(): void {
    if (textParts.length === 0) return;
    contentBlocks.push({ type: 'text', text: textParts.join('') });
    textParts.length = 0;
  }

  function handleBlockStart(obj: Record<string, unknown>): void {
    const block = obj['content_block'] as Record<string, unknown> | undefined;
    if (!block) return;
    const type = block['type'] as string | undefined;
    if (!type) return;

    if (type === 'tool_use') {
      flushText();
      toolId = (block['id'] as string) ?? null;
      toolName = (block['name'] as string) ?? null;
      toolJsonParts.length = 0;
      if (toolId && toolName) {
        onEvent({ type: 'toolUseStart', id: toolId, name: toolName });
      }
    } else if (type === 'text') {
      textParts.length = 0;
    }
  }

  function handleBlockDelta(obj: Record<string, unknown>): void {
    const delta = obj['delta'] as Record<string, unknown> | undefined;
    if (!delta) return;
    const type = delta['type'] as string | undefined;
    if (!type) return;

    if (type === 'text_delta') {
      const text = delta['text'] as string | undefined;
      if (text) {
        textParts.push(text);
        onEvent({ type: 'textDelta', text });
      }
    } else if (type === 'input_json_delta') {
      const partial = delta['partial_json'] as string | undefined;
      if (partial) {
        toolJsonParts.push(partial);
      }
    }
  }

  function handleBlockStop(): void {
    if (toolId !== null) {
      const fullJson = toolJsonParts.join('');
      let input: Record<string, unknown> = {};
      if (fullJson) {
        try {
          const parsed: unknown = JSON.parse(fullJson);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            input = parsed as Record<string, unknown>;
          } else {
            console.warn(`Tool input JSON is not an object for ${toolName ?? '?'}: ${fullJson.slice(0, 200)}`);
          }
        } catch (e) {
          console.warn(`Failed to parse tool input JSON for ${toolName ?? '?'}: ${(e as Error).message}`);
        }
      }
      contentBlocks.push({
        type: 'tool_use',
        id: toolId,
        name: toolName ?? '',
        input,
      });
      toolId = null;
      toolName = null;
      toolJsonParts.length = 0;
    } else {
      flushText();
    }
  }

  function handleMessageDelta(obj: Record<string, unknown>): void {
    const delta = obj['delta'] as Record<string, unknown> | undefined;
    if (!delta) return;
    const reason = delta['stop_reason'] as string | undefined;
    if (reason) {
      stopReason = reason;
    }
  }

  function handleError(obj: Record<string, unknown>): void {
    const error = obj['error'] as Record<string, unknown> | undefined;
    if (error) {
      const message = error['message'] as string | undefined;
      if (message) {
        throw new Error(`Stream error: ${message}`);
      }
    }
  }

  function processLine(line: string): void {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7);
      return;
    }

    if (!line.startsWith('data: ')) return;
    const json = line.slice(6);

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(json) as Record<string, unknown>;
    } catch {
      console.warn(`Malformed JSON on event ${currentEvent}: ${json.slice(0, 200)}`);
      return;
    }

    switch (currentEvent) {
      case 'content_block_start':
        handleBlockStart(obj);
        break;
      case 'content_block_delta':
        handleBlockDelta(obj);
        break;
      case 'content_block_stop':
        handleBlockStop();
        break;
      case 'message_delta':
        handleMessageDelta(obj);
        break;
      case 'message_stop':
        flushText();
        break;
      case 'error':
        handleError(obj);
        break;
      default:
        // ping, message_start, etc. — ignored
        break;
    }
  }

  // Read the stream
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        processLine(trimmed);
      }
    }
  }

  if (buffer.trim()) {
    processLine(buffer.trim());
  }

  flushText();

  return {
    contentBlocks,
    stopReason,
  };
}

/** Helper to extract ToolUseCall[] from ContentBlock[]. */
export function extractToolUseCalls(blocks: ContentBlock[]): ToolUseCall[] {
  return blocks
    .filter((b): b is ContentBlock & { type: 'tool_use' } => b.type === 'tool_use')
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));
}
