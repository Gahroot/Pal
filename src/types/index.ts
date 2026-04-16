// ─── AI Provider Types ────────────────────────────────────────────────────────

/** Supported AI providers. */
export type AIProvider = 'moonshot' | 'xiaomi' | 'minimax' | 'glm';

/** API format used by a provider. */
export type APIFormat = 'openai' | 'anthropic';

/** How the provider expects authentication headers. */
export type AuthHeaderStyle = 'bearer' | 'x-api-key';

/** Static configuration for a provider. */
export interface ProviderConfig {
  displayName: string;
  baseURL: string;
  apiFormat: APIFormat;
  authHeaderStyle: AuthHeaderStyle;
  /** Whether the provider accepts a `thinking: {type: "disabled"}` body param. */
  usesCustomThinkingParam: boolean;
}

/** Information about a single model. */
export interface ModelInfo {
  id: string;
  name: string;
  provider: AIProvider;
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
}

// ─── Content & Message Types ──────────────────────────────────────────────────

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | ContentBlock[] };

/** A single tool use call extracted from a response. */
export interface ToolUseCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Structured response from an API call. */
export interface ClaudeResponse {
  content: ContentBlock[];
  stopReason: string | null;
  /** Accumulated reasoning content (Moonshot). */
  reasoningContent?: string;
  /** Convenience: all text blocks joined. */
  textContent: string;
  /** Convenience: extracted tool_use calls. */
  toolUseCalls: ToolUseCall[];
}

/** A conversation message in Anthropic format. */
export interface Message {
  role: 'user' | 'assistant';
  content: ContentBlock[] | string;
  /** Round-tripped reasoning from OpenAI-compatible providers. */
  reasoning_content?: string;
}

// ─── Streaming Types ──────────────────────────────────────────────────────────

export type StreamEvent =
  | { type: 'textDelta'; text: string }
  | { type: 'toolUseStart'; name: string; id: string };

export type StreamEventCallback = (event: StreamEvent) => void;

// ─── Agent Types ──────────────────────────────────────────────────────────────

export type AgentEvent =
  | { type: 'textDelta'; text: string }
  | { type: 'toolStart'; name: string; id: string }
  | { type: 'toolRunning'; name: string; args: Record<string, string> }
  | { type: 'toolResult'; name: string; output: string }
  | { type: 'turnComplete'; text: string }
  | { type: 'error'; message: string };

// ─── Tool Types ───────────────────────────────────────────────────────────────

/** Tool definition in Anthropic format (used as the canonical format). */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Image attachment from tool output. */
export interface ToolImage {
  data: string;
  mediaType: string;
}

/** Output from executing a tool. */
export interface ToolOutput {
  text: string;
  images?: ToolImage[];
}

/** A tool that can be executed by the agent. */
export interface Tool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>): Promise<ToolOutput>;
}

/** Registry of available tools. */
export interface ToolRegistry {
  tools: Tool[];
  tool(name: string): Tool | undefined;
  apiToolDefinitions(): Record<string, unknown>[];
}
