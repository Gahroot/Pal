/**
 * Task tool — manages task lists with items.
 *
 * Ported from tama-agent TaskTool.swift.
 * Uses stub task-store until Phase 6.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';

function generateId(): string {
  return crypto.randomUUID();
}

interface TaskItem {
  id: string;
  text: string;
  checked: boolean;
}

interface Task {
  id: string;
  title: string;
  items: TaskItem[];
}

// In-memory stub store until Phase 6
const tasks = new Map<string, Task>();

function findTaskByTitle(title: string): Task | undefined {
  const lower = title.toLowerCase();
  for (const task of tasks.values()) {
    if (task.title.toLowerCase() === lower) return task;
  }
  return undefined;
}

function findItemByText(items: TaskItem[], text: string): TaskItem | undefined {
  const lower = text.toLowerCase();
  return items.find((item) => item.text.toLowerCase() === lower);
}

export function createTaskTool(): Tool {
  return {
    definition: {
      name: 'task',
      description:
        'Manage task lists. Supports create, update, and delete actions. ' +
        'Items can be added, removed, checked, or unchecked. Case-insensitive matching.',
      input_schema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['create', 'update', 'delete'],
            description: 'Action to perform',
          },
          title: {
            type: 'string',
            description: 'Task list title (used for identification)',
          },
          items: {
            type: 'array',
            items: { type: 'string' },
            description: 'Items to set (for create action)',
          },
          add_items: {
            type: 'array',
            items: { type: 'string' },
            description: 'Items to add (for update action)',
          },
          remove_items: {
            type: 'array',
            items: { type: 'string' },
            description: 'Items to remove (for update action)',
          },
          check_items: {
            type: 'array',
            items: { type: 'string' },
            description: 'Items to check off (for update action)',
          },
          uncheck_items: {
            type: 'array',
            items: { type: 'string' },
            description: 'Items to uncheck (for update action)',
          },
        },
        required: ['action', 'title'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const action = args.action as string;
      const title = args.title as string;

      if (!action) return { text: 'Error: action is required.' };
      if (!title) return { text: 'Error: title is required.' };

      switch (action) {
        case 'create': {
          if (findTaskByTitle(title)) {
            return { text: `Error: Task "${title}" already exists. Use update to modify it.` };
          }
          const items = (args.items as string[]) || [];
          const task: Task = {
            id: generateId(),
            title,
            items: items.map((text) => ({ id: generateId(), text, checked: false })),
          };
          tasks.set(task.id, task);
          return { text: `Task "${title}" created with ${items.length} items.` };
        }

        case 'update': {
          const task = findTaskByTitle(title);
          if (!task) {
            return { text: `Error: Task "${title}" not found.` };
          }

          const addItems = (args.add_items as string[]) || [];
          const removeItems = (args.remove_items as string[]) || [];
          const checkItems = (args.check_items as string[]) || [];
          const uncheckItems = (args.uncheck_items as string[]) || [];

          for (const text of addItems) {
            task.items.push({ id: generateId(), text, checked: false });
          }

          for (const text of removeItems) {
            const item = findItemByText(task.items, text);
            if (item) {
              task.items = task.items.filter((i) => i.id !== item.id);
            }
          }

          for (const text of checkItems) {
            const item = findItemByText(task.items, text);
            if (item) item.checked = true;
          }

          for (const text of uncheckItems) {
            const item = findItemByText(task.items, text);
            if (item) item.checked = false;
          }

          const summary = [
            addItems.length ? `+${addItems.length} added` : '',
            removeItems.length ? `-${removeItems.length} removed` : '',
            checkItems.length ? `${checkItems.length} checked` : '',
            uncheckItems.length ? `${uncheckItems.length} unchecked` : '',
          ]
            .filter(Boolean)
            .join(', ');

          return { text: `Task "${title}" updated. ${summary || 'No changes.'}` };
        }

        case 'delete': {
          const task = findTaskByTitle(title);
          if (!task) {
            return { text: `Error: Task "${title}" not found.` };
          }
          tasks.delete(task.id);
          return { text: `Task "${title}" deleted.` };
        }

        default:
          return { text: `Error: Unknown action "${action}". Use create, update, or delete.` };
      }
    },
  };
}
