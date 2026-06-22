import { z } from "zod";

const dailySummarySchema = z.object({
  clientId: z.string().uuid("Invalid client ID"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
});

export type DailySummaryFormInput = z.infer<typeof dailySummarySchema>;

export function parseDailySummaryForm(formData: FormData): DailySummaryFormInput {
  return dailySummarySchema.parse({
    clientId: formData.get("clientId"),
    date: formData.get("date"),
  });
}
