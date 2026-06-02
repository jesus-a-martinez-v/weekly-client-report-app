"use server";

import { schedules as triggerSchedules } from "@trigger.dev/sdk/v3";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import {
  deleteScheduleById,
  findScheduleByKind,
  loadManagedTriggerScheduleIds,
  loadScheduleRows as loadScheduleRowsFromRepo,
  insertScheduleMirror,
  recordAuditEntry,
  updateScheduleMirror,
  type ScheduleRow,
} from "@/lib/db/repos";
import type { ScheduleKind } from "@/lib/shared/schedules";
import {
  deleteSchedule as deleteScheduleInService,
  deleteUnmanagedSchedule as deleteUnmanagedScheduleInService,
  listSchedules,
  listUnmanagedSchedules,
  upsertSchedule as upsertScheduleInService,
  type ScheduleServiceDeps,
  type UnmanagedSchedule,
} from "@/lib/services/schedules";
import { parseScheduleForm } from "@/lib/shared/validation/schedule";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type TransactionCallback<T> = (tx: Transaction) => Promise<T>;

async function actorEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Unauthorized");
  return email;
}

const scheduleServiceDeps = {
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

export async function upsertSchedule(
  kind: ScheduleKind,
  formData: FormData,
): Promise<void> {
  const email = await actorEmail();
  const input = parseScheduleForm(formData);
  await upsertScheduleInService(kind, input, email, scheduleServiceDeps);

  revalidatePath("/admin/schedules");
}

export async function deleteSchedule(kind: ScheduleKind): Promise<void> {
  const email = await actorEmail();

  await deleteScheduleInService(kind, email, scheduleServiceDeps);

  revalidatePath("/admin/schedules");
}

export async function deleteUnmanagedSchedule(
  triggerScheduleId: string,
): Promise<void> {
  await actorEmail();
  await deleteUnmanagedScheduleInService(
    triggerScheduleId,
    scheduleServiceDeps,
  );
  revalidatePath("/admin/schedules");
}

export async function loadScheduleRows(): Promise<
  Partial<Record<ScheduleKind, ScheduleRow>>
> {
  return listSchedules(scheduleServiceDeps);
}

export async function loadUnmanagedSchedules(): Promise<UnmanagedSchedule[]> {
  return listUnmanagedSchedules(scheduleServiceDeps);
}
