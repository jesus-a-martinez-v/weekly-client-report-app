"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { parseEmailEditForm } from "@/lib/shared/validation/report";
import {
  deleteReport as deleteReportInService,
  discardReport as discardReportInService,
  markReportSent as markReportSentInService,
  reviseNarrative as reviseNarrativeInService,
  sendReport as sendReportInService,
  updateEmailDraft,
  updateNarrative,
  type ReportMutationResult,
} from "@/lib/services/reports";
import { reportServiceDeps } from "./report-service-deps";

async function actorEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Unauthorized");
  return email;
}

function revalidateReportMutation(result: ReportMutationResult): void {
  revalidatePath("/reports");
  revalidatePath(`/reports/${result.reportId}`);
  revalidatePath(`/runs/${result.runId}`);
}

export async function sendReport(reportId: string): Promise<void> {
  const result = await sendReportInService(
    reportId,
    await actorEmail(),
    reportServiceDeps,
  );
  revalidateReportMutation(result);
}

export async function markReportSent(reportId: string): Promise<void> {
  const result = await markReportSentInService(
    reportId,
    await actorEmail(),
    reportServiceDeps,
  );
  revalidateReportMutation(result);
}

export async function discardReport(reportId: string): Promise<void> {
  const result = await discardReportInService(
    reportId,
    await actorEmail(),
    reportServiceDeps,
  );
  revalidateReportMutation(result);
}

export async function deleteReport(reportId: string): Promise<void> {
  const result = await deleteReportInService(
    reportId,
    await actorEmail(),
    reportServiceDeps,
  );
  revalidatePath("/reports");
  revalidatePath(`/runs/${result.runId}`);
}

export async function updateReportEmail(
  reportId: string,
  formData: FormData,
): Promise<void> {
  await updateEmailDraft(
    reportId,
    parseEmailEditForm(formData),
    await actorEmail(),
    reportServiceDeps,
  );
  revalidatePath(`/reports/${reportId}`);
}

export async function updateReportNarrative(
  reportId: string,
  formData: FormData,
): Promise<void> {
  await updateNarrative(
    reportId,
    String(formData.get("narrativeMd") ?? ""),
    await actorEmail(),
    reportServiceDeps,
  );
  revalidatePath(`/reports/${reportId}`);
}

export async function rewriteReportNarrative(
  reportId: string,
  formData: FormData,
): Promise<void> {
  await reviseNarrativeInService(
    reportId,
    String(formData.get("instructions") ?? ""),
    await actorEmail(),
    reportServiceDeps,
  );
  revalidatePath(`/reports/${reportId}`);
}
