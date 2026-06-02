import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { runs, type Run } from "@/lib/db/schema";

// Accepts either the base db handle or an in-flight transaction handle, so callers
// can run queries standalone or inside an existing db.transaction(...).
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type RunExecutor = typeof db | Transaction;

export type CreateRunInput = {
  kind: string;
  weekLabel: string;
  windowStart: Date;
  windowEnd: Date;
  status?: string;
  triggerRunId?: string | null;
};

export type UpdateRunStatusOptions = {
  errorMessage?: string | null;
};

export async function findRunById(
  id: string,
  executor: RunExecutor = db,
): Promise<Run | null> {
  const [row] = await executor
    .select()
    .from(runs)
    .where(eq(runs.id, id))
    .limit(1);

  return row ?? null;
}

export async function listRuns(executor: RunExecutor = db): Promise<Run[]> {
  return executor.select().from(runs).orderBy(desc(runs.createdAt));
}

/** Insert a run and return its id. Marks the run as started (`startedAt = now()`). */
export async function createRun(
  input: CreateRunInput,
  executor: RunExecutor = db,
): Promise<string> {
  const [row] = await executor
    .insert(runs)
    .values({
      kind: input.kind,
      weekLabel: input.weekLabel,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      status: input.status ?? "running",
      triggerRunId: input.triggerRunId ?? null,
      startedAt: sql`now()` as unknown as Date,
    })
    .returning({ id: runs.id });

  if (!row) throw new Error("Failed to create run");
  return row.id;
}

/**
 * Move a run to a terminal state. Always stamps `finishedAt = now()`; pass
 * `errorMessage` (possibly null) to record or clear a failure reason.
 */
export async function updateRunStatus(
  id: string,
  status: string,
  options: UpdateRunStatusOptions = {},
  executor: RunExecutor = db,
): Promise<void> {
  const values: Partial<typeof runs.$inferInsert> = {
    status,
    finishedAt: sql`now()` as unknown as Date,
  };
  if ("errorMessage" in options) {
    values.errorMessage = options.errorMessage ?? null;
  }

  await executor.update(runs).set(values).where(eq(runs.id, id));
}

export async function updateRunTriggerRunId(
  id: string,
  triggerRunId: string,
  executor: RunExecutor = db,
): Promise<void> {
  await executor.update(runs).set({ triggerRunId }).where(eq(runs.id, id));
}

export async function deleteRunById(
  id: string,
  executor: RunExecutor = db,
): Promise<void> {
  await executor.delete(runs).where(eq(runs.id, id));
}
