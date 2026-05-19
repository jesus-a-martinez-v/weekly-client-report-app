import { del, put } from "@vercel/blob";

export type UploadPdfInput = {
  weekLabel: string;
  slug: string;
  startDateISO: string;
  filename: string;
  body: Buffer;
};

export type UploadedBlob = { url: string; pathname: string };

export async function uploadReportPdf(input: UploadPdfInput): Promise<UploadedBlob> {
  const token = process.env.WEEKLY_CLIENT_REPORTS_BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("WEEKLY_CLIENT_REPORTS_BLOB_READ_WRITE_TOKEN is not set");

  const pathname = `reports/${input.weekLabel}/${input.slug}_${input.startDateISO}_report.pdf`;
  const res = await put(pathname, input.body, {
    access: "public",
    contentType: "application/pdf",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return { url: res.url, pathname: res.pathname };
}

export async function deleteReportPdfs(
  urls: Array<string | null | undefined>,
): Promise<void> {
  const token = process.env.WEEKLY_CLIENT_REPORTS_BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("WEEKLY_CLIENT_REPORTS_BLOB_READ_WRITE_TOKEN is not set");

  const clean = urls.filter((u): u is string => Boolean(u));
  if (clean.length === 0) return;

  await del(clean, { token });
}
