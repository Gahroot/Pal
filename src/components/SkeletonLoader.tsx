/**
 * Skeleton loading indicator — 3 shimmer bars.
 *
 * Mirrors the macOS tama-agent's SkeletonView.swift:
 * widths 65%, 85%, 45%; height 12px; spacing 10px; rounded corners.
 */
export function SkeletonLoader() {
  const bars = ["65%", "85%", "45%"] as const;

  return (
    <div className="flex flex-col gap-[10px] py-2">
      {bars.map((width, i) => (
        <div
          key={i}
          className="animate-shimmer rounded-md"
          style={{
            width,
            height: 12,
            backgroundColor: "rgba(255, 255, 255, 0.06)",
          }}
        />
      ))}
    </div>
  );
}
