// Barrel for repository modules. Repos (auditRepo, schedulesRepo, runsRepo,
// clientsRepo, reportsRepo) will be added and re-exported here.
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
  createRun,
  deleteRunById,
  findRunById,
  listRuns,
  updateRunStatus,
  updateRunTriggerRunId,
} from "./runs";
export type { CreateRunInput, UpdateRunStatusOptions } from "./runs";
