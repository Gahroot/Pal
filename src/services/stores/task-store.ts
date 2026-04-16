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

// ─── Models ──────────────────────────────────────────────────────────────────

export interface TaskItem {
  id: string;
  title: string;
  isCompleted: boolean;
}

export interface TaskList {
  id: string;
  title: string;
  items: TaskItem[];
  createdAt: number;
  updatedAt: number;
}

export interface DateGroupedTasks {
  today: TaskList[];
  thisWeek: TaskList[];
  thisMonth: TaskList[];
  older: TaskList[];
}

// ─── Store ───────────────────────────────────────────────────────────────────

class TaskStore {
  private taskLists: TaskList[] = [];
  private tasksDir = '';

  async init(): Promise<void> {
    const base = await appDataDir();
    this.tasksDir = await join(base, 'tasks');
    if (!(await exists(this.tasksDir))) {
      await mkdir(this.tasksDir, { recursive: true });
    }
    this.taskLists = await this.loadAllFromDisk();
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async save(taskList: TaskList): Promise<void> {
    taskList.updatedAt = Date.now();
    const filePath = await join(this.tasksDir, `${taskList.id}.json`);
    await writeTextFile(filePath, JSON.stringify(taskList, null, 2));

    const idx = this.taskLists.findIndex((t) => t.id === taskList.id);
    if (idx >= 0) {
      this.taskLists[idx] = taskList;
    } else {
      this.taskLists.push(taskList);
    }
    this.sortTaskLists();
  }

  async loadAll(): Promise<TaskList[]> {
    return [...this.taskLists];
  }

  taskList(id: string): TaskList | undefined {
    return this.taskLists.find((t) => t.id === id);
  }

  async delete(id: string): Promise<void> {
    const filePath = await join(this.tasksDir, `${id}.json`);
    if (await exists(filePath)) {
      await remove(filePath);
    }
    this.taskLists = this.taskLists.filter((t) => t.id !== id);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  createTaskList(title: string): TaskList {
    const now = Date.now();
    return {
      id: uuidv4(),
      title,
      items: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  createTaskItem(title: string): TaskItem {
    return {
      id: uuidv4(),
      title,
      isCompleted: false,
    };
  }

  groupByDate(): DateGroupedTasks {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfToday - now.getDay() * 86_400_000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const groups: DateGroupedTasks = {
      today: [],
      thisWeek: [],
      thisMonth: [],
      older: [],
    };

    for (const t of this.taskLists) {
      if (t.updatedAt >= startOfToday) {
        groups.today.push(t);
      } else if (t.updatedAt >= startOfWeek) {
        groups.thisWeek.push(t);
      } else if (t.updatedAt >= startOfMonth) {
        groups.thisMonth.push(t);
      } else {
        groups.older.push(t);
      }
    }
    return groups;
  }

  search(query: string): TaskList[] {
    const lower = query.toLowerCase();
    return this.taskLists.filter((t) => t.title.toLowerCase().includes(lower));
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async loadAllFromDisk(): Promise<TaskList[]> {
    const entries = await readDir(this.tasksDir);
    const lists: TaskList[] = [];
    for (const entry of entries) {
      if (entry.name?.endsWith('.json')) {
        try {
          const filePath = await join(this.tasksDir, entry.name);
          const raw = await readTextFile(filePath);
          lists.push(JSON.parse(raw) as TaskList);
        } catch {
          // skip corrupted files
        }
      }
    }
    lists.sort((a, b) => b.updatedAt - a.updatedAt);
    return lists;
  }

  private sortTaskLists(): void {
    this.taskLists.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

export const taskStore = new TaskStore();
