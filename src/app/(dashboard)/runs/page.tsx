import { asc, sql } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/lib/db/client";
import { reports } from "@/lib/db/schema";
import { listRuns } from "@/lib/db/repos";
import { StatusPill } from "@/components/status-pill";
import { DeleteRowButton } from "@/components/delete-row-button";
import { formatRange } from "@/lib/shared/window";
import { deleteRun } from "@/server/actions/runs";

export const dynamic = "force-dynamic";

function formatClients(names: string[]): { display: string; title?: string } {
  if (names.length === 0) return { display: "—" };
  if (names.length <= 3)
    return { display: names.join(", "), title: names.join(", ") };
  const shown = names.slice(0, 2).join(", ");
  return {
    display: `${shown} +${names.length - 2} more`,
    title: names.join(", "),
  };
}

export default async function RunsPage() {
  const allRuns = await listRuns();

  const tallies = await db
    .select({
      runId: reports.runId,
      status: reports.status,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(reports)
    .groupBy(reports.runId, reports.status);

  const clientRows = await db
    .select({
      runId: reports.runId,
      clientName: reports.clientName,
    })
    .from(reports)
    .orderBy(asc(reports.clientName));

  const tallyMap = new Map<string, Record<string, number>>();
  for (const t of tallies) {
    const existing = tallyMap.get(t.runId) ?? {};
    existing[t.status] = t.count;
    tallyMap.set(t.runId, existing);
  }

  const clientsByRun = new Map<string, string[]>();
  for (const c of clientRows) {
    const existing = clientsByRun.get(c.runId) ?? [];
    existing.push(c.clientName);
    clientsByRun.set(c.runId, existing);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Runs</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">All runs</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {allRuns.length} run{allRuns.length === 1 ? "" : "s"} total.
        </p>
      </div>

      {allRuns.length === 0 ? (
        <div className="rounded-md border hairline bg-white p-8 text-center text-sm text-zinc-500">
          No runs yet.{" "}
          <Link href="/on-demand" className="underline hover:text-zinc-900">
            Trigger one now.
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border hairline bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b hairline text-xs uppercase tracking-[0.12em] text-zinc-500">
                <th className="px-5 py-3 text-left font-medium">Week</th>
                <th className="px-5 py-3 text-left font-medium">Clients</th>
                <th className="px-5 py-3 text-left font-medium">Kind</th>
                <th className="px-5 py-3 text-left font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Drafted</th>
                <th className="px-5 py-3 text-right font-medium">Sent</th>
                <th className="px-5 py-3 text-right font-medium">Errors</th>
                <th className="px-5 py-3 text-right font-medium">Started</th>
                <th className="px-5 py-3 text-right font-medium" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {allRuns.map((r) => {
                const t = tallyMap.get(r.id) ?? {};
                const drafted = (t.drafted ?? 0) + (t.quiet ?? 0);
                const sent = t.sent ?? 0;
                const errors = t.failed ?? 0;
                const clients = clientsByRun.get(r.id) ?? [];
                const clientsCell = formatClients(clients);
                const confirmMessage =
                  clients.length > 0
                    ? `Delete the ${r.kind} run for ${r.weekLabel} (${clients.length} report${clients.length === 1 ? "" : "s"}: ${clients.join(", ")})? This permanently removes the run and all of its reports.`
                    : `Delete the ${r.kind} run for ${r.weekLabel}? This permanently removes the run.`;
                return (
                  <tr key={r.id} className="border-b hairline last:border-b-0">
                    <td className="px-5 py-3">
                      <Link
                        href={`/runs/${r.id}`}
                        className="font-medium hover:underline"
                      >
                        {r.weekLabel}
                      </Link>
                      <p className="text-xs text-zinc-400">
                        {r.windowStart && r.windowEnd
                          ? formatRange(r.windowStart, r.windowEnd)
                          : ""}
                      </p>
                    </td>
                    <td
                      className="px-5 py-3 text-zinc-700"
                      title={clientsCell.title}
                    >
                      {clientsCell.display}
                    </td>
                    <td className="px-5 py-3 text-zinc-500">{r.kind}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{drafted}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{sent}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-rose-600">
                      {errors > 0 ? errors : "–"}
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-zinc-400">
                      {r.startedAt
                        ? r.startedAt.toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "–"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <DeleteRowButton
                        action={deleteRun.bind(null, r.id)}
                        confirmMessage={confirmMessage}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
