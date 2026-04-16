/**
 * Grep tool — searches file contents using regex patterns.
 *
 * Ported from gg-framework GrepTool / tama-agent GrepTool.swift.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';
import { readDir, readTextFile, stat } from '@tauri-apps/plugin-fs';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_RESULTS = 50;
const MAX_LINE_LENGTH = 500;

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
  '.pdf', '.zip', '.gz', '.tar', '.rar', '.7z',
  '.exe', '.dll', '.bin', '.dat', '.so', '.dylib',
  '.mp3', '.mp4', '.avi', '.mov', '.wav',
  '.ttf', '.otf', '.woff', '.woff2',
  '.sqlite', '.db',
]);

const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.svn', '.hg']);

function isBinaryFile(name: string): boolean {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return false;
  return BINARY_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

/** Simple glob match for include filter (e.g. "*.ts") */
function matchGlob(pattern: string, filename: string): boolean {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp('^' + regex + '$', 'i').test(filename);
}

interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

async function searchDir(
  basePath: string,
  relativePath: string,
  regex: RegExp,
  matches: GrepMatch[],
  maxResults: number,
  include: string | null,
): Promise<void> {
  if (matches.length >= maxResults) return;

  const sep = basePath.includes('\\') ? '\\' : '/';
  const fullPath = relativePath ? basePath + sep + relativePath : basePath;

  let entries;
  try {
    entries = await readDir(fullPath);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (matches.length >= maxResults) return;
    const name = entry.name ?? '';
    const rel = relativePath ? relativePath + sep + name : name;

    if (entry.isDirectory) {
      if (SKIP_DIRS.has(name)) continue;
      await searchDir(basePath, rel, regex, matches, maxResults, include);
    } else {
      if (isBinaryFile(name)) continue;
      if (include && !matchGlob(include, name)) continue;

      const fileFull = basePath + sep + rel;
      try {
        const info = await stat(fileFull);
        if (info.size > MAX_FILE_SIZE) continue;
      } catch {
        continue;
      }

      let content: string;
      try {
        content = await readTextFile(fileFull);
      } catch {
        continue;
      }

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= maxResults) break;
        if (regex.test(lines[i])) {
          const truncated = lines[i].length > MAX_LINE_LENGTH
            ? lines[i].slice(0, MAX_LINE_LENGTH) + '...'
            : lines[i];
          matches.push({ file: rel, line: i + 1, content: truncated });
        }
        // Reset regex lastIndex for global regexes
        regex.lastIndex = 0;
      }
    }
  }
}

export function createGrepTool(workingDir: string): Tool {
  return {
    definition: {
      name: 'grep',
      description:
        'Search file contents using regex. Skips binary files, .git directories, and files > 10MB. ' +
        'Returns filepath:line_number:content format.',
      input_schema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Regular expression pattern to search for',
          },
          path: {
            type: 'string',
            description: 'Directory to search in (defaults to working directory)',
          },
          include: {
            type: 'string',
            description: 'Glob pattern to filter files (e.g., "*.ts")',
          },
          max_results: {
            type: 'number',
            description: 'Maximum number of results (default: 50)',
          },
          case_insensitive: {
            type: 'boolean',
            description: 'Case-insensitive search (default: false)',
          },
        },
        required: ['pattern'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const pattern = args.pattern as string;
      if (!pattern) return { text: 'Error: pattern is required.' };

      const searchPath = (args.path as string) || workingDir;
      const maxResults = Number(args.max_results) || DEFAULT_MAX_RESULTS;
      const caseInsensitive = Boolean(args.case_insensitive);
      const include = (args.include as string) || null;

      let regex: RegExp;
      try {
        regex = new RegExp(pattern, caseInsensitive ? 'i' : '');
      } catch (e) {
        return { text: `Error: Invalid regex pattern: ${e instanceof Error ? e.message : String(e)}` };
      }

      const matches: GrepMatch[] = [];
      try {
        await searchDir(searchPath, '', regex, matches, maxResults, include);
      } catch (e) {
        return { text: `Error searching: ${e instanceof Error ? e.message : String(e)}` };
      }

      if (matches.length === 0) {
        return { text: 'No matches found.' };
      }

      const lines = matches.map((m) => `${m.file}:${m.line}:${m.content}`);
      let output = lines.join('\n');
      if (matches.length >= maxResults) {
        output += `\n[...truncated at ${maxResults} results]`;
      }
      return { text: output };
    },
  };
}
