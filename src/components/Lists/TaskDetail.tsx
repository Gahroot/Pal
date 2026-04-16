import { useCallback, useEffect, useState } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { usePanelStore } from "../../stores/panelStore";
import { taskStore, type TaskList, type TaskItem } from "../../services/stores/task-store";
import { GlassButton } from "../GlassButton";
import { cn } from "../../lib/utils";

function CheckboxItem({
  item,
  onToggle,
}: {
  item: TaskItem;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2 transition-colors duration-150 hover:bg-glass"
    >
      {/* Checkbox */}
      <div
        className={cn(
          "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150",
          item.isCompleted
            ? "border-accent bg-accent"
            : "border-glass-border bg-transparent"
        )}
      >
        {item.isCompleted && (
          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>

      {/* Title */}
      <span
        className={cn(
          "text-sm transition-colors duration-150",
          item.isCompleted ? "text-text-muted line-through" : "text-text-primary"
        )}
      >
        {item.title}
      </span>
    </button>
  );
}

export function TaskDetail() {
  const [taskList, setTaskList] = useState<TaskList | null>(null);
  const activeId = usePanelStore((s) => s.activeSessionId);
  const navigateBack = usePanelStore((s) => s.navigateBack);

  useEffect(() => {
    if (activeId) {
      const found = taskStore.taskList(activeId);
      if (found) setTaskList({ ...found });
    }
  }, [activeId]);

  const handleToggle = useCallback(
    async (itemId: string) => {
      if (!taskList) return;

      const updated: TaskList = {
        ...taskList,
        items: taskList.items.map((item) =>
          item.id === itemId ? { ...item, isCompleted: !item.isCompleted } : item
        ),
      };
      setTaskList(updated);
      await taskStore.save(updated);
    },
    [taskList]
  );

  if (!taskList) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-text-muted">Task list not found</p>
      </div>
    );
  }

  const completedCount = taskList.items.filter((i) => i.isCompleted).length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header with back button */}
      <div className="flex flex-shrink-0 items-center gap-2 px-3 py-2">
        <GlassButton onClick={navigateBack} className="px-2 py-0.5 text-[11px]">
          Back
        </GlassButton>
        <div className="flex flex-1 flex-col overflow-hidden">
          <span className="truncate text-sm font-medium text-text-primary">
            {taskList.title}
          </span>
          <span className="text-[11px] text-text-muted">
            {completedCount} of {taskList.items.length} completed
          </span>
        </div>
      </div>

      {/* Separator */}
      <div className="mx-3 h-px bg-panel-border" />

      {/* Items */}
      <ScrollArea.Root className="flex-1 overflow-hidden">
        <ScrollArea.Viewport className="h-full w-full px-1 py-2">
          {taskList.items.map((item) => (
            <CheckboxItem
              key={item.id}
              item={item}
              onToggle={() => handleToggle(item.id)}
            />
          ))}

          {taskList.items.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-text-muted">No items in this list</p>
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
