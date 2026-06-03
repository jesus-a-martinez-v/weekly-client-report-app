import type {
  DiscardPayload,
  DraftPayload,
  DraftResponse,
  SendPayload,
} from "@/lib/clients/n8n";
import type { ReviseNarrativeInput } from "@/lib/clients/openrouter";
import type { db } from "@/lib/db/client";
import type {
  AuditEntryInput,
  ClientWithProjects,
  UpdateReportEmailInput,
} from "@/lib/db/repos";
import type { Report } from "@/lib/db/schema";
import type { EmailEditInput } from "@/lib/shared/validation/report";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ReportExecutor = typeof db | Transaction;
type CaptureException = (
  error: unknown,
  context: {
    tags: Record<string, string>;
    extra?: Record<string, unknown>;
  },
) => void;

export type ReportMutationResult = {
  reportId: string;
  runId: string;
};

export type ReportsRepository = {
  findReportById(id: string, executor?: ReportExecutor): Promise<Report | null>;
  updateReportStatus(
    id: string,
    status: string,
    options?: {
      gmailDraftId?: string | null;
      sentAtNow?: boolean;
      discardedAtNow?: boolean;
      clearDraft?: boolean;
    },
    executor?: ReportExecutor,
  ): Promise<void>;
  updateReportEmail(
    id: string,
    input: UpdateReportEmailInput,
    executor?: ReportExecutor,
  ): Promise<void>;
  updateReportNarrative(
    id: string,
    narrativeMd: string,
    executor?: ReportExecutor,
  ): Promise<void>;
  deleteReport(id: string, executor?: ReportExecutor): Promise<void>;
};

export type ReportServiceDeps = {
  reportsRepo: ReportsRepository;
  clientsRepo: {
    findClientById(
      id: string,
      executor?: ReportExecutor,
    ): Promise<ClientWithProjects | null>;
  };
  transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T>;
  recordAuditEntry(
    entry: AuditEntryInput & { tx?: ReportExecutor },
  ): Promise<void>;
  n8n: {
    createDraft(input: DraftPayload): Promise<DraftResponse>;
    sendDraft(input: SendPayload): Promise<unknown>;
    discardDraft(input: DiscardPayload): Promise<unknown>;
  };
  openRouter: {
    reviseNarrative(input: ReviseNarrativeInput): Promise<string>;
  };
  blob: {
    deleteReportPdfs(urls: Array<string | null | undefined>): Promise<void>;
  };
  regenerateReport: {
    trigger(input: { reportId: string }): Promise<unknown>;
  };
  sentry?: {
    captureException: CaptureException;
  };
};

const ACTIONABLE_STATUSES = new Set(["drafted", "quiet"]);

function assertActionable(row: Report, verb: string): void {
  if (!ACTIONABLE_STATUSES.has(row.status)) {
    throw new Error(`Cannot ${verb} a report with status "${row.status}"`);
  }
}

function assertEditable(row: Report): void {
  if (!ACTIONABLE_STATUSES.has(row.status)) {
    throw new Error("Report is not editable");
  }
}

async function requireReport(
  reportId: string,
  deps: ReportServiceDeps,
): Promise<Report> {
  const row = await deps.reportsRepo.findReportById(reportId);
  if (!row) throw new Error("Report not found");
  return row;
}

function captureBestEffort(
  deps: ReportServiceDeps,
  error: unknown,
  operation: string,
  extra: Record<string, unknown>,
): void {
  deps.sentry?.captureException(error, {
    tags: {
      area: "reports",
      reason: "best-effort",
      operation,
    },
    extra,
  });
}

export async function sendReport(
  reportId: string,
  actorEmail: string,
  deps: ReportServiceDeps,
): Promise<ReportMutationResult> {
  const row = await requireReport(reportId, deps);
  assertActionable(row, "send");
  if (!row.gmailDraftId) throw new Error("Report has no Gmail draft id");

  await deps.n8n.sendDraft({ action: "send", draft_id: row.gmailDraftId });

  await deps.transaction(async (tx) => {
    await deps.reportsRepo.updateReportStatus(
      reportId,
      "sent",
      { sentAtNow: true },
      tx,
    );
    await deps.recordAuditEntry({
      actorEmail,
      action: "report.sent",
      entityType: "report",
      entityId: reportId,
      payload: { draftId: row.gmailDraftId },
      tx,
    });
  });

  return { reportId, runId: row.runId };
}

export async function markReportSent(
  reportId: string,
  actorEmail: string,
  deps: ReportServiceDeps,
): Promise<ReportMutationResult> {
  const row = await requireReport(reportId, deps);
  assertActionable(row, "mark");

  if (row.gmailDraftId) {
    try {
      await deps.n8n.discardDraft({
        action: "discard",
        draft_id: row.gmailDraftId,
      });
    } catch (err) {
      captureBestEffort(deps, err, "discard-draft-before-manual-sent", {
        reportId,
        draftId: row.gmailDraftId,
      });
      // Best-effort: keep the manual sent transition unblocked.
    }
  }

  await deps.transaction(async (tx) => {
    await deps.reportsRepo.updateReportStatus(
      reportId,
      "sent",
      { sentAtNow: true, clearDraft: true },
      tx,
    );
    await deps.recordAuditEntry({
      actorEmail,
      action: "report.marked_sent",
      entityType: "report",
      entityId: reportId,
      payload: { draftId: row.gmailDraftId, manual: true },
      tx,
    });
  });

  return { reportId, runId: row.runId };
}

