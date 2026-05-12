import { z } from "zod";

const weekLabelSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-W\d{2}$/, "Week label must be YYYY-Www");

export const emailEditSchema = z.object({
  subject: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(32768),
});

export const onDemandSchema = z.object({
  clientId: z.string().uuid(),
  weekLabel: weekLabelSchema.optional(),
});

export type EmailEditInput = z.infer<typeof emailEditSchema>;
export type OnDemandInput = z.infer<typeof onDemandSchema>;

export function parseEmailEditForm(formData: FormData): EmailEditInput {
  return emailEditSchema.parse({
    subject: formData.get("subject"),
    body: formData.get("body"),
  });
}

export function parseOnDemandForm(formData: FormData): OnDemandInput {
  const weekLabel = formData.get("weekLabel");
  return onDemandSchema.parse({
    clientId: formData.get("clientId"),
    weekLabel: typeof weekLabel === "string" && weekLabel.trim().length > 0
      ? weekLabel.trim()
      : undefined,
  });
}
