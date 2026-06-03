import { deleteReportPdfs } from "@/lib/clients/blob";
import { postN8n } from "@/lib/clients/n8n";
import { reviseNarrative as reviseNarrativeWithAi } from "@/lib/clients/openrouter";
import { db } from "@/lib/db/client";
import * as Sentry from "@sentry/nextjs";
import {
  deleteReport as deleteReportRecord,
  findClientById,
  findReportById,
  recordAuditEntry,
  updateReportEmail,
  updateReportNarrative,
  updateReportStatus,
} from "@/lib/db/repos";
import type { ReportServiceDeps } from "@/lib/services/reports";
import { regenerateReport as regenerateReportTask } from "@/trigger/regenerate-report";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TransactionCallback<T> = (tx: Transaction) => Promise<T>;

export const reportServiceDeps: ReportServiceDeps = {
  reportsRepo: {
    deleteReport: deleteReportRecord,
    findReportById,
    updateReportEmail,
    updateReportNarrative,
    updateReportStatus,
  },
  clientsRepo: { findClientById },
  transaction: <T>(callback: TransactionCallback<T>): Promise<T> =>
    db.transaction(callback),
  recordAuditEntry,
  n8n: {
    createDraft: postN8n,
    sendDraft: postN8n,
    discardDraft: postN8n,
  },
  openRouter: { reviseNarrative: reviseNarrativeWithAi },
  blob: { deleteReportPdfs },
  regenerateReport: {
    trigger: (input: { reportId: string }) =>
      regenerateReportTask.trigger(input),
  },
  sentry: {
    captureException: (error, context) =>
      Sentry.captureException(error, context),
  },
};
