/**
 * Agent loop — orchestrates the send → tool_use → execute → tool_result cycle.
 *
 * Ported from AgentLoop.swift.
 */

import type {
  AgentEvent,
  ContentBlock,
  ToolOutput,
  ToolRegistry,
} from '../../types/index.js';
import { ClaudeService } from './claude-service.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_TURNS = 50;
const MAX_OUTPUT_CHARS = 100_000;

// ─── Custom Errors ────────────────────────────────────────────────────────────

/**
 * Thrown when the agent invokes the dismiss tool to close the panel.
 * Carries the conversation so the caller can save state before dismissing.
 */
export class AgentDismissError extends Error {
  readonly conversation: Record<string, unknown>[];
  constructor(conversation: Record<string, unknown>[]) {
    super('Agent dismissed');
    this.name = 'AgentDismissError';
    this.conversation = conversation;
  }
}

/**
 * Thrown when the agent invokes the end_call tool during a voice call.
 * Carries the conversation so the caller can clean up.
 */
export class AgentEndCallError extends Error {
  readonly conversation: Record<string, unknown>[];
  constructor(conversation: Record<string, unknown>[]) {
    super('Agent ended call');
    this.name = 'AgentEndCallError';
    this.conversation = conversation;
  }
}

// ─── Agent Loop ───────────────────────────────────────────────────────────────

type AnyDict = Record<string, unknown>;

export class AgentLoop {
  private service: ClaudeService;
  private registry: ToolRegistry;
  private maxTurns: number;
  private abortController: AbortController | null = null;

  constructor(
    service: ClaudeService,
    registry: ToolRegistry,
    maxTurns: number = MAX_TURNS,
  ) {
    this.service = service;
    this.registry = registry;
    this.maxTurns = maxTurns;
  }

  /** Cancel the current run. */
  cancel(): void {
    this.abortController?.abort();
  }

