/**
 * Read tool — reads file contents with line numbers.
 *
 * Ported from gg-framework ReadTool / tama-agent ReadTool.swift.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';
import { readTextFile } from '@tauri-apps/plugin-fs';

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.pdf', '.zip', '.gz', '.tar', '.rar', '.7z', '.bz2', '.xz',
  '.exe', '.dll', '.bin', '.dat', '.so', '.dylib', '.o', '.a',
  '.wasm', '.class', '.pyc', '.pyd', '.pyo',
  '.mp3', '.mp4', '.avi', '.mov', '.wav', '.flac', '.ogg', '.mkv',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.sqlite', '.db', '.mdb',
]);

const LINE_CAP = 2000;
const SIZE_CAP = 50 * 1024; // 50 KB

function isBinaryPath(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.');
  if (dot === -1) return false;
  return BINARY_EXTENSIONS.has(filePath.slice(dot).toLowerCase());
}

function formatLineNumber(n: number): string {
  return String(n).padStart(6, ' ') + '\t';
}

export function createReadTool(): Tool {
  return {
    definition: {
      name: 'read',
      description:
        'Read the contents of a file. Output is line-numbered in cat -n format. ' +
        'Use offset and limit for large files. 2000-line and 50KB caps apply.',
      input_schema: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Absolute path to the file to read',
          },
          offset: {
            type: 'number',
            description: 'Line number to start from (1-based). Defaults to 1.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of lines to return.',
          },
        },
        required: ['file_path'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const filePath = args.file_path as string;
      if (!filePath) return { text: 'Error: file_path is required.' };

      if (isBinaryPath(filePath)) {
        return { text: `Error: "${filePath}" appears to be a binary file.` };
      }

      let raw: string;
      try {
        raw = await readTextFile(filePath);
      } catch (e) {
        return { text: `Error reading file: ${e instanceof Error ? e.message : String(e)}` };
      }

      if (raw.length > SIZE_CAP) {
        return {
          text: `Error: File is ${(raw.length / 1024).toFixed(1)}KB, exceeds 50KB cap. Use offset/limit to read portions.`,
        };
      }

      const allLines = raw.split('\n');
      const offset = Math.max(1, Number(args.offset) || 1);
      const limit = Number(args.limit) || LINE_CAP;
      const cap = Math.min(limit, LINE_CAP);

      const startIdx = offset - 1;
      const endIdx = Math.min(startIdx + cap, allLines.length);
      const slice = allLines.slice(startIdx, endIdx);

      const numbered = slice.map((line, i) => formatLineNumber(startIdx + i + 1) + line);

      let result = numbered.join('\n');
      if (endIdx < allLines.length) {
        result += `\n[...truncated — showing lines ${offset}-${endIdx} of ${allLines.length}]`;
      }

      return { text: result };
    },
  };
}
