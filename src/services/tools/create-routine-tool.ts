/**
 * Create routine tool — schedules a recurring AI prompt execution.
 *
 * Ported from tama-agent CreateRoutineTool.swift / pocket-agent scheduler-tools.ts.
 * Uses stub schedule-store until Phase 6.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';

export function createCreateRoutineTool(): Tool {
  return {
    definition: {
      name: 'create_routine',
      description:
        'Create a scheduled routine. A routine executes an AI prompt at the specified schedule.',
      input_schema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Unique name for the routine',
          },
          schedule: {
            type: 'string',
            description: 'Cron expression or natural language schedule (e.g., "every weekday at 9am")',
          },
          prompt: {
            type: 'string',
            description: 'The AI prompt to execute on schedule',
          },
        },
        required: ['name', 'schedule', 'prompt'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const name = args.name as string;
      const schedule = args.schedule as string;
      const prompt = args.prompt as string;

      if (!name) return { text: 'Error: name is required.' };
      if (!schedule) return { text: 'Error: schedule is required.' };
      if (!prompt) return { text: 'Error: prompt is required.' };

      // TODO: Delegate to schedule-store in Phase 6
      console.warn('[create_routine] Schedule store not yet implemented. Routine not persisted.');

      return {
        text: `Routine "${name}" created.\nSchedule: ${schedule}\nPrompt: ${prompt}\n(Note: Schedule store pending — routine will not persist across restarts.)`,
      };
    },
  };
}
