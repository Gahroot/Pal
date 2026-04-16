import { appDataDir, join } from '@tauri-apps/api/path';
import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { v4 as uuidv4 } from 'uuid';
import type { ContentBlock } from '../../types/index.js';

// ─── Models ──────────────────────────────────────────────────────────────────

export type SessionType = 'chat' | 'reminders' | 'routines';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  sessionType: SessionType;
}

export interface DateGroupedSessions {
  today: ChatSession[];
  thisWeek: ChatSession[];
  thisMonth: ChatSession[];
  older: ChatSession[];
}

// ─── Store ───────────────────────────────────────────────────────────────────

class SessionStore {
  private sessions: ChatSession[] = [];
  private sessionsDir = '';

  async init(): Promise<void> {
    const base = await appDataDir();
    this.sessionsDir = await join(base, 'sessions');
    if (!(await exists(this.sessionsDir))) {
      await mkdir(this.sessionsDir, { recursive: true });
    }
    this.sessions = await this.loadAllFromDisk();
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async save(session: ChatSession): Promise<void> {
    session.updatedAt = Date.now();
    const filePath = await join(this.sessionsDir, `${session.id}.json`);
    await writeTextFile(filePath, JSON.stringify(session, null, 2));

    const idx = this.sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      this.sessions[idx] = session;
    } else {
      this.sessions.push(session);
    }
    this.sortSessions();
  }

  async loadAll(): Promise<ChatSession[]> {
    return [...this.sessions];
  }

  session(id: string): ChatSession | undefined {
    return this.sessions.find((s) => s.id === id);
  }

  async delete(id: string): Promise<void> {
    const filePath = await join(this.sessionsDir, `${id}.json`);
    if (await exists(filePath)) {
      await remove(filePath);
    }
    this.sessions = this.sessions.filter((s) => s.id !== id);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  createSession(
    title: string,
    sessionType: SessionType = 'chat',
  ): ChatSession {
    const now = Date.now();
    return {
      id: uuidv4(),
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
      sessionType,
    };
  }

  groupByDate(): DateGroupedSessions {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfToday - now.getDay() * 86_400_000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const groups: DateGroupedSessions = {
      today: [],
      thisWeek: [],
      thisMonth: [],
      older: [],
    };

    for (const s of this.sessions) {
      if (s.updatedAt >= startOfToday) {
        groups.today.push(s);
      } else if (s.updatedAt >= startOfWeek) {
        groups.thisWeek.push(s);
      } else if (s.updatedAt >= startOfMonth) {
        groups.thisMonth.push(s);
      } else {
        groups.older.push(s);
      }
    }
    return groups;
  }

  search(query: string): ChatSession[] {
    const lower = query.toLowerCase();
    return this.sessions.filter((s) => s.title.toLowerCase().includes(lower));
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async loadAllFromDisk(): Promise<ChatSession[]> {
    const entries = await readDir(this.sessionsDir);
    const sessions: ChatSession[] = [];
    for (const entry of entries) {
      if (entry.name?.endsWith('.json')) {
        try {
          const filePath = await join(this.sessionsDir, entry.name);
          const raw = await readTextFile(filePath);
          sessions.push(JSON.parse(raw) as ChatSession);
        } catch {
          // skip corrupted files
        }
      }
    }
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return sessions;
  }

  private sortSessions(): void {
    this.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

export const sessionStore = new SessionStore();
