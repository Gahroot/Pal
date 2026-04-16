/**
 * Edit tool — performs exact string replacement in a file.
 *
 * Ported from gg-framework EditTool / tama-agent EditTool.Swift.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

/** Generate a unified diff with N lines of context. */
function unifiedDiff(
  oldText: string,
  newText: string,
  filePath: string,
  contextLines = 3,
): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Simple diff: find first and last differing lines
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
    start++;
  }
  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd--;
    newEnd--;
  }

  const ctxStart = Math.max(0, start - contextLines);
  const ctxOldEnd = Math.min(oldLines.length - 1, oldEnd + contextLines);
  const ctxNewEnd = Math.min(newLines.length - 1, newEnd + contextLines);

  const lines: string[] = [];
  lines.push(`--- a/${filePath}`);
  lines.push(`+++ b/${filePath}`);
  lines.push(`@@ -${ctxStart + 1},${ctxOldEnd - ctxStart + 1} +${ctxStart + 1},${ctxNewEnd - ctxStart + 1} @@`);

  for (let i = ctxStart; i < start; i++) {
    lines.push(` ${oldLines[i]}`);
  }
  for (let i = start; i <= oldEnd; i++) {
    lines.push(`-${oldLines[i]}`);
  }
  for (let i = start; i <= newEnd; i++) {
    lines.push(`+${newLines[i]}`);
  }
  for (let i = oldEnd + 1; i <= ctxOldEnd; i++) {
    lines.push(` ${oldLines[i]}`);
  }

  return lines.join('\n');
}

export function createEditTool(): Tool {
  return {
    definition: {
      name: 'edit',
      description:
        'Replace an exact string in a file. The old_text must appear exactly once. ' +
        'Returns a unified diff showing the change.',
      input_schema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Absolute path to the file to edit',
          },
          old_text: {
            type: 'string',
            description: 'The exact text to find (must occur exactly once)',
          },
          new_text: {
            type: 'string',
            description: 'The replacement text',
          },
        },
        required: ['file_path', 'old_text', 'new_text'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const filePath = args.file_path as string;
      const oldText = args.old_text as string;
      const newText = args.new_text as string;

      if (!filePath) return { text: 'Error: file_path is required.' };
      if (!oldText && oldText !== '') return { text: 'Error: old_text is required.' };
      if (newText === undefined || newText === null) return { text: 'Error: new_text is required.' };

      let content: string;
      try {
        content = await readTextFile(filePath);
      } catch (e) {
        return { text: `Error reading file: ${e instanceof Error ? e.message : String(e)}` };
      }

      // Normalize CRLF to LF
      content = content.replace(/\r\n/g, '\n');
      const normalizedOld = oldText.replace(/\r\n/g, '\n');
      const normalizedNew = newText.replace(/\r\n/g, '\n');

      // Count occurrences
      let count = 0;
      let searchFrom = 0;
      while (true) {
        const idx = content.indexOf(normalizedOld, searchFrom);
        if (idx === -1) break;
        count++;
        searchFrom = idx + 1;
      }

      if (count === 0) {
        return { text: 'Error: old_text not found in file. Make sure it matches exactly, including whitespace.' };
      }
      if (count > 1) {
        return {
          text: `Error: old_text appears ${count} times. It must be unique. Add more surrounding context to disambiguate.`,
        };
      }

      const updated = content.replace(normalizedOld, normalizedNew);

      try {
        await writeTextFile(filePath, updated);
      } catch (e) {
        return { text: `Error writing file: ${e instanceof Error ? e.message : String(e)}` };
      }

      const diff = unifiedDiff(content, updated, filePath);
      return { text: `Successfully edited ${filePath}\n\n${diff}` };
    },
  };
}
