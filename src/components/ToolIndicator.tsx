import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useChatStore } from "../stores/chatStore";

const TOOL_LABELS: Record<string, string> = {
  bash: "Running command",
  read: "Reading file",
  write: "Writing file",
  edit: "Editing file",
  glob: "Searching files",
  grep: "Searching code",
  web_search: "Searching web",
  web_fetch: "Fetching page",
  browser: "Browsing",
  list_directory: "Listing files",
  think: "Thinking",
};

function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? `Using ${toolName}`;
}

/**
 * Floating pill that shows the current tool being used.
 *
 * Mirrors the macOS tama-agent's ToolIndicatorView.swift:
 * glassmorphic pill, spinning indicator, fade in/out.
 */
export function ToolIndicator() {
  const activeToolIndicator = useChatStore((s) => s.activeToolIndicator);

  return (
    <AnimatePresence>
      {activeToolIndicator && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-2 self-start rounded-[12px] border border-white/[0.1] bg-white/[0.08] px-3 py-1.5 backdrop-blur-sm"
          style={{ minWidth: 130, maxWidth: 280 }}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-text-secondary shrink-0" />
          <span className="text-xs text-text-secondary truncate select-none">
            {getToolLabel(activeToolIndicator.name)}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
