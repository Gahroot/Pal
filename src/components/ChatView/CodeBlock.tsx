import { useState, useCallback } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeBlockProps {
  language?: string;
  children: string;
}

/**
 * Fenced code block with syntax highlighting and a copy button.
 *
 * Mirrors the macOS tama-agent's ResponseTextView.swift (collectCodeBlocks / drawCodeBlock):
 * - Header bar with language label
 * - Glassmorphic copy button: "Copy" -> "Copied" (green) -> reverts after 1.5s
 * - atomDark theme with transparent background override
 */
export function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [children]);

  const displayLang = language ?? "text";

  // Override atomDark background to transparent so our container bg shows through
  const customStyle: Record<string, React.CSSProperties> = {
    ...atomDark,
    'pre[class*="language-"]': {
      ...(atomDark['pre[class*="language-"]'] as React.CSSProperties | undefined),
      background: "transparent",
      margin: 0,
      padding: "12px",
    },
  };

  return (
    <div className="my-2 rounded-[10px] border border-white/[0.06] bg-white/[0.04] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06]">
        <span className="text-xs text-text-secondary select-none">
          {displayLang}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className={`text-xs px-2 py-0.5 rounded-md transition-colors select-none ${
            copied
              ? "text-green-400 bg-green-400/10"
              : "text-text-secondary hover:text-text-primary bg-white/[0.06] hover:bg-white/[0.1]"
          }`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Code */}
      <div className="code-block">
        <SyntaxHighlighter
          language={displayLang}
          style={customStyle}
          customStyle={{
            background: "transparent",
            margin: 0,
            padding: "12px",
            fontSize: "13px",
            lineHeight: 1.5,
          }}
        >
          {children}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
