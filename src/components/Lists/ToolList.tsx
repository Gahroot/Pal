import { useCallback, useMemo, useState } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { usePanelStore } from "../../stores/panelStore";
import { ToolRegistryImpl } from "../../services/tools/tool-registry";
import type { ToolDefinition } from "../../types/index";
import { GlassButton } from "../GlassButton";

function ToolRow({
  definition,
  onSelect,
}: {
  definition: ToolDefinition;
  onSelect: () => void;
}) {
  // Truncate description to first sentence
  const shortDesc = definition.description.split(".")[0] + ".";

  return (
    <button
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 transition-colors duration-150 hover:bg-glass"
    >
      {/* Icon */}
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[6px] bg-glass text-[11px] text-text-secondary">
        T
      </div>

      {/* Name + description */}
      <div className="flex flex-1 flex-col items-start overflow-hidden">
        <span className="truncate text-sm font-medium text-text-primary">
          {definition.name}
        </span>
        <span className="truncate text-[11px] text-text-muted">{shortDesc}</span>
      </div>

      {/* Chevron */}
      <svg
        className="h-4 w-4 flex-shrink-0 text-text-muted"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

function ToolDetailView({
  definition,
  onBack,
}: {
  definition: ToolDefinition;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-2 px-3 py-2">
        <GlassButton onClick={onBack} className="px-2 py-0.5 text-[11px]">
          Back
        </GlassButton>
        <span className="truncate text-sm font-medium text-text-primary">
          {definition.name}
        </span>
      </div>

      <div className="mx-3 h-px bg-panel-border" />

      <ScrollArea.Root className="flex-1 overflow-hidden">
        <ScrollArea.Viewport className="h-full w-full px-3 py-3">
          {/* Description */}
          <div className="mb-4">
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Description
            </h4>
            <p className="text-sm leading-relaxed text-text-secondary">
              {definition.description}
            </p>
          </div>

          {/* Input schema */}
          <div>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Input Schema
            </h4>
            <pre className="overflow-x-auto rounded-[10px] bg-white/[0.04] p-3 text-xs text-text-secondary">
              {JSON.stringify(definition.input_schema, null, 2)}
            </pre>
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar
          orientation="vertical"
          className="flex w-2 touch-none select-none p-0.5"
        >
          <ScrollArea.Thumb className="relative flex-1 rounded-full bg-white/15" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </div>
  );
}

export function ToolList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTool, setSelectedTool] = useState<ToolDefinition | null>(null);
  const isInsideTool = usePanelStore((s) => s.isInsideTool);
  const activeToolId = usePanelStore((s) => s.activeToolId);
  const setState = usePanelStore.setState;

  // Get tool definitions from a default registry
  // In production this would come from the actual running registry
  const allTools = useMemo(() => {
    try {
      const registry = ToolRegistryImpl.defaultRegistry(".");
      return registry.tools.map((t) => t.definition);
    } catch {
      return [];
    }
  }, []);

  const filteredTools = useMemo(() => {
    if (!searchQuery) return allTools;
    const lower = searchQuery.toLowerCase();
    return allTools.filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.description.toLowerCase().includes(lower)
    );
  }, [allTools, searchQuery]);

  // If navigated into a tool from outside (panelStore)
  const activeDef = useMemo(() => {
    if (isInsideTool && activeToolId) {
      return allTools.find((t) => t.name === activeToolId) ?? null;
    }
    return selectedTool;
  }, [isInsideTool, activeToolId, allTools, selectedTool]);

  const handleSelect = useCallback(
    (def: ToolDefinition) => {
      setSelectedTool(def);
      setState({ isInsideTool: true, activeToolId: def.name });
    },
    [setState]
  );

  const handleBack = useCallback(() => {
    setSelectedTool(null);
    setState({ isInsideTool: false, activeToolId: null });
  }, [setState]);

  if (activeDef) {
    return <ToolDetailView definition={activeDef} onBack={handleBack} />;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Search */}
      <div className="flex-shrink-0 px-3 py-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tools..."
          className="w-full rounded-[8px] bg-glass px-3 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>

      {/* List */}
      <ScrollArea.Root className="flex-1 overflow-hidden">
        <ScrollArea.Viewport className="h-full w-full px-1 py-1">
          {filteredTools.map((def) => (
            <ToolRow key={def.name} definition={def} onSelect={() => handleSelect(def)} />
          ))}

          {filteredTools.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-text-muted">No tools found</p>
            </div>
          )}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar
          orientation="vertical"
          className="flex w-2 touch-none select-none p-0.5"
        >
          <ScrollArea.Thumb className="relative flex-1 rounded-full bg-white/15" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </div>
  );
}
