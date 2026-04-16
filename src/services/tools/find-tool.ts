/**
 * Find tool — recursively finds files matching a glob pattern.
 *
 * Ported from gg-framework FindTool / tama-agent FindTool.swift.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';
import { readDir } from '@tauri-apps/plugin-fs';

const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.svn', '.hg',
  'dist', 'build', 'out', 'target',
]);

const MAX_RESULTS = 100;

/** Simple glob matching: supports *, **, ? */
function globMatch(pattern: string, path: string): boolean {
  // Convert glob to regex
  let regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/\\\\]*')
    .replace(/\?/g, '[^/\\\\]')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*');
  // If pattern has no path separators, match just the filename
  if (!pattern.includes('/') && !pattern.includes('\\')) {
    regex = '(?:^|[\\\\/])' + regex + '$';
  } else {
    regex = regex + '$';
  }
  return new RegExp(regex, 'i').test(path);
}

async function walkDir(
  basePath: string,
  relativePath: string,
  results: string[],
  pattern: string,
): Promise<void> {
  if (results.length >= MAX_RESULTS) return;

  const sep = basePath.includes('\\') ? '\\' : '/';
  const fullPath = relativePath ? basePath + sep + relativePath : basePath;

  let entries;
  try {
    entries = await readDir(fullPath);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= MAX_RESULTS) return;

    const name = entry.name ?? '';
    const rel = relativePath ? relativePath + sep + name : name;

    if (entry.isDirectory) {
      if (SKIP_DIRS.has(name)) continue;
      await walkDir(basePath, rel, results, pattern);
    } else {
      if (globMatch(pattern, rel)) {
        results.push(rel);
      }
    }
  }
}

export function createFindTool(workingDir: string): Tool {
  return {
    definition: {
      name: 'find',
      description:
        'Find files matching a glob pattern. Recursively searches directories, ' +
        'skipping node_modules, .git, __pycache__, dist, build, out, target. ' +
        'Returns up to 100 results.',
      input_schema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern to match (e.g., "*.ts", "**/*.json")',
          },
          path: {
            type: 'string',
            description: 'Directory to search in (defaults to working directory)',
          },
        },
        required: ['pattern'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const pattern = args.pattern as string;
      if (!pattern) return { text: 'Error: pattern is required.' };

      const searchPath = (args.path as string) || workingDir;
      const results: string[] = [];

      try {
        await walkDir(searchPath, '', results, pattern);
      } catch (e) {
        return { text: `Error searching: ${e instanceof Error ? e.message : String(e)}` };
      }

      results.sort();

      if (results.length === 0) {
        return { text: 'No files found matching pattern.' };
      }

      let output = results.join('\n');
      if (results.length >= MAX_RESULTS) {
        output += `\n[...truncated at ${MAX_RESULTS} results]`;
      }
      return { text: output };
    },
  };
}
