import { logger, schedules } from "@trigger.dev/sdk/v3";

import { runWeeklyReports } from "@/lib/services/runs";
import { weeklyRunDeps } from "@/lib/services/weekly-run-deps";

export const weeklyReportRun = schedules.task({
  id: "weekly-report-run",
  maxDuration: 900,
  run: async (payload, { ctx }) =>
    runWeeklyReports(
      { timestamp: payload.timestamp, triggerRunId: ctx.run.id, logger },
      weeklyRunDeps,
    ),
});
