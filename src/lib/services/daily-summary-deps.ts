import { fetchClientActivity } from "@/lib/clients/octokit";
import { fetchLinearActivity } from "@/lib/clients/linear";
import { generateDailySummary } from "@/lib/clients/openrouter";
import { findClientByIdWithLinearToken } from "@/lib/db/repos/clients";
import type { DailySummaryDeps } from "./daily-summary";

export const dailySummaryDeps: DailySummaryDeps = {
  activity: { fetchClientActivity, fetchLinearActivity },
  openRouter: { generateDailySummary },
  clientsRepo: { findClientByIdWithLinearToken },
};
