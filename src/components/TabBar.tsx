import { motion } from "framer-motion";
import { usePanelStore } from "../stores/panelStore";
import { cn } from "../lib/utils";

const TABS = ["Chats", "Reminders", "Routines", "Tasks", "Skills", "Tools"];

export function TabBar() {
  const activeTab = usePanelStore((s) => s.activeTab);
  const setTab = usePanelStore((s) => s.setTab);

  return (
    <div className="flex items-center px-3 py-1.5">
      {TABS.map((label, index) => {
        const isActive = activeTab === index;
        // Hide dividers adjacent to the active tab
        const showDividerAfter =
          index < TABS.length - 1 &&
          index !== activeTab &&
          index !== activeTab - 1;

        return (
          <div key={label} className="relative flex items-center">
            <button
              onClick={() => setTab(index)}
              className={cn(
                "relative z-10 px-3 py-1 text-xs font-medium transition-colors duration-200",
                isActive ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="tab-highlight"
                  className="absolute inset-0 rounded-[6px] bg-tab-active"
                  transition={{ type: "tween", duration: 0.2, ease: "easeInOut" }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
            {showDividerAfter && (
              <div className="h-3 w-px bg-tab-divider" />
            )}
          </div>
        );
      })}
    </div>
  );
}
