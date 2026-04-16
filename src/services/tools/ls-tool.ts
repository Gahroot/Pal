/**
 * Ls tool — lists directory contents with human-readable sizes.
 *
 * Ported from gg-framework LsTool / tama-agent LsTool.swift.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';
import { readDir, stat } from '@tauri-apps/plugin-fs';

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

export function createLsTool(workingDir: string): Tool {
  return {
    definition: {
      name: 'ls',
      description:
        'List directory contents. Shows directories with "d" prefix and files with "f" prefix and sizes. ' +
        'Directories listed first, both sorted alphabetically.',
      input_schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path to list (defaults to working directory)',
          },
          all: {
            type: 'boolean',
            description: 'Include hidden files/directories (default: false)',
          },
        },
        required: [],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const dirPath = (args.path as string) || workingDir;
      const showAll = Boolean(args.all);

      try {
        const entries = await readDir(dirPath);
        const dirs: string[] = [];
        const files: { name: string; size: number }[] = [];

        for (const entry of entries) {
          const name = entry.name ?? '';
          if (!showAll && name.startsWith('.')) continue;

          if (entry.isDirectory) {
            dirs.push(name);
          } else {
            let size = 0;
            try {
              const sep = dirPath.includes('\\') ? '\\' : '/';
              const info = await stat(dirPath + sep + name);
              size = info.size;
            } catch {
              // ignore stat errors
            }
            files.push({ name, size });
          }
        }

        dirs.sort((a, b) => a.localeCompare(b));
        files.sort((a, b) => a.name.localeCompare(b.name));

        const lines: string[] = [];
        for (const d of dirs) {
          lines.push(`d ${d}/`);
        }
        for (const f of files) {
          lines.push(`f ${f.name} ${humanSize(f.size)}`);
        }

        if (lines.length === 0) {
          return { text: '(empty directory)' };
        }
        return { text: lines.join('\n') };
      } catch (e) {
        return { text: `Error listing directory: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
  };
}
