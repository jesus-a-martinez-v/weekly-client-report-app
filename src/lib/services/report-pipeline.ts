import type {
  DraftPayload,
  DraftResponse,
} from "@/lib/clients/n8n";
import type {
  ClientActivity,
  FetchClientActivityInput,
} from "@/lib/clients/octokit";
import type {
  EmailDraft,
  EmailDraftInput,
  NarrativeInput,
} from "@/lib/clients/openrouter";
import type {
  UploadedBlob,
  UploadPdfInput,
} from "@/lib/clients/blob";
import type { db } from "@/lib/db/client";
import type {
  AuditEntryInput,
  ClientWithProjects,
  CreateReportInput,
  ResetReportForRunInput,
  UpdateReportActivityInput,
  UpdateReportEmailInput,
  UpdateReportPdfInput,
  UpdateReportStatusOptions,
} from "@/lib/db/repos";
import type { Report } from "@/lib/db/schema";
import { renderReportHtml } from "@/lib/shared/pdf-template";
import {
  bogotaDateISO,
  formatRange,
  isoWeekToWindow,
  reportFilename,
  reportingWindow,
  type ReportingWindow,
} from "@/lib/shared/window";
import {
  markRunFailed,
  markRunSucceeded,
  startRun,
  type RunLifecycleDeps,
} from "@/lib/services/runs";

const SYSTEM_ACTOR = "system";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PipelineExecutor = typeof db | Transaction;

type PipelineLogFn = (
  message: string,
  properties?: Record<string, unknown>,
) => void;

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

export type ReportPipelineContext = {
  triggerRunId?: string | null;
  logger?: {
    info?: PipelineLogFn;
    error?: PipelineLogFn;
  };
};

export type ReportPipelineDeps = {
  clientsRepo: {
    findClientById(
      id: string,
      executor?: PipelineExecutor,
    ): Promise<ClientWithProjects | null>;
  };
  reportsRepo: {
    findReportByClientWeek(
      clientId: string,
      weekLabel: string,
      executor?: PipelineExecutor,
    ): Promise<Report | null>;
    createReport(
      input: CreateReportInput,
      executor?: PipelineExecutor,
    ): Promise<string>;
    resetReportForRun(
      id: string,
      input: ResetReportForRunInput,
      executor?: PipelineExecutor,
    ): Promise<void>;
    updateReportActivity(
      id: string,
      input: UpdateReportActivityInput,
      executor?: PipelineExecutor,
    ): Promise<void>;
    updateReportStatus(
      id: string,
      status: string,
      options?: UpdateReportStatusOptions,
      executor?: PipelineExecutor,
    ): Promise<void>;
    updateReportNarrative(
      id: string,
      narrativeMd: string,
      executor?: PipelineExecutor,
    ): Promise<void>;
    updateReportPdf(
      id: string,
      input: UpdateReportPdfInput,
      executor?: PipelineExecutor,
    ): Promise<void>;
    updateReportEmail(
      id: string,
      input: UpdateReportEmailInput,
      executor?: PipelineExecutor,
    ): Promise<void>;
    updateReportFailure(
      id: string,
      message: string,
      executor?: PipelineExecutor,
    ): Promise<void>;
  };
  runLifecycle: RunLifecycleDeps;
  transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T>;
  recordAuditEntry(
    entry: AuditEntryInput & { tx?: PipelineExecutor },
  ): Promise<void>;
  activity: {
    fetchClientActivity(
      input: FetchClientActivityInput,
    ): Promise<ClientActivity>;
  };
  openRouter: {
    generateNarrative(input: NarrativeInput): Promise<string>;
    generateEmailDraft(input: EmailDraftInput): Promise<EmailDraft>;
    quietWeekNarrative(input: {
      clientName: string;
      contactName: string;
      dateRange: string;
    }): string;
  };
  pdf: {
    renderPdfBuffer(html: string): Promise<Buffer>;
  };
  blob: {
    uploadReportPdf(input: UploadPdfInput): Promise<UploadedBlob>;
  };
  n8n: {
    createDraft(input: DraftPayload): Promise<DraftResponse>;
  };
};

function log(
  context: ReportPipelineContext,
  level: "info" | "error",
  message: string,
  properties?: Record<string, unknown>,
): void {
  context.logger?.[level]?.(message, properties);
}

async function ensureRun(
  payload: GenerateClientReportPayload,
  window: ReportingWindow,
  triggerRunId: string | null,
  deps: ReportPipelineDeps,
): Promise<string> {
  if (payload.runId) return payload.runId;

  return startRun(
    {
      kind: payload.onDemand ? "on_demand" : "weekly",
      weekLabel: window.weekLabel,
      windowStart: window.start,
      windowEnd: window.end,
      triggerRunId,
    },
    deps.runLifecycle,
  );
}

