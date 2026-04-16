/**
 * List schedules tool — lists all active scheduled jobs.
 *
 * Ported from tama-agent ListSchedulesTool.swift / pocket-agent scheduler-tools.ts.
 * Uses stub schedule-store until Phase 6.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';

export function createListSchedulesTool(): Tool {
  return {
    definition: {
      name: 'list_schedules',
      description: 'List all active scheduled reminders and routines.',
      input_schema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },

    async execute(): Promise<ToolOutput> {
      // TODO: Delegate to schedule-store in Phase 6
      console.warn('[list_schedules] Schedule store not yet implemented.');

      return {
        text: JSON.stringify({ schedules: [], note: 'Schedule store pending Phase 6 implementation.' }, null, 2),
      };
    },
  };
}
