import { useCallback, useEffect, useMemo, useState } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePanelStore } from "../../stores/panelStore";
import { skillStore, type Skill } from "../../services/stores/skill-store";
import { GlassButton } from "../GlassButton";

function SkillRow({
  skill,
  onSelect,
}: {
  skill: Skill;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 transition-colors duration-150 hover:bg-glass"
    >
      {/* Icon */}
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[6px] bg-glass text-[11px] text-text-secondary">
        S
      </div>

      {/* Name + description */}
      <div className="flex flex-1 flex-col items-start overflow-hidden">
        <span className="truncate text-sm font-medium text-text-primary">
          {skill.name}
        </span>
        <span className="truncate text-[11px] text-text-muted">
          {skill.description || "No description"}
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

function SkillDetailView({
  skill,
  onBack,
}: {
  skill: Skill;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center gap-2 px-3 py-2">
        <GlassButton onClick={onBack} className="px-2 py-0.5 text-[11px]">
          Back
        </GlassButton>
        <div className="flex flex-1 flex-col overflow-hidden">
          <span className="truncate text-sm font-medium text-text-primary">
            {skill.name}
          </span>
          <span className="truncate text-[11px] text-text-muted">
            {skill.description}
          </span>
        </div>
      </div>

      <div className="mx-3 h-px bg-panel-border" />

      <ScrollArea.Root className="flex-1 overflow-hidden">
        <ScrollArea.Viewport className="h-full w-full px-3 py-3">
          <div className="prose prose-invert prose-sm max-w-none text-text-secondary">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {skill.content}
            </ReactMarkdown>
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

export function SkillList() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const isInsideSkill = usePanelStore((s) => s.isInsideSkill);
  const activeSkillId = usePanelStore((s) => s.activeSkillId);
  const setState = usePanelStore.setState;

  useEffect(() => {
    void skillStore.loadAll().then(setSkills);
  }, []);

  const activeSkill = useMemo(() => {
    if (isInsideSkill && activeSkillId) {
      return skills.find((s) => s.id === activeSkillId) ?? null;
    }
    return selectedSkill;
  }, [isInsideSkill, activeSkillId, skills, selectedSkill]);

  const handleSelect = useCallback(
    (skill: Skill) => {
      setSelectedSkill(skill);
      setState({ isInsideSkill: true, activeSkillId: skill.id });
    },
    [setState]
  );

  const handleBack = useCallback(() => {
    setSelectedSkill(null);
    setState({ isInsideSkill: false, activeSkillId: null });
  }, [setState]);

  if (activeSkill) {
    return <SkillDetailView skill={activeSkill} onBack={handleBack} />;
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ScrollArea.Root className="flex-1 overflow-hidden">
        <ScrollArea.Viewport className="h-full w-full px-1 py-2">
          {skills.map((skill) => (
            <SkillRow
              key={skill.id}
              skill={skill}
              onSelect={() => handleSelect(skill)}
            />
          ))}

          {skills.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-text-muted">No skills yet</p>
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
