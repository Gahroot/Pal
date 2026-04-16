/**
 * Bash tool — executes shell commands via Rust backend.
 *
 * Ported from gg-framework BashTool / tama-agent BashTool.swift.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';
import { invoke } from '@tauri-apps/api/core';

const DEFAULT_TIMEOUT = 120_000; // 120 seconds

interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function createBashTool(workingDir: string): Tool {
  return {
    definition: {
      name: 'bash',
      description:
        'Execute a shell command. Returns exit code and output. ' +
        'Commands run in the working directory with a default timeout of 120 seconds.',
      input_schema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute',
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 120000)',
          },
        },
        required: ['command'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const command = args.command as string;
      if (!command) return { text: 'Error: command is required.' };

      const timeoutMs = Number(args.timeout) || DEFAULT_TIMEOUT;

      try {
        const result = await invoke<ShellResult>('execute_shell', {
          command,
          timeoutMs: timeoutMs,
          workingDirectory: workingDir,
        });

        const parts: string[] = [];
        if (result.timedOut) {
          parts.push(`[Timed out after ${timeoutMs}ms]`);
        }
        parts.push(`Exit code: ${result.exitCode}`);

        const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
        if (output) {
          parts.push(output);
        }

        return { text: parts.join('\n') };
      } catch (e) {
        return { text: `Error executing command: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
  };
}
