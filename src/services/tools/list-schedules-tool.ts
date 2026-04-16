/**
 * List schedules tool — lists all active scheduled jobs.
 *
 * Ported from tama-agent ListSchedulesTool.swift / pocket-agent scheduler-tools.ts.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';
import { scheduleStore } from '../stores/schedule-store.ts';

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
      const jobs = scheduleStore.listJobs();

      const view = jobs.map((j) => ({
        id: j.id,
        name: j.name,
        type: j.jobType,
        schedule: j.schedule ?? (j.runAt ? new Date(j.runAt).toISOString() : undefined),
        nextRun: j.nextRunAt ? new Date(j.nextRunAt).toISOString() : null,
        enabled: j.enabled,
        runCount: j.runCount,
      }));

      if (view.length === 0) {
        return { text: 'No active schedules.' };
      }

      return { text: JSON.stringify({ schedules: view }, null, 2) };
    },
  };
}
