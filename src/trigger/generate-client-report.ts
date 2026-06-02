import { task, logger } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db/client";
import {
  createReport,
  createRun,
  findClientById,
  findReportByClientWeek,
  recordAuditEntry,
  resetReportForRun,
  updateReportActivity,
  updateReportEmail,
  updateReportFailure,
  updateReportNarrative,
  updateReportPdf,
  updateReportStatus,
  updateRunStatus,
} from "@/lib/db/repos";
import { fetchClientActivity } from "@/lib/clients/octokit";
import {
  generateEmailDraft,
  generateNarrative,
  quietWeekNarrative,
} from "@/lib/clients/openrouter";
import { renderReportHtml } from "@/lib/shared/pdf-template";
import { renderPdfBuffer } from "@/lib/clients/pdf";
import { uploadReportPdf } from "@/lib/clients/blob";
import { postN8n } from "@/lib/clients/n8n";
import {
  bogotaDateISO,
  formatRange,
  isoWeekToWindow,
  reportFilename,
  reportingWindow,
  type ReportingWindow,
} from "@/lib/shared/window";

const SYSTEM_ACTOR = "system";

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
  return createRun({
    kind: payload.onDemand ? "on_demand" : "weekly",
    weekLabel: window.weekLabel,
    windowStart: window.start,
    windowEnd: window.end,
    triggerRunId,
  });
}

export const generateClientReport = task({
  id: "generate-client-report",
  maxDuration: 600,
  run: async (
    payload: GenerateClientReportPayload,
    { ctx },
  ): Promise<GenerateClientReportResult> => {
    const clientRow = await findClientById(payload.clientId);
    if (!clientRow) throw new Error(`Client not found: ${payload.clientId}`);

    const { client, projects: projectRows } = clientRow;
    if (client.status !== "active" && !payload.onDemand) {
      logger.info("Skipping disabled client", { clientId: client.id });
      throw new Error(`Client ${client.slug} is disabled and not on-demand`);
    }

    if (projectRows.length === 0) {
      throw new Error(`Client ${client.slug} has no projects configured`);
    }

    const window = payload.weekLabel
      ? isoWeekToWindow(payload.weekLabel)
      : reportingWindow();

    const ownsRun = !payload.runId || !!payload.onDemand;
    const runId = await ensureRun(payload, window, ctx.run.id);
    const dateRange = formatRange(window.start, window.end);
    const startDateISO = bogotaDateISO(window.start);
    const filename = reportFilename(client.name, startDateISO);

    const existing = await findReportByClientWeek(client.id, window.weekLabel);

    let reportId: string;
    if (existing) {
      reportId = existing.id;
      await resetReportForRun(reportId, {
        runId,
        clientName: client.name,
        windowStart: window.start,
        windowEnd: window.end,
        triggerRunId: ctx.run.id,
      });
    } else {
      reportId = await createReport({
        runId,
        clientId: client.id,
        clientName: client.name,
        weekLabel: window.weekLabel,
        windowStart: window.start,
        windowEnd: window.end,
        status: "fetching",
        triggerRunId: ctx.run.id,
      });
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

      await updateReportActivity(reportId, {
        activityJson: activity,
        totalsPrs: activity.totals.prs,
        totalsIssues: activity.totals.issues,
        totalsCommits: activity.totals.commits,
      });

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
        await updateReportStatus(reportId, "rendering");
        await updateReportNarrative(reportId, narrative);

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

        await updateReportPdf(reportId, {
          pdfBlobUrl: pdfUrl,
          pdfFilename: filename,
        });
      } else {
        await updateReportNarrative(reportId, narrative);
      }

      const email = await generateEmailDraft({
        clientName: client.name,
        contactName: client.contactName,
        dateRange,
        narrativeMd: narrative,
      });

      await updateReportEmail(reportId, {
        subject: email.subject,
        body: email.body,
      });

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
        await updateReportStatus(
          reportId,
          finalStatus,
          { gmailDraftId: draftRes.draft_id },
          tx,
        );
        await recordAuditEntry({
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
          tx,
        });
      });

      if (ownsRun) {
        await updateRunStatus(runId, "succeeded");
      }

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
      await updateReportFailure(reportId, message);
      await recordAuditEntry({
        actorEmail: SYSTEM_ACTOR,
        action: "report.failed",
        entityType: "report",
        entityId: reportId,
        payload: {
          clientSlug: client.slug,
          weekLabel: window.weekLabel,
          error: message.slice(0, 500),
        },
      });
      if (ownsRun) {
        await updateRunStatus(runId, "failed", {
          errorMessage: message.slice(0, 2000),
        });
      }
      logger.error("Report failed", { clientSlug: client.slug, error: message });
      throw err;
    }
  },
});
