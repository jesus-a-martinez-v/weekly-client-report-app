"use server";

import { eq, sql } from "drizzle-orm";
import { schedules as triggerSchedules } from "@trigger.dev/sdk/v3";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { auditLog, schedules } from "@/db/schema";
import {
  SCHEDULE_DEFS,
  SCHEDULE_KINDS,
  type ScheduleKind,
} from "@/lib/schedules";
import { parseScheduleForm } from "@/lib/validation/schedule";

async function actorEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Unauthorized");
  return email;
}

type ScheduleObj = Awaited<ReturnType<typeof triggerSchedules.create>>;

function mirrorValues(s: ScheduleObj, kind: ScheduleKind) {
  const def = SCHEDULE_DEFS[kind];
  return {
    triggerScheduleId: s.id,
    kind,
    externalId: def.deduplicationKey,
    cron: s.generator.expression,
    timezone: s.timezone,
    active: String(s.active),
    nextRun: s.nextRun ?? null,
    lastSyncedAt: sql`now()` as unknown as Date,
    updatedAt: sql`now()` as unknown as Date,
  };
}

export async function upsertSchedule(kind: ScheduleKind, formData: FormData) {
  const email = await actorEmail();
  const input = parseScheduleForm(formData);
  const def = SCHEDULE_DEFS[kind];

  const [existing] = await db
    .select()
    .from(schedules)
    .where(eq(schedules.kind, kind))
    .limit(1);

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
    ? { cron: existing.cron, timezone: existing.timezone, active: existing.active }
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
      await tx
        .update(schedules)
        .set(mirror)
        .where(eq(schedules.id, existing.id));
      scheduleRowId = existing.id;
    } else {
      const [row] = await tx
        .insert(schedules)
        .values({ ...mirror, createdAt: sql`now()` as unknown as Date })
        .returning({ id: schedules.id });
      scheduleRowId = row?.id ?? null;
    }

    await tx.insert(auditLog).values({
      actorEmail: email,
      action: auditAction,
      entityType: "schedule",
      entityId: scheduleRowId,
      payload: { kind, before, after },
    });
  });

  revalidatePath("/admin/schedules");
}

export async function deleteSchedule(kind: ScheduleKind) {
  const email = await actorEmail();

  const [existing] = await db
    .select()
    .from(schedules)
    .where(eq(schedules.kind, kind))
    .limit(1);

  if (!existing) return;

  await triggerSchedules.del(existing.triggerScheduleId);

  await db.transaction(async (tx) => {
    await tx.delete(schedules).where(eq(schedules.id, existing.id));
    await tx.insert(auditLog).values({
      actorEmail: email,
      action: "schedule.deactivated",
      entityType: "schedule",
      entityId: existing.id,
      payload: { kind, triggerScheduleId: existing.triggerScheduleId },
    });
  });

  revalidatePath("/admin/schedules");
}

export async function deleteUnmanagedSchedule(triggerScheduleId: string) {
  await actorEmail();
  await triggerSchedules.del(triggerScheduleId);
  revalidatePath("/admin/schedules");
}

export type ScheduleRow = {
  id: string;
  kind: ScheduleKind;
  triggerScheduleId: string;
  cron: string;
  timezone: string;
  active: boolean;
  nextRun: Date | null;
};

export async function loadScheduleRows(): Promise<
  Partial<Record<ScheduleKind, ScheduleRow>>
> {
  const rows = await db.select().from(schedules);
  const result: Partial<Record<ScheduleKind, ScheduleRow>> = {};
  for (const row of rows) {
    if (SCHEDULE_KINDS.includes(row.kind as ScheduleKind)) {
      result[row.kind as ScheduleKind] = {
        id: row.id,
        kind: row.kind as ScheduleKind,
        triggerScheduleId: row.triggerScheduleId,
        cron: row.cron,
        timezone: row.timezone,
        active: row.active === "true",
        nextRun: row.nextRun,
      };
    }
  }
  return result;
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
  const managedTriggerIds = new Set(
    (
      await db
        .select({ tid: schedules.triggerScheduleId })
        .from(schedules)
    ).map((r) => r.tid),
  );

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
