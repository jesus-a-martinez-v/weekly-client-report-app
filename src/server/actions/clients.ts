"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { parseClientForm, type ProjectInput } from "@/lib/validation/client";

import { db } from "@/db";
import { auditLog, clients, projects } from "@/db/schema";

async function actorEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Unauthorized");
  return email;
}

async function loadClientSnapshot(id: string) {
  const [client] = await db.select().from(clients).where(eq(clients.id, id));
  if (!client) return null;
  const proj = await db
    .select()
    .from(projects)
    .where(eq(projects.clientId, id))
    .orderBy(asc(projects.position));
  return { client, projects: proj };
}

export async function createClient(formData: FormData) {
  const input = parseClientForm(formData);
  const email = await actorEmail();

  const newId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(clients)
      .values({
        name: input.name,
        slug: input.slug,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        tone: input.tone,
      })
      .returning({ id: clients.id });

    if (input.projects.length > 0) {
      await tx.insert(projects).values(
        input.projects.map((p: ProjectInput, i: number) => ({
          clientId: row.id,
          name: p.name ?? null,
          repos: p.repos,
          position: i,
        })),
      );
    }

    await tx.insert(auditLog).values({
      actorEmail: email,
      action: "client.create",
      entityType: "client",
      entityId: row.id,
      payload: { slug: input.slug, projectCount: input.projects.length },
    });

    return row.id;
  });

  revalidatePath("/admin/clients");
  redirect(`/admin/clients/${newId}`);
}

export async function updateClient(id: string, formData: FormData) {
  const input = parseClientForm(formData);
  const email = await actorEmail();

  await db.transaction(async (tx) => {
    const before = await tx.select().from(clients).where(eq(clients.id, id));
    if (before.length === 0) throw new Error("Client not found");

    await tx
      .update(clients)
      .set({
        name: input.name,
        slug: input.slug,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        tone: input.tone,
        updatedAt: sql`now()`,
      })
      .where(eq(clients.id, id));

    const existing = await tx
      .select()
      .from(projects)
      .where(eq(projects.clientId, id));

    const incomingIds = new Set(
      input.projects.map((p) => p.id).filter((v): v is string => !!v),
    );
    const toDelete = existing
      .filter((p) => !incomingIds.has(p.id))
      .map((p) => p.id);

    if (toDelete.length > 0) {
      await tx
        .delete(projects)
        .where(
          and(
            eq(projects.clientId, id),
            sql`${projects.id} = ANY(${toDelete}::uuid[])`,
          ),
        );
    }

    for (let i = 0; i < input.projects.length; i++) {
      const p = input.projects[i];
      if (p.id) {
        await tx
          .update(projects)
          .set({ name: p.name ?? null, repos: p.repos, position: i })
          .where(eq(projects.id, p.id));
      } else {
        await tx
          .insert(projects)
          .values({
            clientId: id,
            name: p.name ?? null,
            repos: p.repos,
            position: i,
          });
      }
    }

    await tx.insert(auditLog).values({
      actorEmail: email,
      action: "client.update",
      entityType: "client",
      entityId: id,
      payload: { slug: input.slug, projectCount: input.projects.length },
    });
  });

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
}

export async function toggleClientStatus(id: string) {
  const email = await actorEmail();
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ status: clients.status })
      .from(clients)
      .where(eq(clients.id, id));
    if (!row) throw new Error("Client not found");
    const next = row.status === "active" ? "disabled" : "active";
    await tx
      .update(clients)
      .set({ status: next, updatedAt: sql`now()` })
      .where(eq(clients.id, id));
    await tx.insert(auditLog).values({
      actorEmail: email,
      action: "client.toggle",
      entityType: "client",
      entityId: id,
      payload: { from: row.status, to: next },
    });
  });

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
}

export async function deleteClient(id: string, typedSlug: string) {
  const email = await actorEmail();
  const snapshot = await loadClientSnapshot(id);
  if (!snapshot) throw new Error("Client not found");
  if (snapshot.client.slug !== typedSlug) {
    throw new Error("Slug confirmation does not match");
  }

  await db.transaction(async (tx) => {
    await tx.delete(clients).where(eq(clients.id, id));
    await tx.insert(auditLog).values({
      actorEmail: email,
      action: "client.delete",
      entityType: "client",
      entityId: null,
      payload: {
        client: snapshot.client,
        projects: snapshot.projects,
      },
    });
  });

  revalidatePath("/admin/clients");
  redirect("/admin/clients");
}
