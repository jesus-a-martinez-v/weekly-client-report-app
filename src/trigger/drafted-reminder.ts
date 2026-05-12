import { schedules, logger } from "@trigger.dev/sdk/v3";
import { and, asc, isNull, lt, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, reports } from "@/db/schema";
import { sendDraftedReminderMessage } from "@/lib/telegram";

const SYSTEM_ACTOR = "system";

export const draftedReminder = schedules.task({
  id: "drafted-reminder",
  maxDuration: 120,
  run: async () => {
    const thresholdHours = Number(
      process.env.REMINDER_THRESHOLD_HOURS ?? "18",
    );
    const cutoff = new Date(Date.now() - thresholdHours * 3_600_000);

    const stale = await db
      .select({
        id: reports.id,
        clientName: reports.clientName,
        weekLabel: reports.weekLabel,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .where(
        and(
          eq(reports.status, "drafted"),
          isNull(reports.sentAt),
          isNull(reports.discardedAt),
          lt(reports.createdAt, cutoff),
        ),
      )
      .orderBy(asc(reports.createdAt));

    if (stale.length === 0) {
      logger.info("No stale drafts to remind about");
      return { count: 0 };
    }

    const items = stale.map((r) => ({
      reportId: r.id,
      clientName: r.clientName,
      weekLabel: r.weekLabel,
      hoursOld: Math.round(
        (Date.now() - r.createdAt.getTime()) / 3_600_000,
      ),
    }));

    await sendDraftedReminderMessage(items);

    await db.insert(auditLog).values(
      items.map((item) => ({
        actorEmail: SYSTEM_ACTOR,
        action: "report.reminded",
        entityType: "report" as const,
        entityId: item.reportId,
        payload: {
          hoursOld: item.hoursOld,
          weekLabel: item.weekLabel,
          threshold: thresholdHours,
        },
      })),
    );

    logger.info("Drafted reminder sent", { count: items.length });

    return { count: items.length };
  },
});
