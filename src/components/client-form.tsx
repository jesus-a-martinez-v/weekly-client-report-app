"use client";

import { useState, useTransition } from "react";

import { clientFormSchema } from "@/lib/validation/client";

type ProjectInput = {
  id?: string;
  name: string;
  repos: string[];
};

export type ClientFormInitial = {
  id?: string;
  name: string;
  slug: string;
  contactName: string;
  contactEmail: string;
  tone: string;
  projects: ProjectInput[];
};

const empty: ClientFormInitial = {
  name: "",
  slug: "",
  contactName: "",
  contactEmail: "",
  tone: "friendly-professional",
  projects: [{ name: "", repos: [] }],
};

export function ClientForm({
  initial = empty,
  submit,
  submitLabel,
}: {
  initial?: ClientFormInitial;
  submit: (formData: FormData) => Promise<void>;
  submitLabel: string;
}) {
  const [projects, setProjects] = useState<ProjectInput[]>(initial.projects);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function addProject() {
    setProjects((ps) => [...ps, { name: "", repos: [] }]);
  }

  function removeProject(idx: number) {
    setProjects((ps) => ps.filter((_, i) => i !== idx));
  }

  function updateProjectName(idx: number, name: string) {
    setProjects((ps) => ps.map((p, i) => (i === idx ? { ...p, name } : p)));
  }

  function addRepo(idx: number, raw: string) {
    const candidates = raw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (candidates.length === 0) return;
    setProjects((ps) =>
      ps.map((p, i) =>
        i === idx ? { ...p, repos: [...p.repos, ...candidates] } : p,
      ),
    );
  }

  function removeRepo(idx: number, repoIdx: number) {
    setProjects((ps) =>
      ps.map((p, i) =>
        i === idx
          ? { ...p, repos: p.repos.filter((_, j) => j !== repoIdx) }
          : p,
      ),
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors([]);
    const form = e.currentTarget;
    const fd = new FormData(form);

    const payload = {
      name: String(fd.get("name") ?? ""),
      slug: String(fd.get("slug") ?? ""),
      contactName: String(fd.get("contactName") ?? ""),
      contactEmail: String(fd.get("contactEmail") ?? ""),
      tone: String(fd.get("tone") || "friendly-professional"),
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name?.trim() ? p.name.trim() : null,
        repos: p.repos,
      })),
    };

    const result = clientFormSchema.safeParse(payload);
    if (!result.success) {
      setErrors(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
      return;
    }

    fd.set("projects", JSON.stringify(payload.projects));
    startTransition(async () => {
      try {
        await submit(fd);
      } catch (err) {
        setErrors([err instanceof Error ? err.message : String(err)]);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-10">
      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-medium">Please fix:</p>
          <ul className="mt-2 list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Field label="Name">
          <input
            name="name"
            defaultValue={initial.name}
            required
            className={fieldClass}
          />
        </Field>
        <Field label="Slug">
          <input
            name="slug"
            defaultValue={initial.slug}
            required
            placeholder="e.g. example-client"
            className={fieldClass}
          />
        </Field>
        <Field label="Contact name">
          <input
            name="contactName"
            defaultValue={initial.contactName}
            required
            className={fieldClass}
          />
        </Field>
        <Field label="Contact email">
          <input
            name="contactEmail"
            type="email"
            defaultValue={initial.contactEmail}
            required
            className={fieldClass}
          />
        </Field>
        <Field label="Tone">
          <input
            name="tone"
            defaultValue={initial.tone}
            className={fieldClass}
          />
        </Field>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">
              Projects
            </p>
            <h2 className="text-lg font-medium">
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </h2>
          </div>
          <button
            type="button"
            onClick={addProject}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            + Add project
          </button>
        </div>

        <div className="space-y-6">
          {projects.map((p, idx) => (
            <ProjectBlock
              key={p.id ?? `new-${idx}`}
              project={p}
              onNameChange={(v) => updateProjectName(idx, v)}
              onAddRepo={(v) => addRepo(idx, v)}
              onRemoveRepo={(j) => removeRepo(idx, j)}
              onRemove={
                projects.length > 1 ? () => removeProject(idx) : undefined
              }
            />
          ))}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3 border-t hairline pt-6">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function ProjectBlock({
  project,
  onNameChange,
  onAddRepo,
  onRemoveRepo,
  onRemove,
}: {
  project: ProjectInput;
  onNameChange: (v: string) => void;
  onAddRepo: (v: string) => void;
  onRemoveRepo: (idx: number) => void;
  onRemove?: () => void;
}) {
  const [repoDraft, setRepoDraft] = useState("");

  function commit() {
    if (repoDraft.trim().length === 0) return;
    onAddRepo(repoDraft);
    setRepoDraft("");
  }

  return (
    <div className="rounded-md border hairline bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <label className="text-xs uppercase tracking-[0.14em] text-zinc-500">
            Project name
          </label>
          <input
            value={project.name ?? ""}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="(unnamed — single-project client)"
            className={`${fieldClass} mt-1`}
          />
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="mt-6 rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 hover:border-red-300 hover:text-red-700"
          >
            Remove project
          </button>
        )}
      </div>

      <div className="mt-4">
        <label className="text-xs uppercase tracking-[0.14em] text-zinc-500">
          Repos
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {project.repos.map((repo, j) => (
            <span
              key={`${repo}-${j}`}
              className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700"
            >
              <span className="font-mono">{repo}</span>
              <button
                type="button"
                onClick={() => onRemoveRepo(j)}
                className="text-zinc-400 hover:text-red-600"
                aria-label={`Remove ${repo}`}
              >
                ×
              </button>
            </span>
          ))}
          <div className="flex items-center gap-2">
            <input
              value={repoDraft}
              onChange={(e) => setRepoDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  commit();
                }
              }}
              placeholder="Owner/repo"
              className="w-44 rounded-md border border-zinc-200 px-2 py-1 text-xs font-mono"
            />
            <button
              type="button"
              onClick={commit}
              className="text-xs text-zinc-500 hover:text-zinc-900"
            >
              + Add
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          Format: <span className="font-mono">Owner/repo</span>. Commas or
          Enter to add multiple.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const fieldClass =
  "block w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300";
