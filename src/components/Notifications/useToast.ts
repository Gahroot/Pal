import { createContext, useContext } from "react";

export type ToastType = "reminder" | "agentReply" | "routineResult";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  body: string;
}

export interface ToastContextValue {
  showToast: (type: ToastType, title: string, body: string) => void;
}

export const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}
