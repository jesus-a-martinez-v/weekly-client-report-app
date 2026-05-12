type Status = "active" | "disabled" | (string & {});

const styles: Record<string, string> = {
  // client statuses
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  disabled: "bg-zinc-100 text-zinc-500 ring-zinc-200",
  // report pipeline statuses
  pending: "bg-zinc-50 text-zinc-500 ring-zinc-200",
  fetching: "bg-amber-50 text-amber-700 ring-amber-200",
  narrating: "bg-amber-50 text-amber-700 ring-amber-200",
  rendering: "bg-amber-50 text-amber-700 ring-amber-200",
  drafted: "bg-sky-50 text-sky-700 ring-sky-200",
  quiet: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  sent: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  discarded: "bg-zinc-100 text-zinc-400 ring-zinc-200",
  failed: "bg-rose-50 text-rose-700 ring-rose-200",
  // schedule statuses
  inactive: "bg-zinc-100 text-zinc-500 ring-zinc-200",
  // run statuses
  queued: "bg-zinc-50 text-zinc-500 ring-zinc-200",
  running: "bg-amber-50 text-amber-700 ring-amber-200",
  succeeded: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  partial: "bg-orange-50 text-orange-700 ring-orange-200",
};

export function StatusPill({
  status,
  className = "",
}: {
  status: Status;
  className?: string;
}) {
  const tone = styles[status] ?? "bg-zinc-100 text-zinc-700 ring-zinc-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone} ${className}`}
    >
      {status}
    </span>
  );
}
