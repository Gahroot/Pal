// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedSchedule {
  type: 'at' | 'every' | 'cron';
  /** Cron expression (only for type === 'cron'). */
  schedule?: string;
  /** Absolute timestamp for one-shot schedules (type === 'at'). */
  runAt?: number;
  /** Interval in seconds for recurring schedules (type === 'every'). */
  intervalSeconds?: number;
}

// ─── Duration helpers ────────────────────────────────────────────────────────

const DURATION_RE = /^(\d+)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?)$/i;

function parseDurationSeconds(input: string): number | null {
  const match = input.trim().match(DURATION_RE);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  if (unit.startsWith('s')) return value;
  if (unit.startsWith('m')) return value * 60;
  if (unit.startsWith('h')) return value * 3600;
  if (unit.startsWith('d')) return value * 86_400;
  return null;
}

// ─── Cron helpers ────────────────────────────────────────────────────────────

const CRON_RE = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)$/;

function isCron(input: string): boolean {
  return CRON_RE.test(input.trim());
}

export function matchesCronField(field: string, value: number): boolean {
  if (field === '*') return true;

  for (const part of field.split(',')) {
    // Step: */N or N-M/S
    if (part.includes('/')) {
      const [rangePart, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) continue;

      let start = 0;
      let end = 59;

      if (rangePart !== '*') {
        if (rangePart.includes('-')) {
          const [lo, hi] = rangePart.split('-').map(Number);
          start = lo;
          end = hi;
        } else {
          start = parseInt(rangePart, 10);
        }
      }

      for (let i = start; i <= end; i += step) {
        if (i === value) return true;
      }
      continue;
    }

    // Range: N-M
    if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number);
      if (value >= lo && value <= hi) return true;
      continue;
    }

    // Exact value
    if (parseInt(part, 10) === value) return true;
  }

  return false;
}

export function nextCronRun(cron: string, from: Date = new Date()): Date | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;

  // Iterate minute-by-minute up to 48 hours
  const maxMinutes = 48 * 60;
  const candidate = new Date(from);
  // Start from the next minute
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  for (let i = 0; i < maxMinutes; i++) {
    const m = candidate.getMinutes();
    const h = candidate.getHours();
    const dom = candidate.getDate();
    const mon = candidate.getMonth() + 1; // cron months are 1-12
    const dow = candidate.getDay(); // 0=Sunday

    if (
      matchesCronField(minute, m) &&
      matchesCronField(hour, h) &&
      matchesCronField(dayOfMonth, dom) &&
      matchesCronField(month, mon) &&
      matchesCronField(dayOfWeek, dow)
    ) {
      return new Date(candidate);
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  return null;
}

// ─── Relative time helpers ───────────────────────────────────────────────────

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

function parseTimeOfDay(input: string): { hours: number; minutes: number } | null {
  // Match "3pm", "3:30pm", "15:00", "9am"
  const match = input.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3]?.toLowerCase();

  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

function parseRelativeDateTime(input: string): number | null {
  const parts = input.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return null;

  const now = new Date();
  const dayPart = parts[0];
  const timePart = parts.slice(1).join('');

  const time = parseTimeOfDay(timePart);
  if (!time) return null;

  const target = new Date(now);
  target.setHours(time.hours, time.minutes, 0, 0);

  if (dayPart === 'today') {
    if (target.getTime() <= now.getTime()) return null; // already passed
    return target.getTime();
  }

  if (dayPart === 'tomorrow') {
    target.setDate(target.getDate() + 1);
    return target.getTime();
  }

  const weekday = WEEKDAYS[dayPart];
  if (weekday !== undefined) {
    const currentDay = now.getDay();
    let daysAhead = weekday - currentDay;
    if (daysAhead <= 0) daysAhead += 7;
    target.setDate(target.getDate() + daysAhead);
    return target.getTime();
  }

  return null;
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseSchedule(input: string): ParsedSchedule | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 5-field cron expression
  if (isCron(trimmed)) {
    return { type: 'cron', schedule: trimmed };
  }

  // "every 30m", "every 2h"
  const everyMatch = trimmed.match(/^every\s+(.+)$/i);
  if (everyMatch) {
    const secs = parseDurationSeconds(everyMatch[1]);
    if (secs !== null) {
      return { type: 'every', intervalSeconds: secs };
    }
  }

  // "in X minutes/hours"
  const inMatch = trimmed.match(/^in\s+(.+)$/i);
  if (inMatch) {
    const secs = parseDurationSeconds(inMatch[1]);
    if (secs !== null) {
      return { type: 'at', runAt: Date.now() + secs * 1000 };
    }
  }

  // Bare duration: "30m", "2h", "1d" → one-shot
  const bareSecs = parseDurationSeconds(trimmed);
  if (bareSecs !== null) {
    return { type: 'at', runAt: Date.now() + bareSecs * 1000 };
  }

  // Relative: "tomorrow 3pm", "today 9am", "monday 2pm"
  const relativeTs = parseRelativeDateTime(trimmed);
  if (relativeTs !== null) {
    return { type: 'at', runAt: relativeTs };
  }

  return null;
}
