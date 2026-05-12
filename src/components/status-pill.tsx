type Status = "active" | "disabled" | (string & {});

const styles: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  disabled: "bg-zinc-100 text-zinc-500 ring-zinc-200",
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
