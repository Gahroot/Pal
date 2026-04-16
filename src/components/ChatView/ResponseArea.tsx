import { useRef } from "react";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { useChatStore } from "../../stores/chatStore";
import { useStreamingAnimation } from "../../hooks/useStreamingAnimation";
import { useAutoScroll } from "../../hooks/useAutoScroll";
import { ChatMessage } from "./ChatMessage";
import { MarkdownContent } from "./MarkdownContent";
import { StreamingCursor } from "./StreamingCursor";
import { ErrorBlock } from "./ErrorBlock";
import { SkeletonLoader } from "../SkeletonLoader";
import { ToolIndicator } from "../ToolIndicator";

/**
 * Main response area for the chat view.
 *
 * Mirrors the macOS tama-agent's FloatingPanel+Response streaming rendering:
 * - Committed messages list
 * - Current streaming text with cursor
 * - Skeleton loader while waiting for first tokens
 * - Error block on failure
 * - Tool indicator pill
 */
export function ResponseArea() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentMessages = useChatStore((s) => s.currentMessages);
  const displayedText = useChatStore((s) => s.displayedText);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const typingFinished = useChatStore((s) => s.typingFinished);
  const showSkeleton = useChatStore((s) => s.showSkeleton);
  const error = useChatStore((s) => s.error);

  useStreamingAnimation();
  useAutoScroll(scrollRef);

  const showCursor = isStreaming || !typingFinished;

  return (
    <ScrollArea.Root className="w-full overflow-hidden" style={{ maxHeight: 400 }}>
      <ScrollArea.Viewport ref={scrollRef} className="w-full h-full px-4 py-3">
        {/* Committed messages */}
        {currentMessages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {/* Skeleton while waiting for first tokens */}
        {showSkeleton && <SkeletonLoader />}

        {/* Streaming text */}
        {displayedText.length > 0 && (
          <div className="mb-3 text-sm text-text-primary leading-relaxed">
            <MarkdownContent content={displayedText} />
            {showCursor && <StreamingCursor />}
          </div>
        )}

        {/* Cursor alone when streaming just started but no text yet */}
        {showCursor && displayedText.length === 0 && !showSkeleton && (
          <div className="mb-3">
            <StreamingCursor />
          </div>
        )}

        {/* Error block */}
        {error && <ErrorBlock message={error.message} />}

        {/* Tool indicator */}
        <ToolIndicator />
      </ScrollArea.Viewport>

      <ScrollArea.Scrollbar
        orientation="vertical"
        className="flex w-2 touch-none select-none p-0.5"
      >
        <ScrollArea.Thumb className="relative flex-1 rounded-full bg-white/15" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
