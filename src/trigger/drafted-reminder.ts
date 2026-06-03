import { schedules, logger } from "@trigger.dev/sdk/v3";

import { draftedReminderDeps } from "@/lib/services/reminder-deps";
import { sendDraftedReportReminders } from "@/lib/services/reminders";

export const draftedReminder = schedules.task({
  id: "drafted-reminder",
  maxDuration: 120,
  run: async () => {
    const result = await sendDraftedReportReminders(
      { thresholdHours: Number(process.env.REMINDER_THRESHOLD_HOURS ?? "18") },
      draftedReminderDeps,
    );

    if (result.count === 0) {
      logger.info("No stale drafts to remind about");
    } else {
      logger.info("Drafted reminder sent", { count: result.count });
    }

    return result;
  },
});
