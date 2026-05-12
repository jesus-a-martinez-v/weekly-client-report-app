"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { postN8n } from "@/lib/n8n";
import { reportingWindow } from "@/lib/window";
import { parseEmailEditForm, parseOnDemandForm } from "@/lib/validation/report";
import { generateClientReport } from "@/trigger/generate-client-report";

import { db } from "@/db";
import { auditLog, clients, reports } from "@/db/schema";

const ACTIONABLE_STATUSES = new Set(["drafted", "quiet"]);

async function actorEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Unauthorized");
  return email;
}

export async function sendReport(reportId: string) {
  const email = await actorEmail();

  const [row] = await db
    .select({
      id: reports.id,
      runId: reports.runId,
      gmailDraftId: reports.gmailDraftId,
      status: reports.status,
    })
    .from(reports)
    .where(eq(reports.id, reportId));

  if (!row) throw new Error("Report not found");
  if (!ACTIONABLE_STATUSES.has(row.status))
    throw new Error(`Cannot send a report with status "${row.status}"`);
  if (!row.gmailDraftId) throw new Error("Report has no Gmail draft id");

  await postN8n({ action: "send", draft_id: row.gmailDraftId });

  await db.transaction(async (tx) => {
    await tx
      .update(reports)
      .set({ status: "sent", sentAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(reports.id, reportId));
    await tx.insert(auditLog).values({
      actorEmail: email,
      action: "report.sent",
      entityType: "report",
      entityId: reportId,
      payload: { draftId: row.gmailDraftId },
    });
  });

  revalidatePath("/reports");
  revalidatePath(`/reports/${reportId}`);
  revalidatePath(`/runs/${row.runId}`);
}

export async function discardReport(reportId: string) {
  const email = await actorEmail();

  const [row] = await db
    .select({
      id: reports.id,
      runId: reports.runId,
      gmailDraftId: reports.gmailDraftId,
      status: reports.status,
    })
    .from(reports)
    .where(eq(reports.id, reportId));

  if (!row) throw new Error("Report not found");
  if (!ACTIONABLE_STATUSES.has(row.status))
    throw new Error(`Cannot discard a report with status "${row.status}"`);
  if (!row.gmailDraftId) throw new Error("Report has no Gmail draft id");

  await postN8n({ action: "discard", draft_id: row.gmailDraftId });

  await db.transaction(async (tx) => {
    await tx
      .update(reports)
      .set({
        status: "discarded",
        discardedAt: sql`now()`,
        gmailDraftId: null,
        updatedAt: sql`now()`,
      })
      .where(eq(reports.id, reportId));
    await tx.insert(auditLog).values({
      actorEmail: email,
      action: "report.discarded",
      entityType: "report",
      entityId: reportId,
      payload: { draftId: row.gmailDraftId },
    });
  });

  revalidatePath("/reports");
  revalidatePath(`/reports/${reportId}`);
  revalidatePath(`/runs/${row.runId}`);
}

export async function updateReportEmail(reportId: string, formData: FormData) {
  const input = parseEmailEditForm(formData);
  const email = await actorEmail();

  const [row] = await db
    .select({
      id: reports.id,
      runId: reports.runId,
      status: reports.status,
      gmailDraftId: reports.gmailDraftId,
      pdfBlobUrl: reports.pdfBlobUrl,
      pdfFilename: reports.pdfFilename,
      weekLabel: reports.weekLabel,
      clientId: reports.clientId,
    })
    .from(reports)
    .where(eq(reports.id, reportId));

  if (!row) throw new Error("Report not found");
  if (!ACTIONABLE_STATUSES.has(row.status))
    throw new Error(`Cannot edit a report with status "${row.status}"`);
  if (!row.gmailDraftId) throw new Error("Report has no Gmail draft id");
  if (!row.clientId) throw new Error("Report has no associated client");

  const [client] = await db
    .select({ contactEmail: clients.contactEmail, slug: clients.slug })
    .from(clients)
    .where(eq(clients.id, row.clientId));

  if (!client) throw new Error("Client not found");

  const oldDraftId = row.gmailDraftId;
  await postN8n({ action: "discard", draft_id: oldDraftId });

  const draftRes = await postN8n({
    action: "draft",
    to: client.contactEmail,
    subject: input.subject,
    body: input.body,
    pdf_url: row.pdfBlobUrl ?? undefined,
    filename: row.pdfBlobUrl ? (row.pdfFilename ?? undefined) : undefined,
    client_slug: client.slug,
    week_label: row.weekLabel,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(reports)
      .set({
        emailSubject: input.subject,
        emailBody: input.body,
        gmailDraftId: draftRes.draft_id,
        updatedAt: sql`now()`,
      })
      .where(eq(reports.id, reportId));
    await tx.insert(auditLog).values({
      actorEmail: email,
      action: "report.edited",
      entityType: "report",
      entityId: reportId,
      payload: { oldDraftId, newDraftId: draftRes.draft_id },
    });
  });

  revalidatePath(`/reports/${reportId}`);
}

export async function triggerOnDemandReport(formData: FormData) {
  const input = parseOnDemandForm(formData);
  const email = await actorEmail();

  await generateClientReport.trigger({
    clientId: input.clientId,
    weekLabel: input.weekLabel,
    onDemand: true,
  });

  await db.insert(auditLog).values({
    actorEmail: email,
    action: "report.on_demand_triggered",
    entityType: "client",
    entityId: input.clientId,
    payload: { clientId: input.clientId, weekLabel: input.weekLabel ?? null },
  });

  const weekParam = input.weekLabel ?? reportingWindow().weekLabel;
  redirect(`/reports?clientId=${input.clientId}&weekLabel=${weekParam}`);
}
