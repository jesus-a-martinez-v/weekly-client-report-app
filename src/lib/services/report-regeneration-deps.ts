import * as Sentry from "@sentry/node";

import { uploadReportPdf } from "@/lib/clients/blob";
import { postN8n } from "@/lib/clients/n8n";
import { generateEmailDraft } from "@/lib/clients/openrouter";
import { renderPdfBuffer } from "@/lib/clients/pdf";
import {
  findClientById,
  findReportById,
  recordAuditEntry,
  updateReportEmail,
  updateReportPdf,
} from "@/lib/db/repos";
import type { ReportRegenerationDeps } from "@/lib/services/reports";

export const reportRegenerationDeps: ReportRegenerationDeps = {
  reportsRepo: {
    findReportById,
    updateReportEmail,
    updateReportPdf,
  },
  clientsRepo: { findClientById },
  recordAuditEntry,
  n8n: {
    createDraft: postN8n,
    discardDraft: postN8n,
  },
  openRouter: { generateEmailDraft },
  pdf: { renderPdfBuffer },
  blob: { uploadReportPdf },
  sentry: {
    captureException: (error, context) =>
      Sentry.captureException(error, context),
  },
};
