/**
 * Write tool — writes content to a file, creating parent directories as needed.
 *
 * Ported from gg-framework WriteTool / tama-agent WriteTool.swift.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';
import { writeTextFile, mkdir } from '@tauri-apps/plugin-fs';

function parentDir(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/';
  const parts = filePath.split(sep);
  parts.pop();
  return parts.join(sep);
}

export function createWriteTool(): Tool {
  return {
    definition: {
      name: 'write',
      description:
        'Write content to a file. Creates parent directories if they do not exist. Overwrites any existing file.',
      input_schema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Absolute path to the file to write',
          },
          content: {
            type: 'string',
            description: 'The full content to write to the file',
          },
        },
        required: ['file_path', 'content'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const filePath = args.file_path as string;
      const content = args.content as string;

      if (!filePath) return { text: 'Error: file_path is required.' };
      if (content === undefined || content === null) {
        return { text: 'Error: content is required.' };
      }

      try {
        const parent = parentDir(filePath);
        if (parent) {
          await mkdir(parent, { recursive: true });
        }
        await writeTextFile(filePath, content);
        const lineCount = content.split('\n').length;
        const bytes = new TextEncoder().encode(content).length;
        return { text: `Wrote ${bytes} bytes (${lineCount} lines) to ${filePath}` };
      } catch (e) {
        return { text: `Error writing file: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
  };
}
