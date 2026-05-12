import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import { reports, runs } from "@/db/schema";
import { StatusPill } from "@/components/status-pill";
import { formatRange } from "@/lib/window";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const allRuns = await db
    .select({
      id: runs.id,
      kind: runs.kind,
      weekLabel: runs.weekLabel,
      windowStart: runs.windowStart,
      windowEnd: runs.windowEnd,
      status: runs.status,
      startedAt: runs.startedAt,
      finishedAt: runs.finishedAt,
      errorMessage: runs.errorMessage,
      createdAt: runs.createdAt,
    })
    .from(runs)
    .orderBy(desc(runs.createdAt));

  const tallies = await db
    .select({
      runId: reports.runId,
      status: reports.status,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(reports)
    .groupBy(reports.runId, reports.status);

  const tallyMap = new Map<string, Record<string, number>>();
  for (const t of tallies) {
    const existing = tallyMap.get(t.runId) ?? {};
    existing[t.status] = t.count;
    tallyMap.set(t.runId, existing);
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
                <th className="px-5 py-3 text-left font-medium">Kind</th>
                <th className="px-5 py-3 text-left font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Drafted</th>
                <th className="px-5 py-3 text-right font-medium">Sent</th>
                <th className="px-5 py-3 text-right font-medium">Errors</th>
                <th className="px-5 py-3 text-right font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {allRuns.map((r) => {
                const t = tallyMap.get(r.id) ?? {};
                const drafted = (t.drafted ?? 0) + (t.quiet ?? 0);
                const sent = t.sent ?? 0;
                const errors = t.failed ?? 0;
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
