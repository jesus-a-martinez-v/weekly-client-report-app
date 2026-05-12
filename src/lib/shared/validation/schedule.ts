import { z } from "zod";

export const scheduleFormSchema = z.object({
  cron: z
    .string()
    .trim()
    .min(1, "Cron expression is required")
    .max(64, "Cron expression is too long")
    .regex(
      /^(\S+\s+){4}\S+$/,
      "Cron must have 5 space-separated fields (minute hour day month weekday)",
    ),
  timezone: z.string().trim().min(1).max(64).default("America/Bogota"),
  active: z.boolean().default(true),
});

export type ScheduleFormInput = z.infer<typeof scheduleFormSchema>;

export function parseScheduleForm(formData: FormData): ScheduleFormInput {
  return scheduleFormSchema.parse({
    cron: formData.get("cron"),
    timezone: formData.get("timezone") || "America/Bogota",
    active: formData.get("active") === "true",
  });
}
