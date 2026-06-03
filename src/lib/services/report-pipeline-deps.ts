import { uploadReportPdf } from "@/lib/clients/blob";
import { postN8n } from "@/lib/clients/n8n";
import { fetchClientActivity } from "@/lib/clients/octokit";
import {
  generateEmailDraft,
  generateNarrative,
  quietWeekNarrative,
} from "@/lib/clients/openrouter";
import { renderPdfBuffer } from "@/lib/clients/pdf";
import { db } from "@/lib/db/client";
import {
  createReport,
  createRun,
  findClientById,
  findReportByClientWeek,
  recordAuditEntry,
  resetReportForRun,
  updateReportActivity,
  updateReportEmail,
  updateReportFailure,
  updateReportNarrative,
  updateReportPdf,
  updateReportStatus,
  updateRunStatus,
  updateRunTriggerRunId,
} from "@/lib/db/repos";
import type { RunLifecycleDeps } from "@/lib/services/runs";
import type { ReportPipelineDeps } from "@/lib/services/report-pipeline";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TransactionCallback<T> = (tx: Transaction) => Promise<T>;

const runLifecycle = {
  repo: {
    createRun,
    updateRunStatus,
    updateRunTriggerRunId,
  },
  transaction: <T>(callback: TransactionCallback<T>): Promise<T> =>
    db.transaction(callback),
  recordAuditEntry,
} satisfies RunLifecycleDeps;

export const reportPipelineDeps: ReportPipelineDeps = {
  clientsRepo: { findClientById },
  reportsRepo: {
    createReport,
    findReportByClientWeek,
    resetReportForRun,
    updateReportActivity,
    updateReportEmail,
    updateReportFailure,
    updateReportNarrative,
    updateReportPdf,
    updateReportStatus,
  },
  runLifecycle,
  transaction: <T>(callback: TransactionCallback<T>): Promise<T> =>
    db.transaction(callback),
  recordAuditEntry,
  activity: { fetchClientActivity },
  openRouter: {
    generateEmailDraft,
    generateNarrative,
    quietWeekNarrative,
  },
  pdf: { renderPdfBuffer },
  blob: { uploadReportPdf },
  n8n: {
    createDraft: (input) => postN8n(input),
  },
};
