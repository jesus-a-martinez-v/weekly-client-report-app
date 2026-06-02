import type { DiscardPayload } from "@/lib/clients/n8n";
import type { db } from "@/lib/db/client";
import type { AuditEntryInput, CreateRunInput } from "@/lib/db/repos";
import type { Report, Run } from "@/lib/db/schema";
import type { OnDemandInput } from "@/lib/shared/validation/report";
import { isoWeekToWindow, reportingWindow } from "@/lib/shared/window";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type RunExecutor = typeof db | Transaction;

export type RunTerminalStatus = "succeeded" | "failed" | "partial";

export type RunSummary = {
  drafted: number;
  quiet: number;
  errors: number;
};

type RunAuditInput = {
  actorEmail: string;
  action?: string;
  payload?: Record<string, unknown>;
};

export type RunLifecycleRepository = {
  createRun(input: CreateRunInput, executor?: RunExecutor): Promise<string>;
  updateRunStatus(
    id: string,
    status: string,
    options?: { errorMessage?: string | null },
    executor?: RunExecutor,
  ): Promise<void>;
  updateRunTriggerRunId(
    id: string,
    triggerRunId: string,
    executor?: RunExecutor,
  ): Promise<void>;
};

export type RunLifecycleDeps = {
  repo: RunLifecycleRepository;
  transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T>;
  recordAuditEntry(
    entry: AuditEntryInput & { tx?: RunExecutor },
  ): Promise<void>;
};

export type OnDemandRunDeps = RunLifecycleDeps & {
  generateClientReport: {
    trigger(input: {
      clientId: string;
      weekLabel: string;
      runId: string;
      onDemand: true;
    }): Promise<{ id: string }>;
  };
};

export type RunDeletionDeps = RunLifecycleDeps & {
  repo: RunLifecycleRepository & {
    findRunById(id: string, executor?: RunExecutor): Promise<Run | null>;
    deleteRunById(id: string, executor?: RunExecutor): Promise<void>;
  };
  reportsRepo: {
    listReportsForRun(runId: string, executor?: RunExecutor): Promise<Report[]>;
  };
  n8n: {
    discardDraft(input: DiscardPayload): Promise<unknown>;
  };
  blob: {
    deleteReportPdfs(urls: Array<string | null | undefined>): Promise<void>;
  };
};

const ACTIONABLE_DRAFT_STATUSES = new Set(["drafted", "quiet"]);

export function runTerminalStatusFromSummary(
  summary: RunSummary,
): RunTerminalStatus {
  if (summary.errors === 0) return "succeeded";
  return summary.drafted + summary.quiet === 0 ? "failed" : "partial";
}

export async function startRun(
  input: Omit<CreateRunInput, "status">,
  deps: RunLifecycleDeps,
): Promise<string> {
  return deps.repo.createRun({ ...input, status: "running" });
}

export async function setRunTriggerRunId(
  runId: string,
  triggerRunId: string,
  deps: RunLifecycleDeps,
): Promise<void> {
  await deps.repo.updateRunTriggerRunId(runId, triggerRunId);
}

async function completeRun(
  runId: string,
  status: RunTerminalStatus,
  errorMessage: string | null,
  deps: RunLifecycleDeps,
  audit?: RunAuditInput,
): Promise<void> {
  if (!audit) {
    await deps.repo.updateRunStatus(runId, status, { errorMessage });
    return;
  }

  await deps.transaction(async (tx) => {
    await deps.repo.updateRunStatus(runId, status, { errorMessage }, tx);
    await deps.recordAuditEntry({
      actorEmail: audit.actorEmail,
      action: audit.action ?? "run.completed",
      entityType: "run",
      entityId: runId,
      payload: audit.payload ?? {},
      tx,
    });
  });
}

export async function markRunSucceeded(
  runId: string,
  deps: RunLifecycleDeps,
  audit?: RunAuditInput,
): Promise<void> {
  await completeRun(runId, "succeeded", null, deps, audit);
}

