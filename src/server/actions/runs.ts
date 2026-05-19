"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { deleteReportPdfs } from "@/lib/blob";
import { postN8n } from "@/lib/n8n";
import { db } from "@/db";
import { auditLog, reports, runs } from "@/db/schema";

const ACTIONABLE_DRAFT_STATUSES = new Set(["drafted", "quiet"]);

async function actorEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Unauthorized");
  return email;
}

export async function deleteRun(runId: string) {
  const email = await actorEmail();

  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new Error("Run not found");

  const children = await db
    .select({
      id: reports.id,
      status: reports.status,
      gmailDraftId: reports.gmailDraftId,
      pdfBlobUrl: reports.pdfBlobUrl,
    })
    .from(reports)
    .where(eq(reports.runId, runId));

  for (const r of children) {
    if (ACTIONABLE_DRAFT_STATUSES.has(r.status) && r.gmailDraftId) {
      try {
        await postN8n({ action: "discard", draft_id: r.gmailDraftId });
      } catch {
        // best-effort: continue even if the draft can't be reached
      }
    }
  }

  try {
    await deleteReportPdfs(children.map((r) => r.pdfBlobUrl));
  } catch {
    // best-effort: still delete the run even if blob cleanup fails
  }

  await db.transaction(async (tx) => {
    // reports.runId has onDelete: cascade, so child reports are removed too
    await tx.delete(runs).where(eq(runs.id, runId));
    await tx.insert(auditLog).values({
      actorEmail: email,
      action: "run.delete",
      entityType: "run",
      entityId: null,
      payload: {
        runId,
        weekLabel: run.weekLabel,
        kind: run.kind,
        reportCount: children.length,
      },
    });
  });

  revalidatePath("/runs");
  revalidatePath("/reports");
}
