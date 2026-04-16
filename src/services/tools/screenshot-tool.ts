/**
 * Screenshot tool — captures a screenshot via Rust backend.
 *
 * Ported from tama-agent ScreenshotTool.swift.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';
import { invoke } from '@tauri-apps/api/core';

interface ScreenshotResult {
  base64: string;
  width: number;
  height: number;
}

export function createScreenshotTool(): Tool {
  return {
    definition: {
      name: 'screenshot',
      description:
        'Capture a screenshot of the screen. Returns a base64-encoded image.',
      input_schema: {
        type: 'object',
        properties: {
          display: {
            type: 'number',
            description: 'Display index (default: 0)',
          },
          format: {
            type: 'string',
            enum: ['png', 'jpeg'],
            description: 'Image format (default: png)',
          },
          quality: {
            type: 'number',
            description: 'JPEG quality 1-100 (default: 80)',
          },
        },
        required: [],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const display = Number(args.display) || 0;
      const format = (args.format as string) || 'png';
      const quality = Number(args.quality) || 80;

      try {
        const result = await invoke<ScreenshotResult>('capture_screenshot', {
          display,
          format,
          quality,
        });

        const mediaType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        return {
          text: `Screenshot captured (${result.width}x${result.height}, ${format})`,
          images: [
            {
              data: result.base64,
              mediaType,
            },
          ],
        };
      } catch (e) {
        return {
          text: `Error capturing screenshot: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    },
  };
}
