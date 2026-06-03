import { task } from "@trigger.dev/sdk/v3";

import { reportRegenerationDeps } from "@/lib/services/report-regeneration-deps";
import { regeneratePdf } from "@/lib/services/reports";

const SYSTEM_ACTOR = "system";

export const regenerateReport = task({
  id: "regenerate-report",
  maxDuration: 120,
  run: async ({ reportId }: { reportId: string }): Promise<void> =>
    regeneratePdf(reportId, SYSTEM_ACTOR, reportRegenerationDeps),
});
