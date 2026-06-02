// Barrel for repository modules. Repos (reportsRepo) will be added and
// re-exported here.
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
