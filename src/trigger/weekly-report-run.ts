import { logger, schedules } from "@trigger.dev/sdk/v3";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, clients, runs } from "@/db/schema";
import { reportingWindow } from "@/lib/window";
import { sendDigestMessage } from "@/lib/telegram";
import { generateClientReport } from "./generate-client-report";

const SYSTEM_ACTOR = "system@trigger.dev";

export const weeklyReportRun = schedules.task({
  id: "weekly-report-run",
  maxDuration: 900,
  run: async (payload, { ctx }) => {
    // Use the schedule fire time for reproducibility; fall back to "now".
    const anchor = payload.timestamp ? new Date(payload.timestamp) : new Date();
    const window = reportingWindow(anchor);
    logger.info("Weekly run starting", { weekLabel: window.weekLabel });

    const [runRow] = await db
      .insert(runs)
      .values({
        kind: "weekly",
        weekLabel: window.weekLabel,
        windowStart: window.start,
        windowEnd: window.end,
        status: "running",
        triggerRunId: ctx.run.id,
        startedAt: sql`now()`,
      })
      .returning({ id: runs.id });
    const runId = runRow.id;

    const active = await db
      .select({ id: clients.id, slug: clients.slug })
      .from(clients)
      .where(eq(clients.status, "active"));

    if (active.length === 0) {
      logger.warn("No active clients — nothing to fan out");
      await db
        .update(runs)
        .set({ status: "succeeded", finishedAt: sql`now()` })
        .where(eq(runs.id, runId));
      await sendDigestMessage({
        weekLabel: window.weekLabel,
        summary: { drafted: 0, quiet: 0, errors: 0 },
      });
      return { runId, summary: { drafted: 0, quiet: 0, errors: 0 } };
    }

    const batch = await generateClientReport.batchTriggerAndWait(
      active.map((c) => ({
        payload: { clientId: c.id, weekLabel: window.weekLabel, runId },
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

    const finalStatus =
      errors === 0 ? "succeeded" : drafted + quiet === 0 ? "failed" : "partial";

    await db.transaction(async (tx) => {
      await tx
        .update(runs)
        .set({
          status: finalStatus,
          finishedAt: sql`now()`,
          errorMessage: errors > 0 ? `${errors} client report(s) failed` : null,
        })
        .where(eq(runs.id, runId));
      await tx.insert(auditLog).values({
        actorEmail: SYSTEM_ACTOR,
        action: "run.completed",
        entityType: "run",
        entityId: runId,
        payload: {
          weekLabel: window.weekLabel,
          summary: { drafted, quiet, errors },
          status: finalStatus,
        },
      });
    });

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
