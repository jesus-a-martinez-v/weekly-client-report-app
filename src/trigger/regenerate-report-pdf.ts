import { task } from "@trigger.dev/sdk/v3";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLog, clients, reports } from "@/db/schema";
import { renderReportHtml } from "@/lib/shared/pdf-template";
import { renderPdfBuffer } from "@/lib/pdf";
import { uploadReportPdf } from "@/lib/blob";
import { bogotaDateISO, formatRange, reportFilename } from "@/lib/shared/window";

const SYSTEM_ACTOR = "system";

export const regenerateReportPdf = task({
  id: "regenerate-report-pdf",
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
      })
      .from(reports)
      .where(eq(reports.id, reportId));

    if (!row) throw new Error(`Report not found: ${reportId}`);
    if (!row.narrativeMd) throw new Error("Report has no narrative");
    if (!row.clientId) throw new Error("Report has no associated client");

    const [client] = await db
      .select({ slug: clients.slug })
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

    await db
      .update(reports)
      .set({ pdfBlobUrl: uploaded.url, pdfFilename: filename, updatedAt: sql`now()` })
      .where(eq(reports.id, reportId));

    await db.insert(auditLog).values({
      actorEmail: SYSTEM_ACTOR,
      action: "report.pdf_regenerated",
      entityType: "report",
      entityId: reportId,
      payload: { pdfPathname: uploaded.pathname },
    });
  },
});
