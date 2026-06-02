import type { db } from "@/lib/db/client";
import type {
  AuditEntryInput,
  ScheduleMirrorInput,
  ScheduleRow,
} from "@/lib/db/repos";
import {
  SCHEDULE_DEFS,
  type ScheduleKind,
} from "@/lib/shared/schedules";
import type { ScheduleFormInput } from "@/lib/shared/validation/schedule";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ScheduleExecutor = typeof db | Transaction;

export type TriggerSchedule = {
  id: string;
  task?: string;
  type?: string;
  generator: { expression: string };
  timezone: string;
  active: boolean;
  nextRun?: Date | null;
  deduplicationKey?: string | null;
};

export type TriggerSchedulesClient = {
  create(input: {
    task: string;
    cron: string;
    timezone: string;
    externalId: string;
    deduplicationKey: string;
  }): Promise<TriggerSchedule>;
  update(
    id: string,
    input: {
      task: string;
      cron: string;
      timezone: string;
      externalId: string;
    },
  ): Promise<TriggerSchedule>;
  activate(id: string): Promise<TriggerSchedule>;
  deactivate(id: string): Promise<TriggerSchedule>;
  del(id: string): Promise<unknown>;
  list(input: { perPage: number }): Promise<{ data: TriggerSchedule[] }>;
};

export type ScheduleRepository = {
  findScheduleByKind(
    kind: ScheduleKind,
    executor?: ScheduleExecutor,
  ): Promise<ScheduleRow | null>;
  insertScheduleMirror(
    input: ScheduleMirrorInput,
    executor?: ScheduleExecutor,
  ): Promise<string>;
  updateScheduleMirror(
    id: string,
    input: ScheduleMirrorInput,
    executor?: ScheduleExecutor,
  ): Promise<void>;
  deleteScheduleById(
    id: string,
    executor?: ScheduleExecutor,
  ): Promise<void>;
  loadScheduleRows(
    executor?: ScheduleExecutor,
  ): Promise<Partial<Record<ScheduleKind, ScheduleRow>>>;
  loadManagedTriggerScheduleIds(
    executor?: ScheduleExecutor,
  ): Promise<string[]>;
};

export type ScheduleServiceDeps = {
  schedulesClient: TriggerSchedulesClient;
  repo: ScheduleRepository;
  transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T>;
  recordAuditEntry(
    entry: AuditEntryInput & { tx?: ScheduleExecutor },
  ): Promise<void>;
};

export type UnmanagedSchedule = {
  triggerScheduleId: string;
  taskId: string;
  cron: string;
  timezone: string;
  active: boolean;
};

function mirrorValues(
  schedule: TriggerSchedule,
  kind: ScheduleKind,
): ScheduleMirrorInput {
  const def = SCHEDULE_DEFS[kind];
  return {
    triggerScheduleId: schedule.id,
    kind,
    externalId: def.deduplicationKey,
    cron: schedule.generator.expression,
    timezone: schedule.timezone,
    active: schedule.active,
    nextRun: schedule.nextRun ?? null,
  };
}

export async function upsertSchedule(
  kind: ScheduleKind,
  input: ScheduleFormInput,
  actorEmail: string,
  deps: ScheduleServiceDeps,
): Promise<void> {
  const def = SCHEDULE_DEFS[kind];
  const existing = await deps.repo.findScheduleByKind(kind);

  let schedule: TriggerSchedule;

  if (!existing) {
    schedule = await deps.schedulesClient.create({
      task: def.taskId,
      cron: input.cron,
      timezone: input.timezone,
      externalId: def.deduplicationKey,
      deduplicationKey: def.deduplicationKey,
    });
  } else {
    schedule = await deps.schedulesClient.update(existing.triggerScheduleId, {
      task: def.taskId,
      cron: input.cron,
      timezone: input.timezone,
      externalId: def.deduplicationKey,
    });
  }

  if (!input.active && schedule.active) {
    schedule = await deps.schedulesClient.deactivate(schedule.id);
  } else if (input.active && !schedule.active) {
    schedule = await deps.schedulesClient.activate(schedule.id);
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
  const mirror = mirrorValues(schedule, kind);

  await deps.transaction(async (tx) => {
    const scheduleRowId = existing
      ? existing.id
      : await deps.repo.insertScheduleMirror(mirror, tx);

    if (existing) {
      await deps.repo.updateScheduleMirror(existing.id, mirror, tx);
    }

    await deps.recordAuditEntry({
      actorEmail,
      action: auditAction,
      entityType: "schedule",
      entityId: scheduleRowId,
      payload: { kind, before, after },
      tx,
    });
  });
}

export async function deleteSchedule(
  kind: ScheduleKind,
  actorEmail: string,
  deps: ScheduleServiceDeps,
): Promise<void> {
  const existing = await deps.repo.findScheduleByKind(kind);

  if (!existing) return;

  await deps.schedulesClient.del(existing.triggerScheduleId);

  await deps.transaction(async (tx) => {
    await deps.repo.deleteScheduleById(existing.id, tx);
    await deps.recordAuditEntry({
      actorEmail,
      action: "schedule.deactivated",
      entityType: "schedule",
      entityId: existing.id,
      payload: { kind, triggerScheduleId: existing.triggerScheduleId },
      tx,
    });
  });
}

export async function listSchedules(
  deps: ScheduleServiceDeps,
): Promise<Partial<Record<ScheduleKind, ScheduleRow>>> {
  return deps.repo.loadScheduleRows();
}

export async function deleteUnmanagedSchedule(
  triggerScheduleId: string,
  deps: ScheduleServiceDeps,
): Promise<void> {
  await deps.schedulesClient.del(triggerScheduleId);
}

export async function listUnmanagedSchedules(
  deps: ScheduleServiceDeps,
): Promise<UnmanagedSchedule[]> {
  const taskIds = new Set(Object.values(SCHEDULE_DEFS).map((d) => d.taskId));
  const managedDeduplicationKeys = new Set(
    Object.values(SCHEDULE_DEFS).map((d) => d.deduplicationKey),
  );
  const managedTriggerIds = new Set(
    await deps.repo.loadManagedTriggerScheduleIds(),
  );

  const page = await deps.schedulesClient.list({ perPage: 100 });

  return page.data
    .filter(
      (schedule): schedule is TriggerSchedule & { task: string } =>
        schedule.type === "IMPERATIVE" &&
        !!schedule.task &&
        taskIds.has(schedule.task) &&
        !managedTriggerIds.has(schedule.id) &&
        !(
          schedule.deduplicationKey &&
          managedDeduplicationKeys.has(schedule.deduplicationKey)
        ),
    )
    .map((schedule) => ({
      triggerScheduleId: schedule.id,
      taskId: schedule.task,
      cron: schedule.generator.expression,
      timezone: schedule.timezone,
      active: schedule.active,
    }));
}
