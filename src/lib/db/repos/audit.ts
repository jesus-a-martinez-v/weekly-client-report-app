import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

// Accepts either the base db handle or an in-flight transaction handle, so callers
// can record audit entries standalone or inside an existing db.transaction(...).
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AuditExecutor = typeof db | Transaction;

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
