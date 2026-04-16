import { useEffect, useRef } from "react";
import { useChatStore } from "../stores/chatStore";

/**
 * Drives the streaming typing animation.
 *
 * Mirrors the macOS tama-agent's CVDisplayLink + characterQueue approach:
 * - A requestAnimationFrame loop pops ~13 chars/frame at 60 fps (~800 chars/sec)
 *   from chatStore.characterQueue via tickTyping().
 * - A separate 500 ms setInterval toggles the cursor via toggleCursor().
 * - Both loops clean up on unmount or when streaming stops.
 */
export function useStreamingAnimation() {
  const rafId = useRef<number>(0);
  const cursorIntervalId = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFrameTime = useRef(0);

  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamFinished = useChatStore((s) => s.streamFinished);
  const typingFinished = useChatStore((s) => s.typingFinished);
  const characterQueue = useChatStore((s) => s.characterQueue);

  const tickTyping = useChatStore((s) => s.tickTyping);
  const toggleCursor = useChatStore((s) => s.toggleCursor);
  const commitAssistantMessage = useChatStore((s) => s.commitAssistantMessage);

  const shouldAnimate = isStreaming || !typingFinished;

  // rAF typing loop
  useEffect(() => {
    if (!shouldAnimate) return;

    const CHARS_PER_FRAME = 13; // ~800 chars/sec at 60 fps
    const MIN_FRAME_MS = 14; // throttle to ~70 fps max

    const tick = (now: number) => {
      if (now - lastFrameTime.current >= MIN_FRAME_MS) {
        const queueLen = useChatStore.getState().characterQueue.length;
        if (queueLen > 0) {
          tickTyping(Math.min(CHARS_PER_FRAME, queueLen));
        }
        lastFrameTime.current = now;
      }
      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId.current);
    };
  }, [shouldAnimate, tickTyping]);

  // Cursor blink interval
  useEffect(() => {
    if (!shouldAnimate) return;

    cursorIntervalId.current = setInterval(() => {
      toggleCursor();
    }, 500);

    return () => {
      if (cursorIntervalId.current !== null) {
        clearInterval(cursorIntervalId.current);
        cursorIntervalId.current = null;
      }
    };
  }, [shouldAnimate, toggleCursor]);

  // Commit assistant message when queue fully drained after stream ends
  useEffect(() => {
    if (streamFinished && typingFinished && characterQueue.length === 0) {
      commitAssistantMessage();
    }
  }, [streamFinished, typingFinished, characterQueue.length, commitAssistantMessage]);
}
