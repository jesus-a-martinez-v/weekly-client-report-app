import type { ReminderItem } from "@/lib/clients/telegram";
import type { AuditEntryInput, StaleDraftReport } from "@/lib/db/repos";

const SYSTEM_ACTOR = "system";
const HOUR_MS = 3_600_000;

export type DraftedReminderDeps = {
  reportsRepo: {
    listStaleDraftReports(cutoff: Date): Promise<StaleDraftReport[]>;
  };
  auditRepo: {
    recordAuditEntries(entries: AuditEntryInput[]): Promise<void>;
  };
  telegram: {
    sendDraftedReminderMessage(items: ReminderItem[]): Promise<void>;
  };
};

export type DraftedReminderResult = {
  count: number;
};

function reminderItems(
  stale: StaleDraftReport[],
  now: Date,
): ReminderItem[] {
  return stale.map((report) => ({
    reportId: report.id,
    clientName: report.clientName,
    weekLabel: report.weekLabel,
    hoursOld: Math.round((now.getTime() - report.createdAt.getTime()) / HOUR_MS),
  }));
}

export async function sendDraftedReportReminders(
  input: { thresholdHours: number; now?: Date },
  deps: DraftedReminderDeps,
): Promise<DraftedReminderResult> {
  const now = input.now ?? new Date();
  const cutoff = new Date(now.getTime() - input.thresholdHours * HOUR_MS);
  const stale = await deps.reportsRepo.listStaleDraftReports(cutoff);
  const items = reminderItems(stale, now);

  if (items.length === 0) return { count: 0 };

  await deps.telegram.sendDraftedReminderMessage(items);
  await deps.auditRepo.recordAuditEntries(
    items.map((item) => ({
      actorEmail: SYSTEM_ACTOR,
      action: "report.reminded",
      entityType: "report",
      entityId: item.reportId,
      payload: {
        hoursOld: item.hoursOld,
        weekLabel: item.weekLabel,
        threshold: input.thresholdHours,
      },
    })),
  );

  return { count: items.length };
}
