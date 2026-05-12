import { task, logger } from "@trigger.dev/sdk/v3";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, clients, projects, reports, runs } from "@/db/schema";
import { fetchClientActivity } from "@/lib/octokit";
import {
  generateEmailDraft,
  generateNarrative,
  quietWeekNarrative,
} from "@/lib/openrouter";
import { renderReportHtml } from "@/lib/pdf-template";
import { renderPdfBuffer } from "@/lib/pdf";
import { uploadReportPdf } from "@/lib/blob";
import { postN8n } from "@/lib/n8n";
import {
  bogotaDateISO,
  formatRange,
  isoWeekToWindow,
  reportFilename,
  reportingWindow,
  type ReportingWindow,
} from "@/lib/window";

const SYSTEM_ACTOR = "system@trigger.dev";

export type GenerateClientReportPayload = {
  clientId: string;
  weekLabel?: string;
  runId?: string;
  onDemand?: boolean;
};

export type GenerateClientReportResult = {
  reportId: string;
  status: "drafted" | "quiet" | "failed";
  totals: { prs: number; issues: number; commits: number };
};

async function ensureRun(
  payload: GenerateClientReportPayload,
  window: ReportingWindow,
  triggerRunId: string,
): Promise<string> {
  if (payload.runId) return payload.runId;
  const [row] = await db
    .insert(runs)
    .values({
      kind: payload.onDemand ? "on_demand" : "weekly",
      weekLabel: window.weekLabel,
      windowStart: window.start,
      windowEnd: window.end,
      status: "running",
      triggerRunId,
      startedAt: sql`now()`,
    })
    .returning({ id: runs.id });
  return row.id;
}

