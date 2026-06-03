import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  clients,
  projects,
  type Client,
  type Project,
} from "@/lib/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ClientExecutor = typeof db | Transaction;

export type ClientSource = "github" | "linear";

export type ClientProjectInput = {
  id?: string;
  name: string | null;
  repos: string[];
  linearTeamKey?: string;
  linearProjectId?: string;
};

export type ClientInput = {
  name: string;
  slug: string;
  contactName: string;
  contactEmail: string;
  tone: string;
  source: ClientSource;
  linearTokenEnc?: string;
  projects?: ClientProjectInput[];
};

export type ClientListOptions = {
  status?: string;
};

export type ClientWithProjects = {
  client: ClientWithoutLinearToken;
  projects: Project[];
};

export type ClientWithLinearTokenAndProjects = {
  client: Client;
  projects: Project[];
};

export type ClientWithoutLinearToken = Omit<Client, "linearTokenEnc">;

const clientColumnsWithoutLinearToken = {
  id: clients.id,
  name: clients.name,
  slug: clients.slug,
  contactName: clients.contactName,
  contactEmail: clients.contactEmail,
  tone: clients.tone,
  status: clients.status,
  source: clients.source,
  createdAt: clients.createdAt,
  updatedAt: clients.updatedAt,
};

const clientColumnsWithLinearToken = {
  ...clientColumnsWithoutLinearToken,
  linearTokenEnc: clients.linearTokenEnc,
};

async function listProjectsForClients(
  clientIds: string[],
  executor: ClientExecutor,
): Promise<Project[]> {
  if (clientIds.length === 0) return [];

  return executor
    .select()
    .from(projects)
    .where(inArray(projects.clientId, clientIds))
    .orderBy(asc(projects.clientId), asc(projects.position));
}

function attachProjects(
  clientRows: ClientWithoutLinearToken[],
  projectRows: Project[],
): ClientWithProjects[] {
  const projectsByClient = new Map<string, Project[]>();
  for (const project of projectRows) {
    const existing = projectsByClient.get(project.clientId) ?? [];
    existing.push(project);
    projectsByClient.set(project.clientId, existing);
  }

  return clientRows.map((client) => ({
    client,
    projects: projectsByClient.get(client.id) ?? [],
  }));
}

function attachProjectsWithLinearToken(
  clientRows: Client[],
  projectRows: Project[],
): ClientWithLinearTokenAndProjects[] {
  const projectsByClient = new Map<string, Project[]>();
  for (const project of projectRows) {
    const existing = projectsByClient.get(project.clientId) ?? [];
    existing.push(project);
    projectsByClient.set(project.clientId, existing);
  }

  return clientRows.map((client) => ({
    client,
    projects: projectsByClient.get(client.id) ?? [],
  }));
}

export async function listClients(
  options: ClientListOptions = {},
  executor: ClientExecutor = db,
): Promise<ClientWithProjects[]> {
  const clientRows = options.status
    ? await executor
        .select(clientColumnsWithoutLinearToken)
        .from(clients)
        .where(eq(clients.status, options.status))
        .orderBy(asc(clients.name))
    : await executor
        .select(clientColumnsWithoutLinearToken)
        .from(clients)
        .orderBy(asc(clients.name));

  const projectRows = await listProjectsForClients(
    clientRows.map((client) => client.id),
    executor,
  );

  return attachProjects(clientRows, projectRows);
}

export async function findClientById(
  id: string,
  executor: ClientExecutor = db,
): Promise<ClientWithProjects | null> {
  const [client] = await executor
    .select(clientColumnsWithoutLinearToken)
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1);

  if (!client) return null;

  const projectRows = await listProjectsForClients([client.id], executor);
  return { client, projects: projectRows };
}

export async function findClientByIdWithLinearToken(
  id: string,
  executor: ClientExecutor = db,
): Promise<ClientWithLinearTokenAndProjects | null> {
  const [client] = await executor
    .select(clientColumnsWithLinearToken)
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1);

  if (!client) return null;

  const projectRows = await listProjectsForClients([client.id], executor);
  return attachProjectsWithLinearToken([client], projectRows)[0] ?? null;
}

