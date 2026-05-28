"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { deleteReportPdfs } from "@/lib/blob";
import { postN8n } from "@/lib/n8n";
import { isoWeekToWindow, reportingWindow } from "@/lib/shared/window";
import { parseEmailEditForm, parseOnDemandForm } from "@/lib/shared/validation/report";
import { reviseNarrative } from "@/lib/openrouter";
import { generateClientReport } from "@/trigger/generate-client-report";
import { regenerateReport } from "@/trigger/regenerate-report";

import { db } from "@/db";
import { auditLog, clients, reports, runs } from "@/db/schema";

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

export async function markReportSent(reportId: string) {
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
    throw new Error(`Cannot mark a report with status "${row.status}" as sent`);

  if (row.gmailDraftId) {
    try {
      await postN8n({ action: "discard", draft_id: row.gmailDraftId });
    } catch {
      // best-effort: the report was sent through another channel; don't block
      // the DB transition if the upstream draft can't be reached.
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(reports)
      .set({
        status: "sent",
        sentAt: sql`now()`,
        gmailDraftId: null,
        updatedAt: sql`now()`,
      })
      .where(eq(reports.id, reportId));
    await tx.insert(auditLog).values({
      actorEmail: email,
      action: "report.marked_sent",
      entityType: "report",
      entityId: reportId,
      payload: { draftId: row.gmailDraftId, manual: true },
    });
  });

  revalidatePath("/reports");
  revalidatePath(`/reports/${reportId}`);
  revalidatePath(`/runs/${row.runId}`);
}

export async function deleteReport(reportId: string) {
  const email = await actorEmail();

  const [row] = await db
    .select({
      id: reports.id,
      runId: reports.runId,
      clientName: reports.clientName,
      weekLabel: reports.weekLabel,
      status: reports.status,
      gmailDraftId: reports.gmailDraftId,
      pdfBlobUrl: reports.pdfBlobUrl,
    })
    .from(reports)
    .where(eq(reports.id, reportId));

  if (!row) throw new Error("Report not found");

  if (ACTIONABLE_STATUSES.has(row.status) && row.gmailDraftId) {
    try {
      await postN8n({ action: "discard", draft_id: row.gmailDraftId });
    } catch {
      // best-effort: still delete the row even if the draft can't be reached
    }
  }

  try {
    await deleteReportPdfs([row.pdfBlobUrl]);
  } catch {
    // best-effort: still delete the row even if the blob can't be reached
  }

  await db.transaction(async (tx) => {
    await tx.delete(reports).where(eq(reports.id, reportId));
    await tx.insert(auditLog).values({
      actorEmail: email,
      action: "report.delete",
      entityType: "report",
      entityId: null,
      payload: {
        reportId,
        runId: row.runId,
        clientName: row.clientName,
        weekLabel: row.weekLabel,
        priorStatus: row.status,
      },
    });
  });

  revalidatePath("/reports");
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

export async function updateReportNarrative(reportId: string, formData: FormData) {
  const email = await actorEmail();
  const narrativeMd = formData.get("narrativeMd") as string;
  if (!narrativeMd?.trim()) throw new Error("Narrative cannot be empty");

  const [row] = await db
    .select({ status: reports.status })
    .from(reports)
    .where(eq(reports.id, reportId));

  if (!row) throw new Error("Report not found");
  if (!ACTIONABLE_STATUSES.has(row.status)) throw new Error("Report is not editable");

  await db.transaction(async (tx) => {
    await tx
      .update(reports)
      .set({ narrativeMd, updatedAt: sql`now()` })
      .where(eq(reports.id, reportId));
    await tx.insert(auditLog).values({
      actorEmail: email,
      action: "report.narrative_edited",
      entityType: "report",
      entityId: reportId,
      payload: { charCount: narrativeMd.length },
    });
  });

  await regenerateReport.trigger({ reportId });

  revalidatePath(`/reports/${reportId}`);
}

export async function rewriteReportNarrative(reportId: string, formData: FormData) {
  const email = await actorEmail();
  const instructions = (formData.get("instructions") as string)?.trim();
  if (!instructions) throw new Error("Instructions cannot be empty");

  const [row] = await db
    .select({
      status: reports.status,
      narrativeMd: reports.narrativeMd,
      clientName: reports.clientName,
    })
    .from(reports)
    .where(eq(reports.id, reportId));

  if (!row) throw new Error("Report not found");
  if (!ACTIONABLE_STATUSES.has(row.status)) throw new Error("Report is not editable");
  if (!row.narrativeMd) throw new Error("No narrative to revise");

  const revised = await reviseNarrative({
    clientName: row.clientName,
    currentNarrative: row.narrativeMd,
    instructions,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(reports)
      .set({ narrativeMd: revised, updatedAt: sql`now()` })
      .where(eq(reports.id, reportId));
    await tx.insert(auditLog).values({
      actorEmail: email,
      action: "report.narrative_ai_revised",
      entityType: "report",
      entityId: reportId,
      payload: { instructions: instructions.slice(0, 500) },
    });
  });

  await regenerateReport.trigger({ reportId });
  revalidatePath(`/reports/${reportId}`);
}

export async function triggerOnDemandReport(formData: FormData) {
  const input = parseOnDemandForm(formData);
  const email = await actorEmail();

  const window = input.weekLabel
    ? isoWeekToWindow(input.weekLabel)
    : reportingWindow();

  const [runRow] = await db
    .insert(runs)
    .values({
      kind: "on_demand",
      weekLabel: window.weekLabel,
      windowStart: window.start,
      windowEnd: window.end,
      status: "running",
      startedAt: sql`now()`,
    })
    .returning({ id: runs.id });

  const handle = await generateClientReport.trigger({
    clientId: input.clientId,
    weekLabel: window.weekLabel,
    runId: runRow.id,
    onDemand: true,
  });

  await db
    .update(runs)
    .set({ triggerRunId: handle.id })
    .where(eq(runs.id, runRow.id));

  await db.insert(auditLog).values({
    actorEmail: email,
    action: "report.on_demand_triggered",
    entityType: "client",
    entityId: input.clientId,
    payload: { clientId: input.clientId, weekLabel: window.weekLabel, runId: runRow.id },
  });

  redirect(`/runs/${runRow.id}`);
}
