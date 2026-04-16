/**
 * Dismiss tool — signals the agent loop to close the panel.
 *
 * The agent loop catches the dismiss tool call and throws AgentDismissError.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';

export function createDismissTool(): Tool {
  return {
    definition: {
      name: 'dismiss',
      description: 'Dismiss the assistant panel. Use when the user is done and wants to close the interface.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },

    async execute(): Promise<ToolOutput> {
      return { text: 'Panel dismissed.' };
    },
  };
}
