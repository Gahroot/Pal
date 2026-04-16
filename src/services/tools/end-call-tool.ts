/**
 * End call tool — signals the agent loop to end an active voice call.
 *
 * The agent loop catches the end_call tool call and throws AgentEndCallError.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';

export function createEndCallTool(): Tool {
  return {
    definition: {
      name: 'end_call',
      description: 'End the current voice call. Use when the conversation is complete.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },

    async execute(): Promise<ToolOutput> {
      return { text: 'Call ending.' };
    },
  };
}
