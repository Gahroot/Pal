interface ErrorBlockProps {
  message: string;
}

/**
 * Error display block.
 *
 * Mirrors the macOS tama-agent's ErrorTextBlock.swift:
 * amber tinted background and border with rounded corners.
 */
export function ErrorBlock({ message }: ErrorBlockProps) {
  return (
    <div className="rounded-[10px] bg-error-bg border border-error-border px-3 py-2.5 my-2">
      <p className="text-sm text-amber-300/90 leading-relaxed">{message}</p>
    </div>
  );
}
