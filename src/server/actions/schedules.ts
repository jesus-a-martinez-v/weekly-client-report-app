"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import type { ScheduleRow } from "@/lib/db/repos";
import type { ScheduleKind } from "@/lib/shared/schedules";
import { parseScheduleForm } from "@/lib/shared/validation/schedule";
import { scheduleServiceDeps } from "@/lib/services/schedule-service-deps";
import {
  deleteSchedule as deleteScheduleInService,
  deleteUnmanagedSchedule as deleteUnmanagedScheduleInService,
  listSchedules,
  listUnmanagedSchedules,
  upsertSchedule as upsertScheduleInService,
  type UnmanagedSchedule,
} from "@/lib/services/schedules";

async function actorEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Unauthorized");
  return email;
}

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
  await actorEmail();
  return listSchedules(scheduleServiceDeps);
}

export async function loadUnmanagedSchedules(): Promise<UnmanagedSchedule[]> {
  await actorEmail();
  return listUnmanagedSchedules(scheduleServiceDeps);
}
