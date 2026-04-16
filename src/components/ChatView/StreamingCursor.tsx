import { useChatStore } from "../../stores/chatStore";

/**
 * Blinking cursor shown at the end of streaming text.
 *
 * Mirrors the macOS tama-agent's cursorAttributes / blinkCursor:
 * toggles between white and transparent (not add/remove) to preserve layout stability.
 */
export function StreamingCursor() {
  const cursorVisible = useChatStore((s) => s.cursorVisible);

  return (
    <span
      className="inline-block text-base font-normal leading-none select-none"
      style={{ color: cursorVisible ? "white" : "transparent" }}
      aria-hidden="true"
    >
      &#9613;
    </span>
  );
}
