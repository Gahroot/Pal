import type { ChatMessage as ChatMessageType } from "../../stores/chatStore";
import { MarkdownContent } from "./MarkdownContent";

interface ChatMessageProps {
  message: ChatMessageType;
}

/**
 * Renders a single chat message.
 *
 * Mirrors the macOS tama-agent's userBubbleImage / appendUserBubble:
 * - variant="user": right-aligned blue bubble
 * - variant="assistant": left-aligned full-width markdown
 */
export function ChatMessage({ message }: ChatMessageProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end mb-3">
        <div className="bg-blue-600/80 rounded-2xl px-4 py-2 max-w-[80%] ml-auto">
          <p className="text-sm text-white leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3 text-sm text-text-primary leading-relaxed">
      <MarkdownContent content={message.content} />
    </div>
  );
}
