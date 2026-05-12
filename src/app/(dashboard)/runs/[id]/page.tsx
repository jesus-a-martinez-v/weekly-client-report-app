import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { reports, runs } from "@/db/schema";
import { StatusPill } from "@/components/status-pill";
import { AutoRefresh } from "@/components/auto-refresh";
import { formatRange } from "@/lib/window";

export const dynamic = "force-dynamic";

const RUN_IN_FLIGHT = new Set(["queued", "running"]);
const REPORT_IN_FLIGHT = new Set(["pending", "fetching", "narrating", "rendering"]);

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [run] = await db
    .select()
    .from(runs)
    .where(eq(runs.id, id));

  if (!run) notFound();

  const childReports = await db
    .select({
      id: reports.id,
      clientName: reports.clientName,
      status: reports.status,
      totalsPrs: reports.totalsPrs,
      totalsIssues: reports.totalsIssues,
      totalsCommits: reports.totalsCommits,
      updatedAt: reports.updatedAt,
    })
    .from(reports)
    .where(eq(reports.runId, id))
    .orderBy(asc(reports.clientName));

  const runInflight = RUN_IN_FLIGHT.has(run.status);
  const anyChildInflight = childReports.some((r) => REPORT_IN_FLIGHT.has(r.status));
  const shouldRefresh = runInflight || anyChildInflight;

  const dateRange =
    run.windowStart && run.windowEnd
      ? formatRange(run.windowStart, run.windowEnd)
      : run.weekLabel;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/runs" className="hover:text-zinc-900">
          Runs
        </Link>
        <span>/</span>
        <span className="text-zinc-700">{run.weekLabel}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">
            {run.weekLabel}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {dateRange} · {run.kind}
          </p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <AutoRefresh active={shouldRefresh} />
          <StatusPill status={run.status} />
        </div>
      </div>

      {run.errorMessage && (
        <div className="mt-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <strong>Error:</strong> {run.errorMessage}
        </div>
      )}

      <div className="mt-6 flex gap-6 text-sm text-zinc-500">
        {run.startedAt && (
          <span>
            Started{" "}
            {run.startedAt.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        )}
        {run.finishedAt && (
          <span>
            Finished{" "}
            {run.finishedAt.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>

      <section className="mt-10">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 mb-3">
          Reports ({childReports.length})
        </p>
        {childReports.length === 0 ? (
          <div className="rounded-md border hairline bg-white p-6 text-sm text-zinc-500">
            No reports yet — the job may still be starting.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border hairline bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b hairline text-xs uppercase tracking-[0.12em] text-zinc-500">
                  <th className="px-5 py-3 text-left font-medium">Client</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">PRs</th>
                  <th className="px-5 py-3 text-right font-medium">Issues</th>
                  <th className="px-5 py-3 text-right font-medium">Commits</th>
                  <th className="px-5 py-3 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {childReports.map((r) => (
                  <tr key={r.id} className="border-b hairline last:border-b-0">
                    <td className="px-5 py-3">
                      <Link
                        href={`/reports/${r.id}`}
                        className="font-medium hover:underline"
                      >
                        {r.clientName}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{r.totalsPrs}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{r.totalsIssues}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{r.totalsCommits}</td>
                    <td className="px-5 py-3 text-right text-xs text-zinc-400">
                      {r.updatedAt.toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
