import { AnimatePresence, motion } from "framer-motion";
import { usePanelStore } from "../stores/panelStore";
import { InputField } from "./InputField";
import { TabBar } from "./TabBar";
import { SessionList } from "./Lists/SessionList";
import { RoutineList } from "./Lists/RoutineList";
import { TaskList } from "./Lists/TaskList";
import { TaskDetail } from "./Lists/TaskDetail";
import { SkillList } from "./Lists/SkillList";
import { ToolList } from "./Lists/ToolList";
import { ResponseArea } from "./ChatView/ResponseArea";

function ContentArea() {
  const activeTab = usePanelStore((s) => s.activeTab);
  const isInsideSession = usePanelStore((s) => s.isInsideSession);
  const isInsideTaskDetail = usePanelStore((s) => s.isInsideTaskDetail);

  // When inside a session, show the chat response area
  if (isInsideSession) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <ResponseArea />
      </div>
    );
  }

  switch (activeTab) {
    case 0: // Chats
      return <SessionList filter="chat" />;
    case 1: // Reminders
      return <SessionList filter="reminders" />;
    case 2: // Routines
      return <RoutineList />;
    case 3: // Tasks
      return isInsideTaskDetail ? <TaskDetail /> : <TaskList />;
    case 4: // Skills
      return <SkillList />;
    case 5: // Tools
      return <ToolList />;
    default:
      return null;
  }
}

export function FloatingPanel() {
  const isVisible = usePanelStore((s) => s.isVisible);
  const isDismissing = usePanelStore((s) => s.isDismissing);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="flex h-full w-full flex-col overflow-hidden rounded-[28px] border border-panel-border bg-panel-bg backdrop-blur-xl"
          data-dismissing={isDismissing || undefined}
        >
          {/* Header — draggable region */}
          <div data-tauri-drag-region className="flex-shrink-0">
            <InputField />
          </div>

          {/* Separator */}
          <div className="mx-3 h-px bg-panel-border" />

          {/* Tab bar */}
          <div className="flex-shrink-0">
            <TabBar />
          </div>

          {/* Separator */}
          <div className="mx-3 h-px bg-panel-border" />

          {/* Content */}
          <ContentArea />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
