/** Pill showing a prospect's pipeline status, tuned to the dark/orange palette. */
export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    agreed: "bg-primary text-white",
    signed_up: "bg-primary text-white",
    contacted: "bg-primary/15 text-primary",
    scripted: "bg-white/5 text-text-secondary",
    researched: "bg-white/5 text-text-secondary",
    opted_out: "bg-white/5 text-muted",
    declined: "bg-white/5 text-muted",
  };
  return (
    <span
      className={`font-label rounded-full px-2.5 py-1 text-[10px] ${
        tone[status] ?? "bg-white/5 text-text-secondary"
      }`}
    >
      {status}
    </span>
  );
}
