import { ZodError } from "zod";

import type { db } from "@/lib/db/client";
import type {
  AuditEntryInput,
  ClientInput,
  ClientListOptions,
  ClientProjectInput,
  ClientWithProjects,
} from "@/lib/db/repos";
import {
  parseClientForm,
  type ClientFormInput,
} from "@/lib/shared/validation/client";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ClientExecutor = typeof db | Transaction;

export type ClientServiceErrorCode =
  | "validation_error"
  | "not_found"
  | "slug_taken"
  | "in_flight"
  | "confirmation_mismatch";

export type ClientServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ClientServiceErrorCode; message: string };

export type ClientRepository = {
  listClients(
    options?: ClientListOptions,
    executor?: ClientExecutor,
  ): Promise<ClientWithProjects[]>;
  findClientById(
    id: string,
    executor?: ClientExecutor,
  ): Promise<ClientWithProjects | null>;
  findClientBySlug(
    slug: string,
    executor?: ClientExecutor,
  ): Promise<ClientWithProjects | null>;
  createClient(input: ClientInput, executor?: ClientExecutor): Promise<string>;
  updateClient(
    id: string,
    input: Omit<ClientInput, "projects">,
    executor?: ClientExecutor,
  ): Promise<void>;
  setProjects(
    clientId: string,
    input: ClientProjectInput[],
    executor?: ClientExecutor,
  ): Promise<void>;
  setClientStatus(
    id: string,
    status: string,
    executor?: ClientExecutor,
  ): Promise<void>;
  deleteClientById(id: string, executor?: ClientExecutor): Promise<void>;
};

export type ClientServiceDeps = {
  repo: ClientRepository;
  hasInFlightReportsForClient(
    clientId: string,
    executor?: ClientExecutor,
  ): Promise<boolean>;
  transaction<T>(callback: (tx: Transaction) => Promise<T>): Promise<T>;
  recordAuditEntry(
    entry: AuditEntryInput & { tx?: ClientExecutor },
  ): Promise<void>;
};

function ok<T>(value: T): ClientServiceResult<T> {
  return { ok: true, value };
}

function err<T>(
  code: ClientServiceErrorCode,
  message: string,
): ClientServiceResult<T> {
  return { ok: false, code, message };
}

function validationMessage(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
}

