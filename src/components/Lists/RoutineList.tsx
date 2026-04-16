import { useCallback, useEffect, useState } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import {
  scheduleStore,
  type ScheduledJob,
} from "../../services/stores/schedule-store";
import { GlassButton } from "../GlassButton";
import { cn } from "../../lib/utils";

function RoutineRow({
  job,
  onRun,
  onDelete,
}: {
  job: ScheduledJob;
  onRun: () => void;
  onDelete: () => void;
}) {
  const isExecuting = false; // TODO: wire to real execution state

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[8px] px-3 py-2 transition-colors duration-150",
        "hover:bg-glass",
        isExecuting && "animate-shimmer bg-green-500/10"
      )}
    >
      {/* Title + run count */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <span className="truncate text-sm text-text-primary">{job.name}</span>
        <span className="text-[11px] text-text-muted">
          {job.scheduleType === "every" && job.intervalSeconds
            ? `Every ${job.intervalSeconds}s`
            : job.scheduleType === "cron" && job.schedule
              ? `Cron: ${job.schedule}`
              : "One-time"}
        </span>
      </div>

      {/* Run count badge */}
      {job.runCount > 0 && (
        <span className="rounded-full bg-glass px-2 py-0.5 text-[11px] text-text-secondary">
          {job.runCount} run{job.runCount !== 1 ? "s" : ""}
        </span>
      )}

      {/* Actions */}
      <div className="flex gap-1.5">
        <GlassButton variant="primary" className="px-2 py-0.5 text-[11px]" onClick={onRun}>
          Run
        </GlassButton>
        <GlassButton className="px-2 py-0.5 text-[11px]" onClick={onDelete}>
          Delete
        </GlassButton>
      </div>
    </div>
  );
}

export function RoutineList() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);

  const loadJobs = useCallback(() => {
    const allJobs = scheduleStore.listJobs();
    setJobs(allJobs.filter((j) => j.jobType === "routine"));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from non-React imperative store
    loadJobs();
  }, [loadJobs]);

  const handleRun = useCallback(
    (job: ScheduledJob) => {
      scheduleStore.onRoutineTriggered?.(job);
      loadJobs();
    },
    [loadJobs]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await scheduleStore.deleteJobById(id);
      loadJobs();
    },
    [loadJobs]
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ScrollArea.Root className="flex-1 overflow-hidden">
        <ScrollArea.Viewport className="h-full w-full px-2 py-2">
          {jobs.map((job) => (
            <RoutineRow
              key={job.id}
              job={job}
              onRun={() => handleRun(job)}
              onDelete={() => handleDelete(job.id)}
            />
          ))}

          {jobs.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-text-muted">No routines yet</p>
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
