import { schedules as triggerSchedules } from "@trigger.dev/sdk/v3";

import { db } from "@/lib/db/client";
import {
  deleteScheduleById,
  findScheduleByKind,
  insertScheduleMirror,
  loadManagedTriggerScheduleIds,
  loadScheduleRows as loadScheduleRowsFromRepo,
  recordAuditEntry,
  updateScheduleMirror,
} from "@/lib/db/repos";
import type { ScheduleServiceDeps } from "@/lib/services/schedules";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TransactionCallback<T> = (tx: Transaction) => Promise<T>;

export const scheduleServiceDeps = {
  schedulesClient: triggerSchedules,
  repo: {
    deleteScheduleById,
    findScheduleByKind,
    insertScheduleMirror,
    loadManagedTriggerScheduleIds,
    loadScheduleRows: loadScheduleRowsFromRepo,
    updateScheduleMirror,
  },
  transaction: <T>(callback: TransactionCallback<T>): Promise<T> =>
    db.transaction(callback),
  recordAuditEntry,
} satisfies ScheduleServiceDeps;
