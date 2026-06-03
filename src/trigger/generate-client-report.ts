import { logger, task } from "@trigger.dev/sdk/v3";

import {
  generateReportForClient,
  type GenerateClientReportPayload,
  type GenerateClientReportResult,
} from "@/lib/services/report-pipeline";
import { reportPipelineDeps } from "@/lib/services/report-pipeline-deps";

export type { GenerateClientReportPayload, GenerateClientReportResult };

export const generateClientReport = task({
  id: "generate-client-report",
  maxDuration: 600,
  run: async (
    payload: GenerateClientReportPayload,
    { ctx },
  ): Promise<GenerateClientReportResult> =>
    generateReportForClient(payload, reportPipelineDeps, {
      triggerRunId: ctx.run.id,
      logger,
    }),
});
