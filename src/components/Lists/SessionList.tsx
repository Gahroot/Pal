import { useCallback, useEffect, useMemo, useState } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { formatDistanceToNow } from "date-fns";
import { usePanelStore } from "../../stores/panelStore";
import {
  sessionStore,
  type ChatSession,
  type DateGroupedSessions,
  type SessionType,
} from "../../services/stores/session-store";
import { GlassButton } from "../GlassButton";
import { cn } from "../../lib/utils";

interface SessionListProps {
  filter?: SessionType;
}

interface SectionProps {
  title: string;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
      {title}
    </div>
  );
}

function SessionRow({
  session,
  isActive,
  onSelect,
  onDelete,
}: {
  session: ChatSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "group flex w-full items-center gap-3 rounded-[8px] px-3 transition-colors duration-150",
        "hover:bg-glass",
        isActive && "bg-glass"
      )}
      style={{ height: 44 }}
    >
      {/* Icon placeholder */}
      <div className="h-7 w-7 flex-shrink-0 rounded-full bg-white/10" />

      {/* Title + timestamp */}
      <div className="flex flex-1 flex-col items-start overflow-hidden">
        <span
          className={cn(
            "truncate text-sm text-text-primary",
            isActive && "animate-shimmer"
          )}
        >
          {session.title || "Untitled"}
        </span>
        <span className="text-[11px] text-text-muted">
          {formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })}
        </span>
      </div>

      {/* Delete button on hover */}
      {hovered && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <GlassButton className="px-2 py-0.5 text-[11px]">Delete</GlassButton>
        </div>
      )}
    </button>
  );
}

function Section({ title, sessions, activeSessionId, onSelect, onDelete }: SectionProps) {
  if (sessions.length === 0) return null;
  return (
    <div className="mb-2">
      <SectionHeader title={title} />
      {sessions.map((s) => (
        <SessionRow
          key={s.id}
          session={s}
          isActive={s.id === activeSessionId}
          onSelect={() => onSelect(s.id)}
          onDelete={() => onDelete(s.id)}
        />
      ))}
    </div>
  );
}

export function SessionList({ filter }: SessionListProps) {
  const [groups, setGroups] = useState<DateGroupedSessions>({
    today: [],
    thisWeek: [],
    thisMonth: [],
    older: [],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const activeSessionId = usePanelStore((s) => s.activeSessionId);
  const enterSession = usePanelStore((s) => s.enterSession);

  const loadSessions = useCallback(async () => {
    await sessionStore.loadAll();
    setGroups(sessionStore.groupByDate());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load from non-React imperative store
    void loadSessions();
  }, [loadSessions]);

  const filteredGroups = useMemo(() => {
    const filterSession = (s: ChatSession) => {
      const matchesType = !filter || s.sessionType === filter;
      const matchesSearch =
        !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    };

    return {
      today: groups.today.filter(filterSession),
      thisWeek: groups.thisWeek.filter(filterSession),
      thisMonth: groups.thisMonth.filter(filterSession),
      older: groups.older.filter(filterSession),
    };
  }, [groups, filter, searchQuery]);

  const handleDelete = useCallback(
    async (id: string) => {
      await sessionStore.delete(id);
      void loadSessions();
    },
    [loadSessions]
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Search input */}
      <div className="flex-shrink-0 px-3 py-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search sessions..."
          className="w-full rounded-[8px] bg-glass px-3 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>

      {/* Session list */}
      <ScrollArea.Root className="flex-1 overflow-hidden">
        <ScrollArea.Viewport className="h-full w-full px-1 pb-2">
          <Section
            title="Today"
            sessions={filteredGroups.today}
            activeSessionId={activeSessionId}
            onSelect={enterSession}
            onDelete={handleDelete}
          />
          <Section
            title="This Week"
            sessions={filteredGroups.thisWeek}
            activeSessionId={activeSessionId}
            onSelect={enterSession}
            onDelete={handleDelete}
          />
          <Section
            title="This Month"
            sessions={filteredGroups.thisMonth}
            activeSessionId={activeSessionId}
            onSelect={enterSession}
            onDelete={handleDelete}
          />
          <Section
            title="Older"
            sessions={filteredGroups.older}
            activeSessionId={activeSessionId}
            onSelect={enterSession}
            onDelete={handleDelete}
          />

          {/* Empty state */}
          {filteredGroups.today.length === 0 &&
            filteredGroups.thisWeek.length === 0 &&
            filteredGroups.thisMonth.length === 0 &&
            filteredGroups.older.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <p className="text-sm text-text-muted">No sessions yet</p>
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
