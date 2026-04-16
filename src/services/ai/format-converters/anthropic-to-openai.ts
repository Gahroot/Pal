/**
 * Convert Anthropic-format messages and tools to OpenAI-compatible format.
 *
 * Ported from ClaudeService.swift convertMessageToOpenAI / convertToolToOpenAI.
 */

// ─── Message Conversion ──────────────────────────────────────────────────────

type AnyDict = Record<string, unknown>;

/**
 * Convert an Anthropic-format message to OpenAI format.
 * Returns an array because one Anthropic message (with multiple tool_results)
 * may expand into multiple OpenAI messages.
 */
export function convertMessageToOpenAI(msg: AnyDict): AnyDict[] {
  const role = msg['role'] as string | undefined;
  if (!role) return [msg];

  // Simple string content — pass through
  if (typeof msg['content'] === 'string') {
    return [{ role, content: msg['content'] }];
  }

  // Array content (Anthropic uses content arrays for tool results)
  const blocks = msg['content'] as AnyDict[] | undefined;
  if (!Array.isArray(blocks)) return [msg];

  // ── Assistant messages with tool_use blocks ──
  if (role === 'assistant') {
    let content = '';
    const toolCalls: AnyDict[] = [];

    for (const block of blocks) {
      const type = block['type'] as string | undefined;
      if (!type) continue;

      if (type === 'text' && typeof block['text'] === 'string') {
        content += block['text'];
      } else if (
        type === 'tool_use' &&
        typeof block['id'] === 'string' &&
        typeof block['name'] === 'string'
      ) {
        let argsStr = '{}';
        try {
          argsStr = JSON.stringify(block['input'] ?? {});
        } catch {
          // keep default
        }
        toolCalls.push({
          id: block['id'],
          type: 'function',
          function: {
            name: block['name'],
            arguments: argsStr,
          },
        });
      }
    }

    const result: AnyDict = { role: 'assistant' };
    if (content) result['content'] = content;
    if (toolCalls.length > 0) result['tool_calls'] = toolCalls;
    // Round-trip reasoning_content if present (for providers with thinking)
    const reasoning = msg['reasoning_content'] as string | undefined;
    if (reasoning) {
      result['reasoning_content'] = reasoning;
    }
    return [result];
  }

  // ── User messages with tool_result blocks ──
  // Each tool_result becomes a separate message.
  // Text and image blocks are grouped together.
  if (role === 'user') {
    const converted: AnyDict[] = [];
    let pendingMixed: AnyDict[] = [];

    function flushPending(): void {
      if (pendingMixed.length === 0) return;
      converted.push({ role: 'user', content: pendingMixed });
      pendingMixed = [];
    }

    for (const block of blocks) {
      const type = block['type'] as string | undefined;
      if (!type) continue;

      if (type === 'text' && typeof block['text'] === 'string') {
        pendingMixed.push({ type: 'text', text: block['text'] });
      } else if (type === 'image') {
        const source = block['source'] as AnyDict | undefined;
        if (source) {
          const mediaType = source['media_type'] as string;
          const data = source['data'] as string;
          if (mediaType && data) {
            pendingMixed.push({
              type: 'image_url',
              image_url: { url: `data:${mediaType};base64,${data}` },
            });
          }
        }
      } else if (type === 'tool_result' && typeof block['tool_use_id'] === 'string') {
        flushPending();
        converted.push(
          ...convertToolResultToOpenAI(
            block['tool_use_id'] as string,
            block['content'],
          ),
        );
      }
    }

    flushPending();
    if (converted.length > 0) return converted;
  }

  return [msg];
}

/**
 * Convert an Anthropic tool_result block's content to an OpenAI role:"tool"
 * message, plus an optional follow-up role:"user" message carrying any image
 * blocks as image_url data URIs.
 */
export function convertToolResultToOpenAI(
  toolUseId: string,
  content: unknown,
): AnyDict[] {
  // Simple string content
  if (typeof content === 'string') {
    return [{ role: 'tool', tool_call_id: toolUseId, content }];
  }

  if (!Array.isArray(content)) return [];
  const parts = content as AnyDict[];

  const textParts: string[] = [];
  const imageParts: AnyDict[] = [];

  for (const part of parts) {
    const type = part['type'] as string | undefined;
    if (!type) continue;
    if (type === 'text' && typeof part['text'] === 'string') {
      textParts.push(part['text']);
    } else if (type === 'image') {
      const source = part['source'] as AnyDict | undefined;
      if (source) {
        const mediaType = source['media_type'] as string;
        const data = source['data'] as string;
        if (mediaType && data) {
          imageParts.push({
            type: 'image_url',
            image_url: { url: `data:${mediaType};base64,${data}` },
          });
        }
      }
    }
  }

  const result: AnyDict[] = [];
  const toolText = textParts.length === 0 ? '' : textParts.join('\n');
  result.push({ role: 'tool', tool_call_id: toolUseId, content: toolText });

  if (imageParts.length > 0) {
    const userContent: AnyDict[] = [
      { type: 'text', text: 'Screenshot attached from the previous tool call.' },
      ...imageParts,
    ];
    result.push({ role: 'user', content: userContent });
  }

  return result;
}

// ─── Tool Definition Conversion ───────────────────────────────────────────────

/**
 * Convert an Anthropic tool definition to OpenAI function calling format.
 */
export function convertToolToOpenAI(tool: AnyDict): AnyDict | null {
  const name = tool['name'] as string | undefined;
  if (!name) return null;

  const fn: AnyDict = { name };
  if (typeof tool['description'] === 'string') {
    fn['description'] = tool['description'];
  }
  if (tool['input_schema'] && typeof tool['input_schema'] === 'object') {
    fn['parameters'] = tool['input_schema'];
  }

  return {
    type: 'function',
    function: fn,
  };
}
