/**
 * Tag for a value task's impact. Revenue is the headline (solid primary), cost
 * is secondary (tinted primary), everything else is muted — mirroring how the
 * research pipeline orders tasks revenue → cost → other.
 */
export function ImpactBadge({ impact }: { impact: string }) {
  const tone: Record<string, string> = {
    revenue: "bg-primary text-white",
    cost: "bg-primary/15 text-primary",
    other: "bg-white/5 text-text-secondary",
  };
  return (
    <span
      className={`font-label rounded-full px-2.5 py-1 text-[10px] ${
        tone[impact] ?? "bg-white/5 text-text-secondary"
      }`}
    >
      {impact}
    </span>
  );
}
