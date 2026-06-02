import { task } from "@trigger.dev/sdk/v3";
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { auditLog, clients, reports } from "@/lib/db/schema";
import { renderReportHtml } from "@/lib/shared/pdf-template";
import { renderPdfBuffer } from "@/lib/clients/pdf";
import { uploadReportPdf } from "@/lib/clients/blob";
import { postN8n } from "@/lib/clients/n8n";
import { generateEmailDraft } from "@/lib/clients/openrouter";
import { bogotaDateISO, formatRange, reportFilename } from "@/lib/shared/window";

const SYSTEM_ACTOR = "system";

export const regenerateReport = task({
  id: "regenerate-report",
  maxDuration: 120,
  run: async ({ reportId }: { reportId: string }) => {
    const [row] = await db
      .select({
        id: reports.id,
        clientId: reports.clientId,
        clientName: reports.clientName,
        weekLabel: reports.weekLabel,
        windowStart: reports.windowStart,
        windowEnd: reports.windowEnd,
        narrativeMd: reports.narrativeMd,
        gmailDraftId: reports.gmailDraftId,
      })
      .from(reports)
      .where(eq(reports.id, reportId));

    if (!row) throw new Error(`Report not found: ${reportId}`);
    if (!row.narrativeMd) throw new Error("Report has no narrative");
    if (!row.clientId) throw new Error("Report has no associated client");

    const [client] = await db
      .select({
        slug: clients.slug,
        contactName: clients.contactName,
        contactEmail: clients.contactEmail,
      })
      .from(clients)
      .where(eq(clients.id, row.clientId));

    if (!client) throw new Error("Client not found");

    const dateRange = formatRange(row.windowStart, row.windowEnd);
    const startDateISO = bogotaDateISO(row.windowStart);
    const filename = reportFilename(row.clientName, startDateISO);

    const html = renderReportHtml({
      clientName: row.clientName,
      weekLabel: row.weekLabel,
      dateRange,
      narrativeMd: row.narrativeMd,
    });

    const buf = await renderPdfBuffer(html);
    const uploaded = await uploadReportPdf({
      weekLabel: row.weekLabel,
      slug: client.slug,
      startDateISO,
      filename,
      body: buf,
    });

    const email = await generateEmailDraft({
      clientName: row.clientName,
      contactName: client.contactName,
      dateRange,
      narrativeMd: row.narrativeMd,
    });

    const oldDraftId = row.gmailDraftId;
    if (oldDraftId) {
      try {
        await postN8n({ action: "discard", draft_id: oldDraftId });
      } catch {
        // best-effort: don't block regeneration if the old draft can't be reached
      }
    }

    const draftRes = await postN8n({
      action: "draft",
      to: client.contactEmail,
      subject: email.subject,
      body: email.body,
      pdf_url: uploaded.url,
      filename,
      client_slug: client.slug,
      week_label: row.weekLabel,
    });

    await db
      .update(reports)
      .set({
        pdfBlobUrl: uploaded.url,
        pdfFilename: filename,
        emailSubject: email.subject,
        emailBody: email.body,
        gmailDraftId: draftRes.draft_id,
        updatedAt: sql`now()`,
      })
      .where(eq(reports.id, reportId));

    await db.insert(auditLog).values({
      actorEmail: SYSTEM_ACTOR,
      action: "report.regenerated",
      entityType: "report",
      entityId: reportId,
      payload: {
        pdfPathname: uploaded.pathname,
        oldDraftId,
        newDraftId: draftRes.draft_id,
      },
    });
  },
});