export async function markRunFailed(
  runId: string,
  errorMessage: string,
  deps: RunLifecycleDeps,
  audit?: RunAuditInput,
): Promise<void> {
  await completeRun(runId, "failed", errorMessage, deps, audit);
}

export async function markRunPartial(
  runId: string,
  errorMessage: string,
  deps: RunLifecycleDeps,
  audit?: RunAuditInput,
): Promise<void> {
  await completeRun(runId, "partial", errorMessage, deps, audit);
}

export async function cancelRun(
  runId: string,
  reason: string,
  deps: RunLifecycleDeps,
  audit?: RunAuditInput,
): Promise<void> {
  await markRunFailed(runId, reason, deps, audit);
}

export async function markRunCompletedFromSummary(
  runId: string,
  input: {
    actorEmail: string;
    weekLabel: string;
    summary: RunSummary;
  },
  deps: RunLifecycleDeps,
): Promise<RunTerminalStatus> {
  const status = runTerminalStatusFromSummary(input.summary);
  const errorMessage =
    input.summary.errors > 0
      ? `${input.summary.errors} client report(s) failed`
      : null;
  const audit = {
    actorEmail: input.actorEmail,
    payload: {
      weekLabel: input.weekLabel,
      summary: input.summary,
      status,
    },
  };

  if (status === "succeeded") {
    await markRunSucceeded(runId, deps, audit);
  } else if (status === "failed") {
    await markRunFailed(runId, errorMessage ?? "Run failed", deps, audit);
  } else {
    await markRunPartial(
      runId,
      errorMessage ?? "Run partially failed",
      deps,
      audit,
    );
  }

  return status;
}

export async function triggerOnDemandRun(
  input: OnDemandInput,
  actorEmail: string,
  deps: OnDemandRunDeps,
): Promise<string> {
  const window = input.weekLabel
    ? isoWeekToWindow(input.weekLabel)
    : reportingWindow();

  const runId = await startRun(
    {
      kind: "on_demand",
      weekLabel: window.weekLabel,
      windowStart: window.start,
      windowEnd: window.end,
    },
    deps,
  );

  const handle = await deps.generateClientReport.trigger({
    clientId: input.clientId,
    weekLabel: window.weekLabel,
    runId,
    onDemand: true,
  });

  await setRunTriggerRunId(runId, handle.id, deps);

  await deps.recordAuditEntry({
    actorEmail,
    action: "report.on_demand_triggered",
    entityType: "client",
    entityId: input.clientId,
    payload: { clientId: input.clientId, weekLabel: window.weekLabel, runId },
  });

  return runId;
}

export async function deleteRun(
  runId: string,
  actorEmail: string,
  deps: RunDeletionDeps,
): Promise<void> {
  const run = await deps.repo.findRunById(runId);
  if (!run) throw new Error("Run not found");

  const children = await deps.reportsRepo.listReportsForRun(runId);

  for (const report of children) {
    if (ACTIONABLE_DRAFT_STATUSES.has(report.status) && report.gmailDraftId) {
      try {
        await deps.n8n.discardDraft({
          action: "discard",
          draft_id: report.gmailDraftId,
        });
      } catch {
        // Best-effort: continue even if the draft cannot be reached.
      }
    }
  }

  try {
    await deps.blob.deleteReportPdfs(children.map((report) => report.pdfBlobUrl));
  } catch {
    // Best-effort: still delete the run even if blob cleanup fails.
  }

  await deps.transaction(async (tx) => {
    await deps.repo.deleteRunById(runId, tx);
    await deps.recordAuditEntry({
      actorEmail,
      action: "run.delete",
      entityType: "run",
      entityId: null,
      payload: {
        runId,
        weekLabel: run.weekLabel,
        kind: run.kind,
        reportCount: children.length,
      },
      tx,
    });
  });
}