export async function discardReport(
  reportId: string,
  actorEmail: string,
  deps: ReportServiceDeps,
): Promise<ReportMutationResult> {
  const row = await requireReport(reportId, deps);
  assertActionable(row, "discard");
  if (!row.gmailDraftId) throw new Error("Report has no Gmail draft id");

  await deps.n8n.discardDraft({
    action: "discard",
    draft_id: row.gmailDraftId,
  });

  await deps.transaction(async (tx) => {
    await deps.reportsRepo.updateReportStatus(
      reportId,
      "discarded",
      { discardedAtNow: true, clearDraft: true },
      tx,
    );
    await deps.recordAuditEntry({
      actorEmail,
      action: "report.discarded",
      entityType: "report",
      entityId: reportId,
      payload: { draftId: row.gmailDraftId },
      tx,
    });
  });

  return { reportId, runId: row.runId };
}

export async function updateEmailDraft(
  reportId: string,
  input: EmailEditInput,
  actorEmail: string,
  deps: ReportServiceDeps,
): Promise<ReportMutationResult> {
  const row = await requireReport(reportId, deps);
  assertActionable(row, "edit");
  if (!row.gmailDraftId) throw new Error("Report has no Gmail draft id");
  if (!row.clientId) throw new Error("Report has no associated client");

  const clientRow = await deps.clientsRepo.findClientById(row.clientId);
  const client = clientRow?.client;
  if (!client) throw new Error("Client not found");

  const oldDraftId = row.gmailDraftId;
  await deps.n8n.discardDraft({ action: "discard", draft_id: oldDraftId });

  const draftRes = await deps.n8n.createDraft({
    action: "draft",
    to: client.contactEmail,
    subject: input.subject,
    body: input.body,
    pdf_url: row.pdfBlobUrl ?? undefined,
    filename: row.pdfBlobUrl ? (row.pdfFilename ?? undefined) : undefined,
    client_slug: client.slug,
    week_label: row.weekLabel,
  });

  await deps.transaction(async (tx) => {
    await deps.reportsRepo.updateReportEmail(
      reportId,
      {
        subject: input.subject,
        body: input.body,
        gmailDraftId: draftRes.draft_id,
      },
      tx,
    );
    await deps.recordAuditEntry({
      actorEmail,
      action: "report.edited",
      entityType: "report",
      entityId: reportId,
      payload: { oldDraftId, newDraftId: draftRes.draft_id },
      tx,
    });
  });

  return { reportId, runId: row.runId };
}

export async function updateNarrative(
  reportId: string,
  narrativeMd: string,
  actorEmail: string,
  deps: ReportServiceDeps,
): Promise<ReportMutationResult> {
  const trimmed = narrativeMd.trim();
  if (!trimmed) throw new Error("Narrative cannot be empty");

  const row = await requireReport(reportId, deps);
  assertEditable(row);

  await deps.transaction(async (tx) => {
    await deps.reportsRepo.updateReportNarrative(reportId, narrativeMd, tx);
    await deps.recordAuditEntry({
      actorEmail,
      action: "report.narrative_edited",
      entityType: "report",
      entityId: reportId,
      payload: { charCount: narrativeMd.length },
      tx,
    });
  });

  await deps.regenerateReport.trigger({ reportId });

  return { reportId, runId: row.runId };
}

export async function reviseNarrative(
  reportId: string,
  instructions: string,
  actorEmail: string,
  deps: ReportServiceDeps,
): Promise<ReportMutationResult> {
  const trimmed = instructions.trim();
  if (!trimmed) throw new Error("Instructions cannot be empty");

  const row = await requireReport(reportId, deps);
  assertEditable(row);
  if (!row.narrativeMd) throw new Error("No narrative to revise");

  const revised = await deps.openRouter.reviseNarrative({
    clientName: row.clientName,
    currentNarrative: row.narrativeMd,
    instructions: trimmed,
  });

  await deps.transaction(async (tx) => {
    await deps.reportsRepo.updateReportNarrative(reportId, revised, tx);
    await deps.recordAuditEntry({
      actorEmail,
      action: "report.narrative_ai_revised",
      entityType: "report",
      entityId: reportId,
      payload: { instructions: trimmed.slice(0, 500) },
      tx,
    });
  });

  await deps.regenerateReport.trigger({ reportId });

  return { reportId, runId: row.runId };
}

export async function deleteReport(
  reportId: string,
  actorEmail: string,
  deps: ReportServiceDeps,
): Promise<ReportMutationResult> {
  const row = await requireReport(reportId, deps);

  if (ACTIONABLE_STATUSES.has(row.status) && row.gmailDraftId) {
    try {
      await deps.n8n.discardDraft({
        action: "discard",
        draft_id: row.gmailDraftId,
      });
    } catch (err) {
      captureBestEffort(deps, err, "discard-draft-before-delete-report", {
        reportId,
        draftId: row.gmailDraftId,
      });
      // Best-effort: still delete the row even if the draft cannot be reached.
    }
  }

  try {
    await deps.blob.deleteReportPdfs([row.pdfBlobUrl]);
  } catch (err) {
    captureBestEffort(deps, err, "delete-report-pdf-before-delete-report", {
      reportId,
      pdfBlobUrl: row.pdfBlobUrl,
    });
    // Best-effort: still delete the row even if blob cleanup fails.
  }

  await deps.transaction(async (tx) => {
    await deps.reportsRepo.deleteReport(reportId, tx);
    await deps.recordAuditEntry({
      actorEmail,
      action: "report.delete",
      entityType: "report",
      entityId: null,
      payload: {
        reportId,
        runId: row.runId,
        clientName: row.clientName,
        weekLabel: row.weekLabel,
        priorStatus: row.status,
      },
      tx,
    });
  });

  return { reportId, runId: row.runId };
}
