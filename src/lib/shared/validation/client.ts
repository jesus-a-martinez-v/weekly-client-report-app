import { z } from "zod";

const repoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const sourceSchema = z.enum(["github", "linear"]);

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional();

export const projectSchema = z.object({
  id: z.string().uuid().optional(),
  name: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable(),
  repos: z
    .array(
      z
        .string()
        .trim()
        .regex(repoPattern, "Each repo must be 'Owner/repo'"),
    ),
  linearTeamKey: optionalTrimmed(20),
  linearProjectId: optionalTrimmed(64),
});

export const clientFormSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    slug: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, digits, dashes"),
    contactName: z.string().trim().min(1).max(200),
    contactEmail: z.string().trim().email().max(320),
    tone: z.string().trim().min(1).max(40).default("friendly-professional"),
    source: sourceSchema.default("github"),
    linearToken: z.string().trim().optional(),
    projects: z.array(projectSchema).min(1, "Add at least one project"),
  })
  .superRefine((input, ctx) => {
    input.projects.forEach((project, idx) => {
      if (input.source === "github" && project.repos.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each project needs at least one repo",
          path: ["projects", idx, "repos"],
        });
      }

      if (input.source === "linear" && !project.linearTeamKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Linear team key is required for Linear clients",
          path: ["projects", idx, "linearTeamKey"],
        });
      }
    });
  });

export type ClientFormInput = z.infer<typeof clientFormSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;

export function parseClientForm(formData: FormData): ClientFormInput {
  const projectsRaw = formData.get("projects");
  let projects: unknown = [];
  if (typeof projectsRaw === "string" && projectsRaw.length > 0) {
    try {
      projects = JSON.parse(projectsRaw);
    } catch (err) {
      throw new Error("Could not parse projects payload", { cause: err });
    }
  }

  return clientFormSchema.parse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    contactName: formData.get("contactName"),
    contactEmail: formData.get("contactEmail"),
    tone: formData.get("tone") || "friendly-professional",
    source: formData.get("source") || "github",
    linearToken: formData.get("linearToken") ?? undefined,
    projects,
  });
}
