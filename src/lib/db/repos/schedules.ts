import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  schedules,
  type NewSchedule,
  type Schedule,
} from "@/lib/db/schema";
import {
  SCHEDULE_KINDS,
  type ScheduleKind,
} from "@/lib/shared/schedules";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ScheduleExecutor = typeof db | Transaction;

export type ScheduleRow = {
  id: string;
  kind: ScheduleKind;
  triggerScheduleId: string;
  cron: string;
  timezone: string;
  active: boolean;
  nextRun: Date | null;
};

export type ScheduleMirrorInput = {
  triggerScheduleId: string;
  kind: ScheduleKind;
  externalId: string;
  cron: string;
  timezone: string;
  active: boolean;
  nextRun: Date | null;
};

function toScheduleRow(row: Schedule): ScheduleRow | null {
  if (!SCHEDULE_KINDS.includes(row.kind as ScheduleKind)) return null;

  return {
    id: row.id,
    kind: row.kind as ScheduleKind,
    triggerScheduleId: row.triggerScheduleId,
    cron: row.cron,
    timezone: row.timezone,
    active: row.active === "true",
    nextRun: row.nextRun,
  };
}

function toScheduleValues(input: ScheduleMirrorInput): NewSchedule {
  return {
    triggerScheduleId: input.triggerScheduleId,
    kind: input.kind,
    externalId: input.externalId,
    cron: input.cron,
    timezone: input.timezone,
    active: String(input.active),
    nextRun: input.nextRun,
    lastSyncedAt: sql`now()` as unknown as Date,
    updatedAt: sql`now()` as unknown as Date,
  };
}

export async function findScheduleByKind(
  kind: ScheduleKind,
  executor: ScheduleExecutor = db,
): Promise<ScheduleRow | null> {
  const [row] = await executor
    .select()
    .from(schedules)
    .where(eq(schedules.kind, kind))
    .limit(1);

  return row ? toScheduleRow(row) : null;
}

export async function insertScheduleMirror(
  input: ScheduleMirrorInput,
  executor: ScheduleExecutor = db,
): Promise<string> {
  const [row] = await executor
    .insert(schedules)
    .values({
      ...toScheduleValues(input),
      createdAt: sql`now()` as unknown as Date,
    })
    .returning({ id: schedules.id });

  if (!row) throw new Error("Failed to insert schedule mirror");
  return row.id;
}

export async function updateScheduleMirror(
  id: string,
  input: ScheduleMirrorInput,
  executor: ScheduleExecutor = db,
): Promise<void> {
  await executor
    .update(schedules)
    .set(toScheduleValues(input))
    .where(eq(schedules.id, id));
}

export async function deleteScheduleById(
  id: string,
  executor: ScheduleExecutor = db,
): Promise<void> {
  await executor.delete(schedules).where(eq(schedules.id, id));
}

export async function loadScheduleRows(
  executor: ScheduleExecutor = db,
): Promise<Partial<Record<ScheduleKind, ScheduleRow>>> {
  const rows = await executor.select().from(schedules);
  const result: Partial<Record<ScheduleKind, ScheduleRow>> = {};

  for (const row of rows) {
    const scheduleRow = toScheduleRow(row);
    if (scheduleRow) result[scheduleRow.kind] = scheduleRow;
  }

  return result;
}

export async function loadManagedTriggerScheduleIds(
  executor: ScheduleExecutor = db,
): Promise<string[]> {
  const rows = await executor
    .select({ triggerScheduleId: schedules.triggerScheduleId })
    .from(schedules);

  return rows.map((row) => row.triggerScheduleId);
}
