import * as Sentry from "@sentry/nextjs";

import { deleteReportPdfs } from "@/lib/clients/blob";
import { postN8n } from "@/lib/clients/n8n";
import { db } from "@/lib/db/client";
import {
  createRun,
  deleteRunById,
  findRunById,
  listReportsForRun,
  recordAuditEntry,
  updateRunStatus,
  updateRunTriggerRunId,
} from "@/lib/db/repos";
import type { OnDemandRunDeps, RunDeletionDeps } from "@/lib/services/runs";
import { generateClientReport } from "@/trigger/generate-client-report";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TransactionCallback<T> = (tx: Transaction) => Promise<T>;

type OnDemandPayload = {
  clientId: string;
  weekLabel: string;
  runId: string;
  onDemand: true;
};

export const runServiceDeps: RunDeletionDeps & OnDemandRunDeps = {
  repo: {
    createRun,
    deleteRunById,
    findRunById,
    updateRunStatus,
    updateRunTriggerRunId,
  },
  reportsRepo: { listReportsForRun },
  transaction: <T>(callback: TransactionCallback<T>): Promise<T> =>
    db.transaction(callback),
  recordAuditEntry,
  n8n: { discardDraft: postN8n },
  blob: { deleteReportPdfs },
  sentry: {
    captureException: (error, context) =>
      Sentry.captureException(error, context),
  },
  generateClientReport: {
    trigger: (input: OnDemandPayload) => generateClientReport.trigger(input),
  },
};