function parseClientInput(
  formData: FormData,
): ClientServiceResult<ClientFormInput> {
  try {
    return ok(parseClientForm(formData));
  } catch (error) {
    if (error instanceof ZodError) {
      return err("validation_error", validationMessage(error));
    }
    return err(
      "validation_error",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function ensureSlugAvailable(
  slug: string,
  currentClientId: string | undefined,
  deps: ClientServiceDeps,
): Promise<ClientServiceResult<null>> {
  const owner = await deps.repo.findClientBySlug(slug);
  if (owner && owner.client.id !== currentClientId) {
    return err("slug_taken", "Slug is already in use");
  }
  return ok(null);
}

function clientInputFromForm(input: ClientFormInput): ClientInput {
  return {
    name: input.name,
    slug: input.slug,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    tone: input.tone,
    projects: input.projects,
  };
}

export async function listClients(
  deps: ClientServiceDeps,
  options: ClientListOptions = {},
): Promise<ClientServiceResult<ClientWithProjects[]>> {
  return ok(await deps.repo.listClients(options));
}

export async function createClient(
  formData: FormData,
  actorEmail: string,
  deps: ClientServiceDeps,
): Promise<ClientServiceResult<string>> {
  const parsed = parseClientInput(formData);
  if (!parsed.ok) return parsed;

  const slugCheck = await ensureSlugAvailable(parsed.value.slug, undefined, deps);
  if (!slugCheck.ok) return slugCheck;

  const clientId = await deps.transaction(async (tx) => {
    const newId = await deps.repo.createClient(
      clientInputFromForm(parsed.value),
      tx,
    );
    await deps.recordAuditEntry({
      actorEmail,
      action: "client.create",
      entityType: "client",
      entityId: newId,
      payload: {
        slug: parsed.value.slug,
        projectCount: parsed.value.projects.length,
      },
      tx,
    });
    return newId;
  });

  return ok(clientId);
}

export async function updateClient(
  id: string,
  formData: FormData,
  actorEmail: string,
  deps: ClientServiceDeps,
): Promise<ClientServiceResult<null>> {
  const parsed = parseClientInput(formData);
  if (!parsed.ok) return parsed;

  const existing = await deps.repo.findClientById(id);
  if (!existing) return err("not_found", "Client not found");

  const slugCheck = await ensureSlugAvailable(parsed.value.slug, id, deps);
  if (!slugCheck.ok) return slugCheck;

  await deps.transaction(async (tx) => {
    await deps.repo.updateClient(
      id,
      {
        name: parsed.value.name,
        slug: parsed.value.slug,
        contactName: parsed.value.contactName,
        contactEmail: parsed.value.contactEmail,
        tone: parsed.value.tone,
      },
      tx,
    );
    await deps.repo.setProjects(id, parsed.value.projects, tx);
    await deps.recordAuditEntry({
      actorEmail,
      action: "client.update",
      entityType: "client",
      entityId: id,
      payload: {
        slug: parsed.value.slug,
        projectCount: parsed.value.projects.length,
      },
      tx,
    });
  });

  return ok(null);
}

export async function setProjects(
  id: string,
  projects: ClientProjectInput[],
  actorEmail: string,
  deps: ClientServiceDeps,
): Promise<ClientServiceResult<null>> {
  const existing = await deps.repo.findClientById(id);
  if (!existing) return err("not_found", "Client not found");

  await deps.transaction(async (tx) => {
    await deps.repo.setProjects(id, projects, tx);
    await deps.recordAuditEntry({
      actorEmail,
      action: "client.projects_updated",
      entityType: "client",
      entityId: id,
      payload: { projectCount: projects.length },
      tx,
    });
  });

  return ok(null);
}

export async function archiveClient(
  id: string,
  actorEmail: string,
  deps: ClientServiceDeps,
): Promise<ClientServiceResult<null>> {
  const row = await deps.repo.findClientById(id);
  if (!row) return err("not_found", "Client not found");
  if (row.client.status === "disabled") return ok(null);

  if (await deps.hasInFlightReportsForClient(id)) {
    return err(
      "in_flight",
      "Client has reports in progress; wait for them to finish before disabling.",
    );
  }

  await deps.transaction(async (tx) => {
    await deps.repo.setClientStatus(id, "disabled", tx);
    await deps.recordAuditEntry({
      actorEmail,
      action: "client.toggle",
      entityType: "client",
      entityId: id,
      payload: { from: row.client.status, to: "disabled" },
      tx,
    });
  });

  return ok(null);
}

export async function restoreClient(
  id: string,
  actorEmail: string,
  deps: ClientServiceDeps,
): Promise<ClientServiceResult<null>> {
  const row = await deps.repo.findClientById(id);
  if (!row) return err("not_found", "Client not found");
  if (row.client.status === "active") return ok(null);

  await deps.transaction(async (tx) => {
    await deps.repo.setClientStatus(id, "active", tx);
    await deps.recordAuditEntry({
      actorEmail,
      action: "client.toggle",
      entityType: "client",
      entityId: id,
      payload: { from: row.client.status, to: "active" },
      tx,
    });
  });

  return ok(null);
}

export async function toggleClientStatus(
  id: string,
  actorEmail: string,
  deps: ClientServiceDeps,
): Promise<ClientServiceResult<null>> {
  const row = await deps.repo.findClientById(id);
  if (!row) return err("not_found", "Client not found");

  return row.client.status === "active"
    ? archiveClient(id, actorEmail, deps)
    : restoreClient(id, actorEmail, deps);
}

export async function deleteClient(
  id: string,
  typedSlug: string,
  actorEmail: string,
  deps: ClientServiceDeps,
): Promise<ClientServiceResult<null>> {
  const snapshot = await deps.repo.findClientById(id);
  if (!snapshot) return err("not_found", "Client not found");
  if (snapshot.client.slug !== typedSlug) {
    return err("confirmation_mismatch", "Slug confirmation does not match");
  }

  await deps.transaction(async (tx) => {
    await deps.repo.deleteClientById(id, tx);
    await deps.recordAuditEntry({
      actorEmail,
      action: "client.delete",
      entityType: "client",
      entityId: null,
      payload: {
        client: snapshot.client,
        projects: snapshot.projects,
      },
      tx,
    });
  });

  return ok(null);
}
