/**
 * Skill tool — loads and executes a saved skill by name.
 *
 * Ported from tama-agent SkillTool.swift.
 * Uses stub skill-store until Phase 6.
 */

import type { Tool, ToolOutput } from '../../types/index.ts';

// Stub skill store until Phase 6
const skills = new Map<string, { name: string; content: string }>();

export function createSkillTool(): Tool {
  return {
    definition: {
      name: 'skill',
      description:
        'Execute a saved skill by name. Skills are reusable prompt templates with optional arguments.',
      input_schema: {
        type: 'object',
        properties: {
          skill: {
            type: 'string',
            description: 'Name of the skill to execute',
          },
          args: {
            type: 'string',
            description: 'Optional arguments to pass to the skill',
          },
        },
        required: ['skill'],
      },
    },

    async execute(args: Record<string, unknown>): Promise<ToolOutput> {
      const skillName = args.skill as string;
      if (!skillName) return { text: 'Error: skill name is required.' };

      const skillArgs = (args.args as string) || '';

      const stored = skills.get(skillName.toLowerCase());
      if (!stored) {
        // TODO: Load from skill-store in Phase 6
        console.warn(`[skill] Skill "${skillName}" not found. Skill store pending Phase 6.`);
        return {
          text: `Error: Skill "${skillName}" not found. Available skills: ${skills.size === 0 ? '(none — skill store pending)' : Array.from(skills.keys()).join(', ')}`,
        };
      }

      // Wrap in XML tags as per tama-agent pattern
      const content = skillArgs
        ? `<skill name="${stored.name}" args="${skillArgs}">\n${stored.content}\n</skill>`
        : `<skill name="${stored.name}">\n${stored.content}\n</skill>`;

      return { text: content };
    },
  };
}
