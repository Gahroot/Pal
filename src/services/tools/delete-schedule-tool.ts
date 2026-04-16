/**
 * Delete schedule tool — removes a scheduled job by name.
 *
 * Ported from tama-agent DeleteScheduleTool.swift / pocket-agent scheduler-tools.ts.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';
import { scheduleStore } from '../stores/schedule-store.ts';

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

      const removed = await scheduleStore.deleteJob(name);
      if (!removed) {
        return { text: `No schedule named "${name}" found.` };
      }
      return { text: `Schedule "${name}" deleted.` };
    },
  };
}
