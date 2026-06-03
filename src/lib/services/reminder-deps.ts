import { sendDraftedReminderMessage } from "@/lib/clients/telegram";
import {
  listStaleDraftReports,
  recordAuditEntries,
} from "@/lib/db/repos";
import type { DraftedReminderDeps } from "@/lib/services/reminders";

export const draftedReminderDeps: DraftedReminderDeps = {
  reportsRepo: { listStaleDraftReports },
  auditRepo: { recordAuditEntries },
  telegram: { sendDraftedReminderMessage },
};