export async function generateReportForClient(
  payload: GenerateClientReportPayload,
  deps: ReportPipelineDeps,
  context: ReportPipelineContext = {},
): Promise<GenerateClientReportResult> {
  const clientRow = await deps.clientsRepo.findClientById(payload.clientId);
  if (!clientRow) throw new Error(`Client not found: ${payload.clientId}`);

  const { client, projects: projectRows } = clientRow;
  if (client.status !== "active" && !payload.onDemand) {
    log(context, "info", "Skipping disabled client", { clientId: client.id });
    throw new Error(`Client ${client.slug} is disabled and not on-demand`);
  }

  if (projectRows.length === 0) {
    throw new Error(`Client ${client.slug} has no projects configured`);
  }

  const window = payload.weekLabel
    ? isoWeekToWindow(payload.weekLabel)
    : reportingWindow();
  const triggerRunId = context.triggerRunId ?? null;
  const ownsRun = !payload.runId || !!payload.onDemand;
  const runId = await ensureRun(payload, window, triggerRunId, deps);
  const dateRange = formatRange(window.start, window.end);
  const startDateISO = bogotaDateISO(window.start);
  const filename = reportFilename(client.name, startDateISO);

  const existing = await deps.reportsRepo.findReportByClientWeek(
    client.id,
    window.weekLabel,
  );

  let reportId: string;
  if (existing) {
    reportId = existing.id;
    await deps.reportsRepo.resetReportForRun(reportId, {
      runId,
      clientName: client.name,
      windowStart: window.start,
      windowEnd: window.end,
      triggerRunId,
    });
  } else {
    reportId = await deps.reportsRepo.createReport({
      runId,
      clientId: client.id,
      clientName: client.name,
      weekLabel: window.weekLabel,
      windowStart: window.start,
      windowEnd: window.end,
      status: "fetching",
      triggerRunId,
    });
  }

  try {
    const activity = await deps.activity.fetchClientActivity({
      client: {
        name: client.name,
        slug: client.slug,
        contact_name: client.contactName,
        contact_email: client.contactEmail,
        tone: client.tone,
      },
      projects: projectRows.map((project) => ({
        name: project.name,
        repos: project.repos,
      })),
      window: { start: window.start, end: window.end, label: dateRange },
    });

    const isQuiet =
      activity.totals.prs === 0 &&
      activity.totals.issues === 0 &&
      activity.totals.commits === 0;

    await deps.reportsRepo.updateReportActivity(reportId, {
      activityJson: activity,
      totalsPrs: activity.totals.prs,
      totalsIssues: activity.totals.issues,
      totalsCommits: activity.totals.commits,
    });

    const narrative = isQuiet
      ? deps.openRouter.quietWeekNarrative({
          clientName: client.name,
          contactName: client.contactName,
          dateRange,
        })
      : await deps.openRouter.generateNarrative({
          clientName: client.name,
          contactName: client.contactName,
          tone: client.tone,
          dateRange,
          activity,
        });

    let pdfUrl: string | undefined;
    let pdfPathname: string | undefined;

    if (!isQuiet) {
      await deps.reportsRepo.updateReportStatus(reportId, "rendering");
      await deps.reportsRepo.updateReportNarrative(reportId, narrative);

      const html = renderReportHtml({
        clientName: client.name,
        weekLabel: window.weekLabel,
        dateRange,
        narrativeMd: narrative,
      });
      const buf = await deps.pdf.renderPdfBuffer(html);
      const uploaded = await deps.blob.uploadReportPdf({
        weekLabel: window.weekLabel,
        slug: client.slug,
        startDateISO,
        filename,
        body: buf,
      });
      pdfUrl = uploaded.url;
      pdfPathname = uploaded.pathname;

      await deps.reportsRepo.updateReportPdf(reportId, {
        pdfBlobUrl: pdfUrl,
        pdfFilename: filename,
      });
    } else {
      await deps.reportsRepo.updateReportNarrative(reportId, narrative);
    }

    const email = await deps.openRouter.generateEmailDraft({
      clientName: client.name,
      contactName: client.contactName,
      dateRange,
      narrativeMd: narrative,
    });

    await deps.reportsRepo.updateReportEmail(reportId, {
      subject: email.subject,
      body: email.body,
    });

    const draftRes = await deps.n8n.createDraft({
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

    await deps.transaction(async (tx) => {
      await deps.reportsRepo.updateReportStatus(
        reportId,
        finalStatus,
        { gmailDraftId: draftRes.draft_id },
        tx,
      );
      await deps.recordAuditEntry({
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
      await markRunSucceeded(runId, deps.runLifecycle);
    }

    log(context, "info", "Report drafted", {
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
    await deps.reportsRepo.updateReportFailure(reportId, message);
    await deps.recordAuditEntry({
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
      await markRunFailed(
        runId,
        message.slice(0, 2000),
        deps.runLifecycle,
      );
    }
    log(context, "error", "Report failed", {
      clientSlug: client.slug,
      error: message,
    });
    throw err;
  }
}
