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
  type ScheduleMirrorInput,
  type ScheduleRow,
} from "@/lib/db/repos";
import {
  SCHEDULE_DEFS,
  type ScheduleKind,
} from "@/lib/shared/schedules";
import { parseScheduleForm } from "@/lib/shared/validation/schedule";

async function actorEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Unauthorized");
  return email;
}

type ScheduleObj = Awaited<ReturnType<typeof triggerSchedules.create>>;

function mirrorValues(
  s: ScheduleObj,
  kind: ScheduleKind,
): ScheduleMirrorInput {
  const def = SCHEDULE_DEFS[kind];
  return {
    triggerScheduleId: s.id,
    kind,
    externalId: def.deduplicationKey,
    cron: s.generator.expression,
    timezone: s.timezone,
    active: s.active,
    nextRun: s.nextRun ?? null,
  };
}

export async function upsertSchedule(kind: ScheduleKind, formData: FormData) {
  const email = await actorEmail();
  const input = parseScheduleForm(formData);
  const def = SCHEDULE_DEFS[kind];

  const existing = await findScheduleByKind(kind);

  let schedObj: ScheduleObj;

  if (!existing) {
    schedObj = await triggerSchedules.create({
      task: def.taskId,
      cron: input.cron,
      timezone: input.timezone,
      externalId: def.deduplicationKey,
      deduplicationKey: def.deduplicationKey,
    });
  } else {
    schedObj = await triggerSchedules.update(existing.triggerScheduleId, {
      task: def.taskId,
      cron: input.cron,
      timezone: input.timezone,
      externalId: def.deduplicationKey,
    });
  }

  if (!input.active && schedObj.active) {
    schedObj = await triggerSchedules.deactivate(schedObj.id);
  } else if (input.active && !schedObj.active) {
    schedObj = await triggerSchedules.activate(schedObj.id);
  }

  const auditAction = existing ? "schedule.updated" : "schedule.created";
  const before = existing
    ? {
        cron: existing.cron,
        timezone: existing.timezone,
        active: String(existing.active),
      }
    : null;
  const after = {
    cron: input.cron,
    timezone: input.timezone,
    active: String(input.active),
  };
  const mirror = mirrorValues(schedObj, kind);

  await db.transaction(async (tx) => {
    let scheduleRowId: string | null = null;

    if (existing) {
      await updateScheduleMirror(existing.id, mirror, tx);
      scheduleRowId = existing.id;
    } else {
      scheduleRowId = await insertScheduleMirror(mirror, tx);
    }

    await recordAuditEntry({
      actorEmail: email,
      action: auditAction,
      entityType: "schedule",
      entityId: scheduleRowId,
      payload: { kind, before, after },
      tx,
    });
  });

  revalidatePath("/admin/schedules");
}

export async function deleteSchedule(kind: ScheduleKind) {
  const email = await actorEmail();

  const existing = await findScheduleByKind(kind);

  if (!existing) return;

  await triggerSchedules.del(existing.triggerScheduleId);

  await db.transaction(async (tx) => {
    await deleteScheduleById(existing.id, tx);
    await recordAuditEntry({
      actorEmail: email,
      action: "schedule.deactivated",
      entityType: "schedule",
      entityId: existing.id,
      payload: { kind, triggerScheduleId: existing.triggerScheduleId },
      tx,
    });
  });

  revalidatePath("/admin/schedules");
}

export async function deleteUnmanagedSchedule(triggerScheduleId: string) {
  await actorEmail();
  await triggerSchedules.del(triggerScheduleId);
  revalidatePath("/admin/schedules");
}

export async function loadScheduleRows(): Promise<
  Partial<Record<ScheduleKind, ScheduleRow>>
> {
  return loadScheduleRowsFromRepo();
}

export type UnmanagedSchedule = {
  triggerScheduleId: string;
  taskId: string;
  cron: string;
  timezone: string;
  active: boolean;
};

export async function loadUnmanagedSchedules(): Promise<UnmanagedSchedule[]> {
  const taskIds = new Set(Object.values(SCHEDULE_DEFS).map((d) => d.taskId));
  const managedDeduplicationKeys = new Set(
    Object.values(SCHEDULE_DEFS).map((d) => d.deduplicationKey),
  );
  const managedTriggerIds = new Set(await loadManagedTriggerScheduleIds());

  const page = await triggerSchedules.list({ perPage: 100 });

  return page.data
    .filter(
      (s) =>
        s.type === "IMPERATIVE" &&
        taskIds.has(s.task) &&
        !managedTriggerIds.has(s.id) &&
        !(
          s.deduplicationKey &&
          managedDeduplicationKeys.has(s.deduplicationKey)
        ),
    )
    .map((s) => ({
      triggerScheduleId: s.id,
      taskId: s.task,
      cron: s.generator.expression,
      timezone: s.timezone,
      active: s.active,
    }));
}