  /**
   * Run the agent loop with a conversation, streaming events back.
   *
   * Iterates: send messages → check for tool_use → execute tools →
   * build tool_result → repeat. Stops on end_turn, max_turns, or cancellation.
   */
  async run(
    messages: AnyDict[],
    systemPrompt?: string,
    maxTokens?: number,
    onEvent?: (event: AgentEvent) => void,
  ): Promise<AnyDict[]> {
    const emit = onEvent ?? (() => {});
    const conversation = [...messages];
    const tools = this.registry.apiToolDefinitions();
    let accumulatedText = '';

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    for (let turn = 0; turn < this.maxTurns; turn++) {
      signal.throwIfAborted();

      console.info(`Agent loop turn ${turn + 1} — ${conversation.length} msgs`);

      const requestStart = performance.now();
      let firstDeltaAt: number | null = null;
      let deltaCount = 0;

      let response;
      try {
        response = await this.service.sendWithTools(
          conversation,
          tools,
          systemPrompt,
          maxTokens,
          (event) => {
            if (event.type === 'textDelta') {
              if (firstDeltaAt === null) {
                firstDeltaAt = performance.now();
              }
              deltaCount++;
              emit({ type: 'textDelta', text: event.text });
            }
            if (event.type === 'toolUseStart') {
              if (event.name !== 'dismiss') {
                emit({ type: 'toolStart', name: event.name, id: event.id });
              }
            }
          },
          signal,
        );
      } catch (e) {
        const elapsed = Math.round(performance.now() - requestStart);
        console.error(`sendWithTools failed on turn ${turn + 1} after ${elapsed}ms`, e);
        throw e;
      }

      // Log timing
      const totalMs = Math.round(performance.now() - requestStart);
      if (firstDeltaAt !== null) {
        const ttfbMs = Math.round(firstDeltaAt - requestStart);
        console.info(
          `Turn ${turn + 1} done — TTFB ${ttfbMs}ms, total ${totalMs}ms, ${deltaCount} deltas, stop=${response.stopReason ?? 'nil'}`,
        );
      } else {
        console.info(
          `Turn ${turn + 1} done — no text deltas, total ${totalMs}ms, stop=${response.stopReason ?? 'nil'}`,
        );
      }

      // Build the assistant message content for conversation
      const assistantContent = this.buildAssistantContent(response.content);
      const assistantMessage: AnyDict = {
        role: 'assistant',
        content: assistantContent,
      };
      // Preserve reasoning_content for OpenAI-compatible providers
      if (response.reasoningContent) {
        assistantMessage['reasoning_content'] = response.reasoningContent;
      }
      conversation.push(assistantMessage);

      // Accumulate text
      accumulatedText += response.textContent;

      // Continue only if stop_reason is "tool_use" and we have tool calls
      const toolCalls = response.toolUseCalls;
      const shouldContinue = response.stopReason === 'tool_use' && toolCalls.length > 0;

      if (!shouldContinue) {
        emit({ type: 'turnComplete', text: accumulatedText });
        return conversation;
      }

      // Check for dismiss tool
      if (toolCalls.some((tc) => tc.name === 'dismiss')) {
        console.info('Dismiss tool detected — ending agent loop');
        throw new AgentDismissError(conversation);
      }

      // Check for end_call tool
      if (toolCalls.some((tc) => tc.name === 'end_call')) {
        console.info('End call tool detected — ending agent loop');
        throw new AgentEndCallError(conversation);
      }

      // Execute each tool and collect results
      signal.throwIfAborted();
      const toolResults = await this.executeTools(toolCalls, emit);

      // Add tool results as user message
      conversation.push({
        role: 'user',
        content: toolResults,
      });
    }

    // Hit max turns
    console.warn(`Agent loop hit max turns (${this.maxTurns})`);
    emit({ type: 'error', message: `Reached maximum number of turns (${this.maxTurns})` });
    emit({ type: 'turnComplete', text: accumulatedText });
    return conversation;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private buildAssistantContent(blocks: ContentBlock[]): AnyDict[] {
    return blocks.map((block) => {
      switch (block.type) {
        case 'text':
          return { type: 'text', text: block.text };
        case 'tool_use':
          return {
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
          };
        case 'tool_result':
          return {
            type: 'tool_result',
            tool_use_id: block.tool_use_id,
            content: block.content,
          };
      }
    });
  }

  private async executeTools(
    toolCalls: { id: string; name: string; input: Record<string, unknown> }[],
    onEvent: (event: AgentEvent) => void,
  ): Promise<AnyDict[]> {
    const results: AnyDict[] = [];
    const modelSupportsVision = this.service.currentModel.supportsVision;

    for (const call of toolCalls) {
      let toolOutput: ToolOutput;

      // Emit toolRunning with string-coerced args for the UI indicator
      const stringArgs: Record<string, string> = {};
      for (const [key, value] of Object.entries(call.input)) {
        stringArgs[key] = String(value);
      }
      onEvent({ type: 'toolRunning', name: call.name, args: stringArgs });

      const tool = this.registry.tool(call.name);
      if (tool) {
        const startTime = performance.now();
        console.info(`Tool execution start: ${call.name} (args: ${Object.keys(call.input).join(', ')})`);
        try {
          toolOutput = await tool.execute(call.input);
          const durationMs = Math.round(performance.now() - startTime);
          const imgCount = toolOutput.images?.length ?? 0;
          console.info(
            `Tool execution complete: ${call.name} — ${toolOutput.text.length} chars, ${imgCount} images, ${durationMs}ms`,
          );
        } catch (e) {
          const durationMs = Math.round(performance.now() - startTime);
          const errMsg = e instanceof Error ? e.message : String(e);
          console.error(`Tool execution failed: ${call.name} — ${errMsg} (${durationMs}ms)`);
          toolOutput = { text: `Error: ${errMsg}` };
        }
      } else {
        console.warn(`Unknown tool requested: ${call.name}`);
        toolOutput = { text: `Error: Unknown tool '${call.name}'` };
      }

      const truncated = this.truncateOutput(toolOutput.text);
      onEvent({ type: 'toolResult', name: call.name, output: truncated });

      // If the tool produced images and the active model supports vision,
      // emit a tool_result with array content carrying both text and image blocks.
      if (toolOutput.images && toolOutput.images.length > 0 && modelSupportsVision) {
        const content: AnyDict[] = [{ type: 'text', text: truncated }];
        for (const img of toolOutput.images) {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mediaType,
              data: img.data,
            },
          });
        }
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content,
        });
      } else {
        if (toolOutput.images && toolOutput.images.length > 0) {
          console.info(
            `Discarding ${toolOutput.images.length} image(s) from '${call.name}' — model does not support vision`,
          );
        }
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: truncated,
        });
      }
    }

    return results;
  }

  private truncateOutput(output: string, maxChars: number = MAX_OUTPUT_CHARS): string {
    if (output.length <= maxChars) return output;
    return output.slice(0, maxChars) + `\n[...truncated at ${maxChars} chars]`;
  }
}
