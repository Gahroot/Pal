import { useEffect, useCallback, type RefObject } from "react";
import { useChatStore } from "../stores/chatStore";

const SCROLL_THRESHOLD = 40;

/**
 * Auto-scrolls a container to the bottom when new content arrives,
 * unless the user has manually scrolled up.
 *
 * Re-enables auto-scroll when the user scrolls back to the bottom.
 */
export function useAutoScroll(containerRef: RefObject<HTMLDivElement | null>) {
  const autoScrollEnabled = useChatStore((s) => s.autoScrollEnabled);
  const setAutoScroll = useChatStore((s) => s.setAutoScroll);
  const displayedText = useChatStore((s) => s.displayedText);
  const messagesCount = useChatStore((s) => s.currentMessages.length);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const isNearBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD;

    if (isNearBottom && !autoScrollEnabled) {
      setAutoScroll(true);
    } else if (!isNearBottom && autoScrollEnabled) {
      setAutoScroll(false);
    }
  }, [containerRef, autoScrollEnabled, setAutoScroll]);

  // Attach scroll listener
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, [containerRef, handleScroll]);

  // Auto-scroll when content changes
  useEffect(() => {
    if (!autoScrollEnabled) return;

    const el = containerRef.current;
    if (!el) return;

    el.scrollTop = el.scrollHeight;
  }, [autoScrollEnabled, displayedText, messagesCount, containerRef]);
}
