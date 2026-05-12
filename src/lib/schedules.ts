export type ScheduleKind = "weekly_run" | "drafted_reminder";

export const SCHEDULE_DEFS: Record<
  ScheduleKind,
  {
    label: string;
    description: string;
    taskId: string;
    defaultCron: string;
    defaultTimezone: string;
    deduplicationKey: string;
  }
> = {
  weekly_run: {
    label: "Weekly fanout",
    description:
      "Fires once a week to generate reports for all active clients.",
    taskId: "weekly-report-run",
    defaultCron: "0 9 * * 1",
    defaultTimezone: "America/Bogota",
    deduplicationKey: "weekly-run-default",
  },
  drafted_reminder: {
    label: "Drafted-report nudge",
    description:
      "Sends a Telegram reminder when reports have been in 'drafted' status for too long.",
    taskId: "drafted-reminder",
    defaultCron: "0 9 * * 1-5",
    defaultTimezone: "America/Bogota",
    deduplicationKey: "drafted-reminder-default",
  },
};

export const SCHEDULE_KINDS: ScheduleKind[] = ["weekly_run", "drafted_reminder"];

export const CURATED_TIMEZONES = [
  "America/Bogota",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/Madrid",
  "Europe/London",
  "Asia/Tokyo",
];
