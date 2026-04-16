import { appDataDir, join } from '@tauri-apps/api/path';
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { v4 as uuidv4 } from 'uuid';
import {
  nextCronRun,
  type ParsedSchedule,
} from '../scheduler/schedule-parser.js';

// ─── Models ──────────────────────────────────────────────────────────────────

export type JobType = 'reminder' | 'routine';
export type ScheduleType = 'at' | 'every' | 'cron';

export interface ScheduledJob {
  id: string;
  name: string;
  jobType: JobType;
  scheduleType: ScheduleType;
  schedule?: string;
  runAt?: number;
  intervalSeconds?: number;
  prompt: string;
  nextRunAt?: number;
  deleteAfterRun: boolean;
  enabled: boolean;
  createdAt: number;
  runCount: number;
}

interface StoreData {
  jobs: ScheduledJob[];
}

// ─── Store ───────────────────────────────────────────────────────────────────

class ScheduleStore {
  private jobs: ScheduledJob[] = [];
  private filePath = '';
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Callback for routine execution (wired to agent loop later). */
  onRoutineTriggered: ((job: ScheduledJob) => void) | null = null;

  async init(): Promise<void> {
    const base = await appDataDir();
    this.filePath = await join(base, 'schedules.json');
    await this.loadFromDisk();
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async addJob(
    name: string,
    jobType: JobType,
    parsed: ParsedSchedule,
    prompt: string,
  ): Promise<ScheduledJob> {
    const now = Date.now();
    const job: ScheduledJob = {
      id: uuidv4(),
      name,
      jobType,
      scheduleType: parsed.type,
      schedule: parsed.schedule,
      runAt: parsed.runAt,
      intervalSeconds: parsed.intervalSeconds,
      prompt,
      nextRunAt: this.calculateInitialNextRun(parsed),
      deleteAfterRun: parsed.type === 'at',
      enabled: true,
      createdAt: now,
      runCount: 0,
    };

    this.jobs.push(job);
    await this.saveToDisk();
    return job;
  }

  async deleteJob(name: string): Promise<boolean> {
    const idx = this.jobs.findIndex(
      (j) => j.name.toLowerCase() === name.toLowerCase(),
    );
    if (idx < 0) return false;
    this.jobs.splice(idx, 1);
    await this.saveToDisk();
    return true;
  }

  async deleteJobById(id: string): Promise<boolean> {
    const idx = this.jobs.findIndex((j) => j.id === id);
    if (idx < 0) return false;
    this.jobs.splice(idx, 1);
    await this.saveToDisk();
    return true;
  }

  listJobs(): ScheduledJob[] {
    return [...this.jobs];
  }

  // ── Polling ──────────────────────────────────────────────────────────────

  start(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.checkDueJobs();
    }, 30_000);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async checkDueJobs(): Promise<void> {
    const now = Date.now();
    const dueJobs = this.jobs.filter(
      (j) => j.enabled && j.nextRunAt != null && j.nextRunAt <= now,
    );

    for (const job of dueJobs) {
      await this.executeJob(job);
      job.runCount += 1;

      if (job.deleteAfterRun) {
        this.jobs = this.jobs.filter((j) => j.id !== job.id);
      } else {
        job.nextRunAt = this.calculateNextRun(job);
      }
    }

    if (dueJobs.length > 0) {
      await this.saveToDisk();
    }
  }

  // ── Next run calculation ─────────────────────────────────────────────────

  calculateNextRun(job: ScheduledJob): number | undefined {
    const now = Date.now();

    switch (job.scheduleType) {
      case 'at':
        // One-shot; no next run
        return undefined;

      case 'every':
        if (job.intervalSeconds) {
          return now + job.intervalSeconds * 1000;
        }
        return undefined;

      case 'cron':
        if (job.schedule) {
          const next = nextCronRun(job.schedule, new Date(now));
          return next?.getTime();
        }
        return undefined;

      default:
        return undefined;
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private calculateInitialNextRun(parsed: ParsedSchedule): number | undefined {
    switch (parsed.type) {
      case 'at':
        return parsed.runAt;

      case 'every':
        if (parsed.intervalSeconds) {
          return Date.now() + parsed.intervalSeconds * 1000;
        }
        return undefined;

      case 'cron':
        if (parsed.schedule) {
          const next = nextCronRun(parsed.schedule);
          return next?.getTime();
        }
        return undefined;

      default:
        return undefined;
    }
  }

  private async executeJob(job: ScheduledJob): Promise<void> {
    if (job.jobType === 'reminder') {
      await this.sendReminderNotification(job);
    } else if (job.jobType === 'routine') {
      this.onRoutineTriggered?.(job);
    }
  }

  private async sendReminderNotification(job: ScheduledJob): Promise<void> {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === 'granted';
    }
    if (granted) {
      sendNotification({ title: job.name, body: job.prompt });
    }
  }

  private async loadFromDisk(): Promise<void> {
    if (!(await exists(this.filePath))) {
      this.jobs = [];
      return;
    }
    try {
      const raw = await readTextFile(this.filePath);
      const data = JSON.parse(raw) as StoreData;
      this.jobs = data.jobs ?? [];
    } catch {
      this.jobs = [];
    }
  }

  private async saveToDisk(): Promise<void> {
    const data: StoreData = { jobs: this.jobs };
    await writeTextFile(this.filePath, JSON.stringify(data, null, 2));
  }
}

export const scheduleStore = new ScheduleStore();
export type { ParsedSchedule } from '../scheduler/schedule-parser.js';
export { parseSchedule } from '../scheduler/schedule-parser.js';
