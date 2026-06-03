import { db } from "@/lib/db/client";
import { auditLog, type AuditLog } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";

// Accepts either the base db handle or an in-flight transaction handle, so callers
// can record audit entries standalone or inside an existing db.transaction(...).
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AuditExecutor = typeof db | Transaction;

export type AuditTimelineEntry = Pick<
  AuditLog,
  "id" | "actorEmail" | "action" | "payload" | "createdAt"
>;

export type AuditEntryInput = {
  actorEmail: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
};

/** Write a single audit-log row. Pass `tx` to participate in an existing transaction. */
export async function recordAuditEntry(
  entry: AuditEntryInput & { tx?: AuditExecutor },
): Promise<void> {
  const { tx, ...values } = entry;
  await recordAuditEntries([values], tx);
}

/** Write multiple audit-log rows in one statement. */
export async function recordAuditEntries(
  entries: AuditEntryInput[],
  tx?: AuditExecutor,
): Promise<void> {
  if (entries.length === 0) return;
  await (tx ?? db).insert(auditLog).values(entries);
}

export async function listAuditEntriesForEntity(
  entityType: string,
  entityId: string,
  executor: AuditExecutor = db,
): Promise<AuditTimelineEntry[]> {
  return executor
    .select({
      id: auditLog.id,
      actorEmail: auditLog.actorEmail,
      action: auditLog.action,
      payload: auditLog.payload,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(
      and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)),
    )
    .orderBy(desc(auditLog.createdAt));
}
