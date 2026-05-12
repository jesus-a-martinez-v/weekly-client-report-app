import { formatAuditAction, summarizeAuditPayload, auditCategory } from "@/lib/audit";

type AuditRow = {
  id: string;
  actorEmail: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: Date;
};

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function absoluteTime(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const DOT_STYLES: Record<string, string> = {
  system: "bg-zinc-300",
  operator: "bg-sky-400",
  failure: "bg-rose-400",
};

export function AuditTimeline({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border hairline bg-white px-4 py-3 text-sm text-zinc-400">
        No activity yet.
      </p>
    );
  }

  return (
    <div className="space-y-0 rounded-md border hairline bg-white divide-y divide-zinc-100">
      {rows.map((row) => {
        const category = auditCategory(row.action);
        const dotStyle = DOT_STYLES[category] ?? DOT_STYLES.system;
        const label = formatAuditAction(row.action);
        const detail = summarizeAuditPayload(row.action, row.payload);
        const isSystem = row.actorEmail === "system";

        return (
          <div key={row.id} className="flex items-start gap-3 px-4 py-3">
            <div className="mt-1.5 flex-shrink-0">
              <span className={`inline-block h-2 w-2 rounded-full ${dotStyle}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-zinc-800">{label}</span>
                <time
                  dateTime={row.createdAt.toISOString()}
                  title={absoluteTime(row.createdAt)}
                  className="flex-shrink-0 text-xs text-zinc-400"
                >
                  {relativeTime(row.createdAt)}
                </time>
              </div>
              {detail && (
                <p className="mt-0.5 text-xs text-zinc-500 truncate">{detail}</p>
              )}
              <p className="mt-0.5 text-xs text-zinc-400">
                {isSystem ? (
                  <em>system</em>
                ) : (
                  <span className="font-mono">{row.actorEmail}</span>
                )}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
