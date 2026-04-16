import { useCallback, useEffect, useState } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { formatDistanceToNow } from "date-fns";
import { usePanelStore } from "../../stores/panelStore";
import { taskStore, type TaskList as TaskListModel } from "../../services/stores/task-store";

function TaskRow({
  task,
  onSelect,
}: {
  task: TaskListModel;
  onSelect: () => void;
}) {
  const completedCount = task.items.filter((i) => i.isCompleted).length;
  const totalCount = task.items.length;

  return (
    <button
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 transition-colors duration-150 hover:bg-glass"
    >
      {/* Checklist icon */}
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[6px] bg-glass text-[11px] text-text-secondary">
        {completedCount}/{totalCount}
      </div>

      {/* Title + timestamp */}
      <div className="flex flex-1 flex-col items-start overflow-hidden">
        <span className="truncate text-sm text-text-primary">
          {task.title || "Untitled Task List"}
        </span>
        <span className="text-[11px] text-text-muted">
          {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
        </span>
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

export function TaskList() {
  const [tasks, setTasks] = useState<TaskListModel[]>([]);

  const loadTasks = useCallback(async () => {
    const all = await taskStore.loadAll();
    setTasks(all);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load from non-React imperative store
    void loadTasks();
  }, [loadTasks]);

  const setState = usePanelStore.setState;

  const handleSelect = useCallback(
    (id: string) => {
      setState({ isInsideTaskDetail: true, activeSessionId: id });
    },
    [setState]
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ScrollArea.Root className="flex-1 overflow-hidden">
        <ScrollArea.Viewport className="h-full w-full px-2 py-2">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onSelect={() => handleSelect(task.id)}
            />
          ))}

          {tasks.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-text-muted">No task lists yet</p>
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
