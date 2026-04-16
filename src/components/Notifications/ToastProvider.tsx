import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import * as Toast from "@radix-ui/react-toast";
import { AnimatePresence, motion } from "framer-motion";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ToastType = "reminder" | "agentReply" | "routineResult";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  body: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, title: string, body: string) => void;
}

// ─── Context ────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

// ─── Provider ───────────────────────────────────────────────────────────────

let nextId = 0;
const MAX_TOASTS = 5;
const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((type: ToastType, title: string, body: string) => {
    const id = String(++nextId);
    setToasts((prev) => {
      const next = [...prev, { id, type, title, body }];
      // Keep max 5
      if (next.length > MAX_TOASTS) {
        return next.slice(next.length - MAX_TOASTS);
      }
      return next;
    });

    // Auto dismiss
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      <Toast.Provider swipeDirection="right" duration={AUTO_DISMISS_MS}>
        {children}

        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <Toast.Root key={toast.id} asChild forceMount>
              <motion.div
                layout
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
                className="mb-2 flex items-start gap-3 rounded-[12px] border border-glass-border bg-panel-bg px-4 py-3 shadow-lg backdrop-blur-xl"
              >
                <div className="flex flex-1 flex-col overflow-hidden">
                  <Toast.Title className="truncate text-sm font-medium text-text-primary">
                    {toast.title}
                  </Toast.Title>
                  <Toast.Description className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
                    {toast.body}
                  </Toast.Description>
                </div>
                <Toast.Close
                  onClick={() => dismissToast(toast.id)}
                  className="flex-shrink-0 rounded-[6px] p-1 text-text-muted transition-colors hover:bg-glass hover:text-text-primary"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Toast.Close>
              </motion.div>
            </Toast.Root>
          ))}
        </AnimatePresence>

        <Toast.Viewport className="fixed top-4 right-4 z-[9999] flex w-80 flex-col" />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}
