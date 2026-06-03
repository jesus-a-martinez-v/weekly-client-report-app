import { sendDigestMessage } from "@/lib/clients/telegram";
import { db } from "@/lib/db/client";
import {
  createRun,
  listClients,
  recordAuditEntry,
  updateRunStatus,
  updateRunTriggerRunId,
} from "@/lib/db/repos";
import type { WeeklyRunDeps, WeeklyReportPayload } from "@/lib/services/runs";
import { generateClientReport } from "@/trigger/generate-client-report";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TransactionCallback<T> = (tx: Transaction) => Promise<T>;

export const weeklyRunDeps: WeeklyRunDeps = {
  repo: {
    createRun,
    updateRunStatus,
    updateRunTriggerRunId,
  },
  transaction: <T>(callback: TransactionCallback<T>): Promise<T> =>
    db.transaction(callback),
  recordAuditEntry,
  clientsRepo: { listClients },
  telegram: { sendDigestMessage },
  generateClientReport: {
    batchTriggerAndWait: (items: Array<{ payload: WeeklyReportPayload }>) =>
      generateClientReport.batchTriggerAndWait(items),
  },
};
