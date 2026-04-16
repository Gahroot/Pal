/**
 * Tool registry — central registry of all available tools.
 *
 * Ported from tama-agent AgentTool.swift registry pattern / gg-framework tools/index.ts.
 */

import type { Tool, ToolRegistry as IToolRegistry } from '../../types/index.ts';
import { createReadTool } from './read-tool.ts';
import { createWriteTool } from './write-tool.ts';
import { createEditTool } from './edit-tool.ts';
import { createLsTool } from './ls-tool.ts';
import { createFindTool } from './find-tool.ts';
import { createGrepTool } from './grep-tool.ts';
import { createBashTool } from './bash-tool.ts';
import { createWebFetchTool } from './web-fetch-tool.ts';
import { createWebSearchTool } from './web-search-tool.ts';
import { createScreenshotTool } from './screenshot-tool.ts';
import { createPointTool } from './point-tool.ts';
import { createCreateReminderTool } from './create-reminder-tool.ts';
import { createCreateRoutineTool } from './create-routine-tool.ts';
import { createListSchedulesTool } from './list-schedules-tool.ts';
import { createDeleteScheduleTool } from './delete-schedule-tool.ts';
import { createTaskTool } from './task-tool.ts';
import { createSkillTool } from './skill-tool.ts';
import { createDismissTool } from './dismiss-tool.ts';
import { createEndCallTool } from './end-call-tool.ts';
import { createBrowserTool } from './browser/browser-tool.ts';

export class ToolRegistryImpl implements IToolRegistry {
  private map = new Map<string, Tool>();

  get tools(): Tool[] {
    return Array.from(this.map.values());
  }

  /** Register a tool. */
  register(tool: Tool): void {
    this.map.set(tool.definition.name, tool);
  }

  /** Look up a tool by name. */
  tool(name: string): Tool | undefined {
    return this.map.get(name);
  }

  /** Return tool definitions in Anthropic API format. */
  apiToolDefinitions(): Record<string, unknown>[] {
    return this.tools.map((t) => ({
      name: t.definition.name,
      description: t.definition.description,
      input_schema: t.definition.input_schema,
    }));
  }

  /** Create a registry with all default tools. */
  static defaultRegistry(workingDir: string): ToolRegistryImpl {
    const registry = new ToolRegistryImpl();

    // File operations
    registry.register(createReadTool());
    registry.register(createWriteTool());
    registry.register(createEditTool());
    registry.register(createLsTool(workingDir));
    registry.register(createFindTool(workingDir));
    registry.register(createGrepTool(workingDir));

    // Shell
    registry.register(createBashTool(workingDir));

    // Web
    registry.register(createWebFetchTool());
    registry.register(createWebSearchTool());

    // Screen
    registry.register(createScreenshotTool());
    registry.register(createPointTool());

    // Browser
    registry.register(createBrowserTool());

    // Scheduling
    registry.register(createCreateReminderTool());
    registry.register(createCreateRoutineTool());
    registry.register(createListSchedulesTool());
    registry.register(createDeleteScheduleTool());

    // Tasks & Skills
    registry.register(createTaskTool());
    registry.register(createSkillTool());

    // Control flow
    registry.register(createDismissTool());
    registry.register(createEndCallTool());

    return registry;
  }
}
