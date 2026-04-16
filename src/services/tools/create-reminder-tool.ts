/**
 * Create reminder tool — schedules a one-time or recurring reminder.
 *
 * Ported from tama-agent CreateReminderTool.swift / pocket-agent scheduler-tools.ts.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';
import { scheduleStore, parseSchedule } from '../stores/schedule-store.ts';

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
            description: 'Cron expression or natural language schedule (e.g., "every day at 9am", "0 9 * * *", "in 10 minutes")',
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

      const parsed = parseSchedule(schedule);
      if (!parsed) {
        return { text: `Error: could not parse schedule "${schedule}".` };
      }

      const job = await scheduleStore.addJob(name, 'reminder', parsed, message);
      const when = job.nextRunAt
        ? new Date(job.nextRunAt).toLocaleString()
        : '(unscheduled)';

      return {
        text: `Reminder "${name}" created. Schedule: ${schedule}. Next run: ${when}.`,
      };
    },
  };
}
