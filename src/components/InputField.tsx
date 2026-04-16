import { useCallback } from "react";
import type { KeyboardEvent } from "react";
import { usePanelStore } from "../stores/panelStore";
import { useChatStore } from "../stores/chatStore";

export function InputField() {
  const inputText = usePanelStore((s) => s.inputText);
  const setInputText = usePanelStore((s) => s.setInputText);
  const dismiss = usePanelStore((s) => s.dismiss);
  const addUserMessage = useChatStore((s) => s.addUserMessage);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && inputText.trim().length > 0) {
        e.preventDefault();
        addUserMessage(inputText.trim());
        setInputText("");
      } else if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
    },
    [inputText, addUserMessage, setInputText, dismiss]
  );

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Mascot placeholder */}
      <div className="h-10 w-10 flex-shrink-0 rounded-full bg-white/10" />

      <input
        type="text"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask Tama anything..."
        className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
        autoFocus
      />
    </div>
  );
}
