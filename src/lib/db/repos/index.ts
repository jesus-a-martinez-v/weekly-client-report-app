// Barrel for repository modules.
import type { db } from "@/lib/db/client";

/** Handle every repo receives by injection. */
export type Repo = typeof db;

export { recordAuditEntry, recordAuditEntries } from "./audit";
export type { AuditEntryInput } from "./audit";
export {
  deleteScheduleById,
  findScheduleByKind,
  insertScheduleMirror,
  loadManagedTriggerScheduleIds,
  loadScheduleRows,
  updateScheduleMirror,
} from "./schedules";
export type { ScheduleMirrorInput, ScheduleRow } from "./schedules";
export {
  addProject,
  archiveClient,
  createClient,
  deleteClientById,
  findClientById,
  findClientBySlug,
  listClients,
  removeProject,
  setClientStatus,
  setProjects,
  updateClient,
} from "./clients";
export type {
  ClientInput,
  ClientListOptions,
  ClientProjectInput,
  ClientWithProjects,
} from "./clients";
export {
  createRun,
  deleteRunById,
  findRunById,
  listRuns,
  updateRunStatus,
  updateRunTriggerRunId,
} from "./runs";
export type { CreateRunInput, UpdateRunStatusOptions } from "./runs";
export {
  createReport,
  deleteReport,
  findReportByClientWeek,
  findReportById,
  hasInFlightReportForClient,
  listReports,
  listReportsForRun,
  listReportClientsByRun,
  listReportStatusTalliesByRun,
  listStaleDraftReports,
  resetReportForRun,
  updateReportActivity,
  updateReportEmail,
  updateReportFailure,
  updateReportNarrative,
  updateReportPdf,
  updateReportStatus,
} from "./reports";
export type {
  CreateReportInput,
  ReportClientForRun,
  ReportListOptions,
  ReportStatusTally,
  StaleDraftReport,
  UpdateReportActivityInput,
  UpdateReportEmailInput,
  UpdateReportPdfInput,
  UpdateReportStatusOptions,
} from "./reports";