export async function findClientBySlug(
  slug: string,
  executor: ClientExecutor = db,
): Promise<ClientWithProjects | null> {
  const [client] = await executor
    .select(clientColumnsWithoutLinearToken)
    .from(clients)
    .where(eq(clients.slug, slug))
    .limit(1);

  if (!client) return null;

  const projectRows = await listProjectsForClients([client.id], executor);
  return { client, projects: projectRows };
}

export async function createClient(
  input: ClientInput,
  executor: ClientExecutor = db,
): Promise<string> {
  const [row] = await executor
    .insert(clients)
    .values({
      name: input.name,
      slug: input.slug,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      tone: input.tone,
      source: input.source,
      linearTokenEnc: input.linearTokenEnc ?? null,
    })
    .returning({ id: clients.id });

  if (!row) throw new Error("Failed to create client");

  await setProjects(row.id, input.projects ?? [], executor);
  return row.id;
}

export async function updateClient(
  id: string,
  input: Omit<ClientInput, "projects">,
  executor: ClientExecutor = db,
): Promise<void> {
  await executor
    .update(clients)
    .set({
      name: input.name,
      slug: input.slug,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      tone: input.tone,
      source: input.source,
      ...(input.linearTokenEnc !== undefined
        ? { linearTokenEnc: input.linearTokenEnc }
        : {}),
      updatedAt: sql`now()` as unknown as Date,
    })
    .where(eq(clients.id, id));
}

export async function archiveClient(
  id: string,
  executor: ClientExecutor = db,
): Promise<void> {
  await setClientStatus(id, "disabled", executor);
}

export async function setClientStatus(
  id: string,
  status: string,
  executor: ClientExecutor = db,
): Promise<void> {
  await executor
    .update(clients)
    .set({ status, updatedAt: sql`now()` as unknown as Date })
    .where(eq(clients.id, id));
}

export async function deleteClientById(
  id: string,
  executor: ClientExecutor = db,
): Promise<void> {
  await executor.delete(clients).where(eq(clients.id, id));
}

export async function addProject(
  clientId: string,
  input: Omit<ClientProjectInput, "id">,
  position: number,
  executor: ClientExecutor = db,
): Promise<string> {
  const [row] = await executor
    .insert(projects)
    .values({
      clientId,
      name: input.name,
      repos: input.repos,
      linearTeamKey: input.linearTeamKey ?? null,
      linearProjectId: input.linearProjectId ?? null,
      position,
    })
    .returning({ id: projects.id });

  if (!row) throw new Error("Failed to create project");
  return row.id;
}

export async function removeProject(
  clientId: string,
  projectId: string,
  executor: ClientExecutor = db,
): Promise<void> {
  await executor
    .delete(projects)
    .where(and(eq(projects.clientId, clientId), eq(projects.id, projectId)));
}

export async function setProjects(
  clientId: string,
  input: ClientProjectInput[],
  executor: ClientExecutor = db,
): Promise<void> {
  const existing = await executor
    .select()
    .from(projects)
    .where(eq(projects.clientId, clientId));

  const incomingIds = new Set(
    input.map((project) => project.id).filter((id): id is string => !!id),
  );
  const toDelete = existing
    .filter((project) => !incomingIds.has(project.id))
    .map((project) => project.id);

  if (toDelete.length > 0) {
    await executor
      .delete(projects)
      .where(
        and(
          eq(projects.clientId, clientId),
          inArray(projects.id, toDelete),
        ),
      );
  }

  for (let position = 0; position < input.length; position += 1) {
    const project = input[position];

    if (project.id) {
      await executor
        .update(projects)
        .set({
          name: project.name,
          repos: project.repos,
          linearTeamKey: project.linearTeamKey ?? null,
          linearProjectId: project.linearProjectId ?? null,
          position,
        })
        .where(
          and(
            eq(projects.clientId, clientId),
            eq(projects.id, project.id),
          ),
        );
    } else {
      await addProject(
        clientId,
        {
          name: project.name,
          repos: project.repos,
          linearTeamKey: project.linearTeamKey,
          linearProjectId: project.linearProjectId,
        },
        position,
        executor,
      );
    }
  }
}
