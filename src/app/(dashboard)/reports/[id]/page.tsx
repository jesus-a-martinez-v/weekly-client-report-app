import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";

import { db } from "@/db";
import { clients, reports } from "@/db/schema";
import { StatusPill } from "@/components/status-pill";
import { AutoRefresh } from "@/components/auto-refresh";
import { EmailEditor } from "./email-editor";
import { sendReport, discardReport } from "@/server/actions/reports";
import { formatRange } from "@/lib/window";

export const dynamic = "force-dynamic";

const IN_FLIGHT = new Set(["pending", "fetching", "narrating", "rendering"]);
const ACTIONABLE = new Set(["drafted", "quiet"]);

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [row] = await db
    .select({
      id: reports.id,
      runId: reports.runId,
      clientId: reports.clientId,
      clientName: reports.clientName,
      weekLabel: reports.weekLabel,
      windowStart: reports.windowStart,
      windowEnd: reports.windowEnd,
      status: reports.status,
      totalsPrs: reports.totalsPrs,
      totalsIssues: reports.totalsIssues,
      totalsCommits: reports.totalsCommits,
      narrativeMd: reports.narrativeMd,
      emailSubject: reports.emailSubject,
      emailBody: reports.emailBody,
      pdfBlobUrl: reports.pdfBlobUrl,
      pdfFilename: reports.pdfFilename,
      gmailDraftId: reports.gmailDraftId,
      sentAt: reports.sentAt,
      discardedAt: reports.discardedAt,
      errorMessage: reports.errorMessage,
      createdAt: reports.createdAt,
      updatedAt: reports.updatedAt,
    })
    .from(reports)
    .where(eq(reports.id, id));

  if (!row) notFound();

  const isInflight = IN_FLIGHT.has(row.status);
  const isActionable = ACTIONABLE.has(row.status);

  const dateRange =
    row.windowStart && row.windowEnd
      ? formatRange(row.windowStart, row.windowEnd)
      : row.weekLabel;

  const narrativeHtml = row.narrativeMd
    ? await marked.parse(row.narrativeMd)
    : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-2 flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/reports" className="hover:text-zinc-900">
          Reports
        </Link>
        <span>/</span>
        <span className="text-zinc-700">{row.clientName}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">{row.clientName}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {dateRange} · week {row.weekLabel}
          </p>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <AutoRefresh active={isInflight} />
          <StatusPill status={row.status} />
        </div>
      </div>

      <div className="mt-6 flex gap-6 text-sm">
        <div className="text-center">
          <p className="text-2xl font-semibold tabular-nums">{row.totalsPrs}</p>
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">PRs</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-semibold tabular-nums">{row.totalsIssues}</p>
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Issues</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-semibold tabular-nums">{row.totalsCommits}</p>
          <p className="text-xs uppercase tracking-[0.12em] text-zinc-500">Commits</p>
        </div>
        <div className="ml-auto text-right text-xs text-zinc-400">
          <Link href={`/runs/${row.runId}`} className="hover:text-zinc-700">
            View run →
          </Link>
        </div>
      </div>

      {row.errorMessage && (
        <div className="mt-6 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <strong>Error:</strong> {row.errorMessage}
        </div>
      )}

      {isInflight && (
        <div className="mt-10 rounded-md border hairline bg-white p-8 text-center text-sm text-zinc-500">
          Pipeline running — status: <strong>{row.status}</strong>. This page
          refreshes automatically.
        </div>
      )}

      {narrativeHtml && (
        <section className="mt-10">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 mb-3">
            Narrative
          </p>
          <div
            className="prose prose-sm max-w-none rounded-md border hairline bg-white px-6 py-5"
            dangerouslySetInnerHTML={{ __html: narrativeHtml }}
          />
        </section>
      )}

      {row.pdfBlobUrl && (
        <section className="mt-8">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 mb-3">
            PDF
          </p>
          <a
            href={row.pdfBlobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border hairline bg-white px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            ↓ {row.pdfFilename ?? "Download PDF"}
          </a>
        </section>
      )}

      {isActionable && row.emailSubject && row.emailBody && (
        <section className="mt-10">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 mb-3">
            Email draft
          </p>
          <div className="rounded-md border hairline bg-white p-6">
            <EmailEditor
              reportId={id}
              initialSubject={row.emailSubject}
              initialBody={row.emailBody}
            />
          </div>
        </section>
      )}

      {isActionable && (
        <section className="mt-8 flex items-center gap-3">
          <form action={sendReport.bind(null, id)}>
            <button
              type="submit"
              className="rounded-md border border-emerald-700 bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Send
            </button>
          </form>
          <form action={discardReport.bind(null, id)}>
            <button
              type="submit"
              className="rounded-md border hairline bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Discard
            </button>
          </form>
        </section>
      )}

      {row.status === "sent" && row.sentAt && (
        <p className="mt-8 text-sm text-zinc-500">
          Sent{" "}
          {row.sentAt.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
          .
        </p>
      )}

      {row.status === "discarded" && row.discardedAt && (
        <p className="mt-8 text-sm text-zinc-500">
          Discarded{" "}
          {row.discardedAt.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
          .{" "}
          <Link href="/on-demand" className="underline hover:text-zinc-900">
            Trigger a new report →
          </Link>
        </p>
      )}
    </div>
  );
}
