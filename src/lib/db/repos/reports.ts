import {
  and,
  asc,
  desc,
  eq,
  isNull,
  lt,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  reports,
  type NewReport,
  type Report,
} from "@/lib/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ReportExecutor = typeof db | Transaction;

export type ReportListOptions = {
  clientId?: string;
  status?: string;
  weekLabel?: string;
};

export type CreateReportInput = {
  runId: string;
  clientId: string | null;
  clientName: string;
  weekLabel: string;
  windowStart: Date;
  windowEnd: Date;
  status?: string;
  triggerRunId?: string | null;
};

export type UpdateReportStatusOptions = {
  gmailDraftId?: string | null;
  errorMessage?: string | null;
  sentAtNow?: boolean;
  discardedAtNow?: boolean;
  clearDraft?: boolean;
};

export type UpdateReportActivityInput = {
  activityJson: unknown;
  totalsPrs: number;
  totalsIssues: number;
  totalsCommits: number;
};

export type UpdateReportEmailInput = {
  subject: string;
  body: string;
  gmailDraftId?: string | null;
};

export type UpdateReportPdfInput = {
  pdfBlobUrl: string;
  pdfFilename: string;
};

export type ResetReportForRunInput = {
  runId: string;
  clientName: string;
  windowStart: Date;
  windowEnd: Date;
  triggerRunId: string;
};

export type ReportStatusTally = {
  runId: string;
  status: string;
  count: number;
};

export type ReportClientForRun = {
  runId: string;
  clientName: string;
};

export type StaleDraftReport = {
  id: string;
  clientName: string;
  weekLabel: string;
  createdAt: Date;
};

function now(): Date {
  return sql`now()` as unknown as Date;
}

async function updateReportValues(
  id: string,
  values: Partial<NewReport>,
  executor: ReportExecutor,
): Promise<void> {
  await executor
    .update(reports)
    .set({ ...values, updatedAt: now() })
    .where(eq(reports.id, id));
}

export async function findReportById(
  id: string,
  executor: ReportExecutor = db,
): Promise<Report | null> {
  const [row] = await executor
    .select()
    .from(reports)
    .where(eq(reports.id, id))
    .limit(1);

  return row ?? null;
}

export async function findReportByClientWeek(
  clientId: string,
  weekLabel: string,
  executor: ReportExecutor = db,
): Promise<Report | null> {
  const [row] = await executor
    .select()
    .from(reports)
    .where(and(eq(reports.clientId, clientId), eq(reports.weekLabel, weekLabel)))
    .limit(1);

  return row ?? null;
}

export async function listReports(
  options: ReportListOptions = {},
  executor: ReportExecutor = db,
): Promise<Report[]> {
  const filters: SQL[] = [];
  if (options.clientId) filters.push(eq(reports.clientId, options.clientId));
  if (options.status) filters.push(eq(reports.status, options.status));
  if (options.weekLabel) filters.push(eq(reports.weekLabel, options.weekLabel));

  let query = executor.select().from(reports).$dynamic();
  if (filters.length > 0) query = query.where(and(...filters));

  return query.orderBy(desc(reports.createdAt));
}

export async function listReportsForRun(
  runId: string,
  executor: ReportExecutor = db,
): Promise<Report[]> {
  return executor
    .select()
    .from(reports)
    .where(eq(reports.runId, runId))
    .orderBy(asc(reports.clientName));
}

export async function listReportStatusTalliesByRun(
  executor: ReportExecutor = db,
): Promise<ReportStatusTally[]> {
  return executor
    .select({
      runId: reports.runId,
      status: reports.status,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(reports)
    .groupBy(reports.runId, reports.status);
}

export async function listReportClientsByRun(
  executor: ReportExecutor = db,
): Promise<ReportClientForRun[]> {
  return executor
    .select({
      runId: reports.runId,
      clientName: reports.clientName,
    })
    .from(reports)
    .orderBy(asc(reports.clientName));
}

export async function listStaleDraftReports(
  cutoff: Date,
  executor: ReportExecutor = db,
): Promise<StaleDraftReport[]> {
  return executor
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
}

export async function createReport(
  input: CreateReportInput,
  executor: ReportExecutor = db,
): Promise<string> {
  const [row] = await executor
    .insert(reports)
    .values({
      runId: input.runId,
      clientId: input.clientId,
      clientName: input.clientName,
      weekLabel: input.weekLabel,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      status: input.status ?? "pending",
      triggerRunId: input.triggerRunId ?? null,
    })
    .returning({ id: reports.id });

  if (!row) throw new Error("Failed to create report");
  return row.id;
}

export async function resetReportForRun(
  id: string,
  input: ResetReportForRunInput,
  executor: ReportExecutor = db,
): Promise<void> {
  await updateReportValues(
    id,
    {
      runId: input.runId,
      status: "fetching",
      clientName: input.clientName,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      triggerRunId: input.triggerRunId,
      errorMessage: null,
    },
    executor,
  );
}

export async function updateReportStatus(
  id: string,
  status: string,
  options: UpdateReportStatusOptions = {},
  executor: ReportExecutor = db,
): Promise<void> {
  const values: Partial<NewReport> = { status };
  if ("gmailDraftId" in options) values.gmailDraftId = options.gmailDraftId;
  if ("errorMessage" in options) values.errorMessage = options.errorMessage;
  if (options.clearDraft) values.gmailDraftId = null;
  if (options.sentAtNow) values.sentAt = now();
  if (options.discardedAtNow) values.discardedAt = now();

  await updateReportValues(id, values, executor);
}

export async function updateReportActivity(
  id: string,
  input: UpdateReportActivityInput,
  executor: ReportExecutor = db,
): Promise<void> {
  await updateReportValues(
    id,
    {
      status: "narrating",
      activityJson: input.activityJson,
      totalsPrs: input.totalsPrs,
      totalsIssues: input.totalsIssues,
      totalsCommits: input.totalsCommits,
    },
    executor,
  );
}

export async function updateReportNarrative(
  id: string,
  narrativeMd: string,
  executor: ReportExecutor = db,
): Promise<void> {
  await updateReportValues(id, { narrativeMd }, executor);
}

export async function updateReportEmail(
  id: string,
  input: UpdateReportEmailInput,
  executor: ReportExecutor = db,
): Promise<void> {
  const values: Partial<NewReport> = {
    emailSubject: input.subject,
    emailBody: input.body,
  };
  if ("gmailDraftId" in input) values.gmailDraftId = input.gmailDraftId;

  await updateReportValues(id, values, executor);
}

export async function updateReportPdf(
  id: string,
  input: UpdateReportPdfInput,
  executor: ReportExecutor = db,
): Promise<void> {
  await updateReportValues(
    id,
    {
      pdfBlobUrl: input.pdfBlobUrl,
      pdfFilename: input.pdfFilename,
    },
    executor,
  );
}

export async function updateReportFailure(
  id: string,
  message: string,
  executor: ReportExecutor = db,
): Promise<void> {
  await updateReportValues(
    id,
    {
      status: "failed",
      errorMessage: message.slice(0, 2000),
    },
    executor,
  );
}

export async function deleteReport(
  id: string,
  executor: ReportExecutor = db,
): Promise<void> {
  await executor.delete(reports).where(eq(reports.id, id));
}
