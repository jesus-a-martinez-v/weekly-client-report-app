"use server";

import { auth } from "@/lib/auth";
import { parseDailySummaryForm } from "@/lib/shared/validation/daily-summary";
import { generateDailySummary as generateDailySummaryService } from "@/lib/services/daily-summary";
import { dailySummaryDeps } from "@/lib/services/daily-summary-deps";
import type { DailySummaryResult } from "@/lib/services/daily-summary";

async function actorEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Unauthorized");
  return email;
}

export type DailySummaryActionState =
  | { status: "idle" }
  | { status: "success"; result: DailySummaryResult }
  | { status: "error"; error: string };

export async function generateDailySummaryAction(
  _prev: DailySummaryActionState,
  formData: FormData,
): Promise<DailySummaryActionState> {
  await actorEmail();

  let parsed: { clientId: string; date: string };
  try {
    parsed = parseDailySummaryForm(formData);
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Invalid form input",
    };
  }

  try {
    const result = await generateDailySummaryService(
      { clientId: parsed.clientId, dateISO: parsed.date },
      dailySummaryDeps,
    );
    return { status: "success", result };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : "Failed to generate daily summary",
    };
  }
}
