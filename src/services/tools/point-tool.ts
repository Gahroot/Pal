/**
 * Point tool — points at a location on screen with a visual indicator.
 *
 * Ported from tama-agent PointTool.swift.
 * Note: Overlay window implementation will be added later.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';

export function createPointTool(): Tool {
  return {
    definition: {
      name: 'point',
      description:
        'Point at a location on screen. Coordinates are normalized 0-1 range. ' +
        'Visual overlay implementation pending.',
      input_schema: {
        type: 'object',
        properties: {
          x: {
            type: 'number',
            description: 'Horizontal position (0-1, left to right)',
          },
          y: {
            type: 'number',
            description: 'Vertical position (0-1, top to bottom)',
          },
          display: {
            type: 'number',
            description: 'Display index (default: 0)',
          },
          label: {
            type: 'string',
            description: 'Label text to show at the point',
          },
          pulse: {
            type: 'boolean',
            description: 'Whether to pulse the indicator (default: true)',
          },
          hold_seconds: {
            type: 'number',
            description: 'How long to show the indicator (default: 8)',
          },
        },
        required: ['x', 'y'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const x = Number(args.x);
      const y = Number(args.y);

      if (x < 0 || x > 1 || isNaN(x)) {
        return { text: 'Error: x must be between 0 and 1.' };
      }
      if (y < 0 || y > 1 || isNaN(y)) {
        return { text: 'Error: y must be between 0 and 1.' };
      }

      const display = Number(args.display) || 0;
      const label = (args.label as string) || '';
      const pulse = args.pulse !== false;
      const holdSeconds = Number(args.hold_seconds) || 8;

      const labelInfo = label ? ` with label "${label}"` : '';
      return {
        text: `Pointing at (${x.toFixed(3)}, ${y.toFixed(3)}) on display ${display}${labelInfo}, pulse=${pulse}, hold=${holdSeconds}s. (Overlay pending implementation)`,
      };
    },
  };
}
