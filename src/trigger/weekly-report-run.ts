import { logger, schedules } from "@trigger.dev/sdk/v3";
import { db } from "@/lib/db/client";
import {
  createRun,
  listClients,
  recordAuditEntry,
  updateRunStatus,
  updateRunTriggerRunId,
} from "@/lib/db/repos";
import {
  markRunCompletedFromSummary,
  markRunSucceeded,
  startRun,
  type RunLifecycleDeps,
} from "@/lib/services/runs";
import { reportingWindow } from "@/lib/shared/window";
import { sendDigestMessage } from "@/lib/clients/telegram";
import { generateClientReport } from "./generate-client-report";

const SYSTEM_ACTOR = "system";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TransactionCallback<T> = (tx: Transaction) => Promise<T>;

const runServiceDeps = {
  repo: {
    createRun,
    updateRunStatus,
    updateRunTriggerRunId,
  },
  transaction: <T>(callback: TransactionCallback<T>): Promise<T> =>
    db.transaction(callback),
  recordAuditEntry,
} satisfies RunLifecycleDeps;

export const weeklyReportRun = schedules.task({
  id: "weekly-report-run",
  maxDuration: 900,
  run: async (payload, { ctx }) => {
    // Use the schedule fire time for reproducibility; fall back to "now".
    const anchor = payload.timestamp ? new Date(payload.timestamp) : new Date();
    const window = reportingWindow(anchor);
    logger.info("Weekly run starting", { weekLabel: window.weekLabel });

    const runId = await startRun({
      kind: "weekly",
      weekLabel: window.weekLabel,
      windowStart: window.start,
      windowEnd: window.end,
      triggerRunId: ctx.run.id,
    }, runServiceDeps);

    const active = await listClients({ status: "active" });

    if (active.length === 0) {
      logger.warn("No active clients — nothing to fan out");
      await markRunSucceeded(runId, runServiceDeps);
      await sendDigestMessage({
        weekLabel: window.weekLabel,
        summary: { drafted: 0, quiet: 0, errors: 0 },
      });
      return { runId, summary: { drafted: 0, quiet: 0, errors: 0 } };
    }

    const batch = await generateClientReport.batchTriggerAndWait(
      active.map(({ client }) => ({
        payload: { clientId: client.id, weekLabel: window.weekLabel, runId },
      })),
    );

    let drafted = 0;
    let quiet = 0;
    let errors = 0;
    for (const r of batch.runs) {
      if (r.ok) {
        if (r.output.status === "quiet") quiet += 1;
        else if (r.output.status === "drafted") drafted += 1;
        else errors += 1;
      } else {
        errors += 1;
      }
    }

    const finalStatus = await markRunCompletedFromSummary(
      runId,
      {
        actorEmail: SYSTEM_ACTOR,
        weekLabel: window.weekLabel,
        summary: { drafted, quiet, errors },
      },
      runServiceDeps,
    );

    await sendDigestMessage({
      weekLabel: window.weekLabel,
      summary: { drafted, quiet, errors },
    });

    logger.info("Weekly run finished", {
      runId,
      weekLabel: window.weekLabel,
      drafted,
      quiet,
      errors,
      finalStatus,
    });

    return { runId, summary: { drafted, quiet, errors } };
  },
});
