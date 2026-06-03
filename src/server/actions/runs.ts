"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { parseOnDemandForm } from "@/lib/shared/validation/report";
import {
  deleteRun as deleteRunInService,
  triggerOnDemandRun,
} from "@/lib/services/runs";
import { runServiceDeps } from "@/lib/services/run-service-deps";

async function actorEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Unauthorized");
  return email;
}

export async function deleteRun(runId: string): Promise<void> {
  await deleteRunInService(runId, await actorEmail(), runServiceDeps);

  revalidatePath("/runs");
  revalidatePath("/reports");
}

export async function triggerOnDemandReport(
  formData: FormData,
): Promise<void> {
  const runId = await triggerOnDemandRun(
    parseOnDemandForm(formData),
    await actorEmail(),
    runServiceDeps,
  );
  redirect(`/runs/${runId}`);
}
