/**
 * Create reminder tool — schedules a one-time or recurring reminder.
 *
 * Ported from tama-agent CreateReminderTool.swift / pocket-agent scheduler-tools.ts.
 * Uses stub schedule-store until Phase 6.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';

export function createCreateReminderTool(): Tool {
  return {
    definition: {
      name: 'create_reminder',
      description:
        'Create a scheduled reminder. The reminder will trigger a notification at the specified time.',
      input_schema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Unique name for the reminder',
          },
          schedule: {
            type: 'string',
            description: 'Cron expression or natural language schedule (e.g., "every day at 9am", "0 9 * * *")',
          },
          message: {
            type: 'string',
            description: 'The reminder message to display',
          },
        },
        required: ['name', 'schedule', 'message'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const name = args.name as string;
      const schedule = args.schedule as string;
      const message = args.message as string;

      if (!name) return { text: 'Error: name is required.' };
      if (!schedule) return { text: 'Error: schedule is required.' };
      if (!message) return { text: 'Error: message is required.' };

      // TODO: Delegate to schedule-store in Phase 6
      console.warn('[create_reminder] Schedule store not yet implemented. Reminder not persisted.');

      return {
        text: `Reminder "${name}" created.\nSchedule: ${schedule}\nMessage: ${message}\n(Note: Schedule store pending — reminder will not persist across restarts.)`,
      };
    },
  };
}
