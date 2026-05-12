import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import { clients, reports } from "@/db/schema";
import { StatusPill } from "@/components/status-pill";
import { formatRange } from "@/lib/window";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; status?: string; weekLabel?: string }>;
}) {
  const params = await searchParams;

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .orderBy(asc(clients.name));

  let query = db
    .select({
      id: reports.id,
      clientId: reports.clientId,
      clientName: reports.clientName,
      weekLabel: reports.weekLabel,
      windowStart: reports.windowStart,
      windowEnd: reports.windowEnd,
      status: reports.status,
      totalsPrs: reports.totalsPrs,
      totalsIssues: reports.totalsIssues,
      totalsCommits: reports.totalsCommits,
      createdAt: reports.createdAt,
    })
    .from(reports)
    .$dynamic();

  if (params.clientId) {
    query = query.where(eq(reports.clientId, params.clientId));
  }
  if (params.status) {
    query = query.where(eq(reports.status, params.status));
  }
  if (params.weekLabel) {
    query = query.where(eq(reports.weekLabel, params.weekLabel));
  }

  const rows = await query.orderBy(desc(reports.createdAt));

  const currentFilters = new URLSearchParams();
  if (params.clientId) currentFilters.set("clientId", params.clientId);
  if (params.status) currentFilters.set("status", params.status);
  if (params.weekLabel) currentFilters.set("weekLabel", params.weekLabel);
  const hasFilters = currentFilters.size > 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Reports</p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">All reports</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {rows.length} report{rows.length === 1 ? "" : "s"}
            {hasFilters ? " matching filters" : ""}.
          </p>
        </div>
        <Link
          href="/on-demand"
          className="rounded-md border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          + Trigger report
        </Link>
      </div>

      <form method="GET" className="mb-6 flex flex-wrap gap-3">
        <select
          name="clientId"
          defaultValue={params.clientId ?? ""}
          className="rounded-md border hairline bg-white px-3 py-1.5 text-sm text-zinc-700"
        >
          <option value="">All clients</option>
          {allClients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={params.status ?? ""}
          className="rounded-md border hairline bg-white px-3 py-1.5 text-sm text-zinc-700"
        >
          <option value="">All statuses</option>
          {["pending","fetching","narrating","rendering","drafted","quiet","sent","discarded","failed"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          name="weekLabel"
          type="text"
          defaultValue={params.weekLabel ?? ""}
          placeholder="e.g. 2025-W20"
          className="rounded-md border hairline bg-white px-3 py-1.5 text-sm text-zinc-700 placeholder-zinc-400"
        />
        <button
          type="submit"
          className="rounded-md border hairline bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        >
          Filter
        </button>
        {hasFilters && (
          <Link
            href="/reports"
            className="rounded-md px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-900"
          >
            Clear
          </Link>
        )}
      </form>

      {rows.length === 0 ? (
        <div className="rounded-md border hairline bg-white p-8 text-center text-sm text-zinc-500">
          No reports found.{" "}
          <Link href="/on-demand" className="underline hover:text-zinc-900">
            Trigger one now.
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border hairline bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b hairline text-xs uppercase tracking-[0.12em] text-zinc-500">
                <th className="px-5 py-3 text-left font-medium">Client</th>
                <th className="px-5 py-3 text-left font-medium">Week</th>
                <th className="px-5 py-3 text-left font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">PRs</th>
                <th className="px-5 py-3 text-right font-medium">Issues</th>
                <th className="px-5 py-3 text-right font-medium">Commits</th>
                <th className="px-5 py-3 text-right font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b hairline last:border-b-0">
                  <td className="px-5 py-3">
                    <Link
                      href={`/reports/${r.id}`}
                      className="font-medium hover:underline"
                    >
                      {r.clientName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-zinc-600">
                    {r.weekLabel}
                    <span className="ml-1.5 text-zinc-400">
                      {r.windowStart && r.windowEnd
                        ? formatRange(r.windowStart, r.windowEnd)
                        : ""}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.totalsPrs}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.totalsIssues}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.totalsCommits}</td>
                  <td className="px-5 py-3 text-right text-zinc-500 text-xs">
                    {r.createdAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
