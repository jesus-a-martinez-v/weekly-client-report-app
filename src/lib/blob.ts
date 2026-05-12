import { put } from "@vercel/blob";

export type UploadPdfInput = {
  weekLabel: string;
  slug: string;
  startDateISO: string;
  filename: string;
  body: Buffer;
};

export type UploadedBlob = { url: string; pathname: string };

export async function uploadReportPdf(input: UploadPdfInput): Promise<UploadedBlob> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set");

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
