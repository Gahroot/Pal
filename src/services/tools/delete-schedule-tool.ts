/**
 * Delete schedule tool — removes a scheduled job by name.
 *
 * Ported from tama-agent DeleteScheduleTool.swift / pocket-agent scheduler-tools.ts.
 * Uses stub schedule-store until Phase 6.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';

export function createDeleteScheduleTool(): Tool {
  return {
    definition: {
      name: 'delete_schedule',
      description: 'Delete a scheduled reminder or routine by name.',
      input_schema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Name of the schedule to delete',
          },
        },
        required: ['name'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const name = args.name as string;
      if (!name) return { text: 'Error: name is required.' };

      // TODO: Delegate to schedule-store in Phase 6
      console.warn('[delete_schedule] Schedule store not yet implemented.');

      return {
        text: `Schedule "${name}" deletion requested. (Note: Schedule store pending Phase 6 implementation.)`,
      };
    },
  };
}