export const generateClientReport = task({
  id: "generate-client-report",
  maxDuration: 600,
  run: async (
    payload: GenerateClientReportPayload,
    { ctx },
  ): Promise<GenerateClientReportResult> => {
    const client = await db.query.clients.findFirst({
      where: eq(clients.id, payload.clientId),
    });
    if (!client) throw new Error(`Client not found: ${payload.clientId}`);

    if (client.status !== "active" && !payload.onDemand) {
      logger.info("Skipping disabled client", { clientId: client.id });
      throw new Error(`Client ${client.slug} is disabled and not on-demand`);
    }

    const projectRows = await db
      .select()
      .from(projects)
      .where(eq(projects.clientId, client.id))
      .orderBy(projects.position);
    if (projectRows.length === 0) {
      throw new Error(`Client ${client.slug} has no projects configured`);
    }

    const window = payload.weekLabel
      ? isoWeekToWindow(payload.weekLabel)
      : reportingWindow();

    const runId = await ensureRun(payload, window, ctx.run.id);
    const dateRange = formatRange(window.start, window.end);
    const startDateISO = bogotaDateISO(window.start);
    const filename = reportFilename(client.name, startDateISO);

    const existing = await db
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(eq(reports.clientId, client.id), eq(reports.weekLabel, window.weekLabel)),
      )
      .limit(1);

    let reportId: string;
    if (existing[0]) {
      reportId = existing[0].id;
      await db
        .update(reports)
        .set({
          runId,
          status: "fetching",
          clientName: client.name,
          windowStart: window.start,
          windowEnd: window.end,
          triggerRunId: ctx.run.id,
          errorMessage: null,
          updatedAt: sql`now()`,
        })
        .where(eq(reports.id, reportId));
    } else {
      const [row] = await db
        .insert(reports)
        .values({
          runId,
          clientId: client.id,
          clientName: client.name,
          weekLabel: window.weekLabel,
          windowStart: window.start,
          windowEnd: window.end,
          status: "fetching",
          triggerRunId: ctx.run.id,
        })
        .returning({ id: reports.id });
      reportId = row.id;
    }

    try {
      const activity = await fetchClientActivity({
        client: {
          name: client.name,
          slug: client.slug,
          contact_name: client.contactName,
          contact_email: client.contactEmail,
          tone: client.tone,
        },
        projects: projectRows.map((p) => ({ name: p.name, repos: p.repos })),
        window: { start: window.start, end: window.end, label: dateRange },
      });

      const isQuiet =
        activity.totals.prs === 0 &&
        activity.totals.issues === 0 &&
        activity.totals.commits === 0;

      await db
        .update(reports)
        .set({
          status: "narrating",
          activityJson: activity,
          totalsPrs: activity.totals.prs,
          totalsIssues: activity.totals.issues,
          totalsCommits: activity.totals.commits,
          updatedAt: sql`now()`,
        })
        .where(eq(reports.id, reportId));

      const narrative = isQuiet
        ? quietWeekNarrative({
            clientName: client.name,
            contactName: client.contactName,
            dateRange,
          })
        : await generateNarrative({
            clientName: client.name,
            contactName: client.contactName,
            tone: client.tone,
            dateRange,
            activity,
          });

      let pdfUrl: string | undefined;
      let pdfPathname: string | undefined;

      if (!isQuiet) {
        await db
          .update(reports)
          .set({ status: "rendering", narrativeMd: narrative, updatedAt: sql`now()` })
          .where(eq(reports.id, reportId));

        const html = renderReportHtml({
          clientName: client.name,
          weekLabel: window.weekLabel,
          dateRange,
          narrativeMd: narrative,
        });
        const buf = await renderPdfBuffer(html);
        const uploaded = await uploadReportPdf({
          weekLabel: window.weekLabel,
          slug: client.slug,
          startDateISO,
          filename,
          body: buf,
        });
        pdfUrl = uploaded.url;
        pdfPathname = uploaded.pathname;

        await db
          .update(reports)
          .set({
            pdfBlobUrl: pdfUrl,
            pdfFilename: filename,
            updatedAt: sql`now()`,
          })
          .where(eq(reports.id, reportId));
      } else {
        await db
          .update(reports)
          .set({ narrativeMd: narrative, updatedAt: sql`now()` })
          .where(eq(reports.id, reportId));
      }

      const email = await generateEmailDraft({
        clientName: client.name,
        contactName: client.contactName,
        dateRange,
        narrativeMd: narrative,
      });

      await db
        .update(reports)
        .set({
          emailSubject: email.subject,
          emailBody: email.body,
          updatedAt: sql`now()`,
        })
        .where(eq(reports.id, reportId));

      const draftRes = await postN8n({
        action: "draft",
        to: client.contactEmail,
        subject: email.subject,
        body: email.body,
        pdf_url: pdfUrl,
        filename: pdfUrl ? filename : undefined,
        client_slug: client.slug,
        week_label: window.weekLabel,
      });

      const finalStatus = isQuiet ? "quiet" : "drafted";

      await db.transaction(async (tx) => {
        await tx
          .update(reports)
          .set({
            gmailDraftId: draftRes.draft_id,
            status: finalStatus,
            updatedAt: sql`now()`,
          })
          .where(eq(reports.id, reportId));
        await tx.insert(auditLog).values({
          actorEmail: SYSTEM_ACTOR,
          action: finalStatus === "quiet" ? "report.quiet" : "report.drafted",
          entityType: "report",
          entityId: reportId,
          payload: {
            clientSlug: client.slug,
            weekLabel: window.weekLabel,
            draftId: draftRes.draft_id,
            pdfPathname: pdfPathname ?? null,
            totals: activity.totals,
          },
        });
      });

      logger.info("Report drafted", {
        clientSlug: client.slug,
        weekLabel: window.weekLabel,
        status: finalStatus,
        totals: activity.totals,
      });

      return {
        reportId,
        status: finalStatus,
        totals: activity.totals,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(reports)
        .set({
          status: "failed",
          errorMessage: message.slice(0, 2000),
          updatedAt: sql`now()`,
        })
        .where(eq(reports.id, reportId));
      logger.error("Report failed", { clientSlug: client.slug, error: message });
      throw err;
    }
  },
});
