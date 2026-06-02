"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { parseClientForm } from "@/lib/shared/validation/client";

import { db } from "@/lib/db/client";
import {
  createClient as createClientRecord,
  deleteClientById,
  findClientById,
  recordAuditEntry,
  setClientStatus,
  setProjects,
  updateClient as updateClientRecord,
} from "@/lib/db/repos";

async function actorEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Unauthorized");
  return email;
}

export async function createClient(formData: FormData): Promise<void> {
  const input = parseClientForm(formData);
  const email = await actorEmail();

  const newId = await db.transaction(async (tx) => {
    const clientId = await createClientRecord(
      {
        name: input.name,
        slug: input.slug,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        tone: input.tone,
        projects: input.projects,
      },
      tx,
    );

    await recordAuditEntry({
      actorEmail: email,
      action: "client.create",
      entityType: "client",
      entityId: clientId,
      payload: { slug: input.slug, projectCount: input.projects.length },
      tx,
    });

    return clientId;
  });

  revalidatePath("/admin/clients");
  redirect(`/admin/clients/${newId}`);
}

export async function updateClient(
  id: string,
  formData: FormData,
): Promise<void> {
  const input = parseClientForm(formData);
  const email = await actorEmail();

  await db.transaction(async (tx) => {
    const before = await findClientById(id, tx);
    if (!before) throw new Error("Client not found");

    await updateClientRecord(
      id,
      {
        name: input.name,
        slug: input.slug,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        tone: input.tone,
      },
      tx,
    );
    await setProjects(id, input.projects, tx);

    await recordAuditEntry({
      actorEmail: email,
      action: "client.update",
      entityType: "client",
      entityId: id,
      payload: { slug: input.slug, projectCount: input.projects.length },
      tx,
    });
  });

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
}

export async function toggleClientStatus(id: string): Promise<void> {
  const email = await actorEmail();
  await db.transaction(async (tx) => {
    const row = await findClientById(id, tx);
    if (!row) throw new Error("Client not found");
    const next = row.client.status === "active" ? "disabled" : "active";
    await setClientStatus(id, next, tx);
    await recordAuditEntry({
      actorEmail: email,
      action: "client.toggle",
      entityType: "client",
      entityId: id,
      payload: { from: row.client.status, to: next },
      tx,
    });
  });

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
}

export async function deleteClient(
  id: string,
  typedSlug: string,
): Promise<void> {
  const email = await actorEmail();
  const snapshot = await findClientById(id);
  if (!snapshot) throw new Error("Client not found");
  if (snapshot.client.slug !== typedSlug) {
    throw new Error("Slug confirmation does not match");
  }

  await db.transaction(async (tx) => {
    await deleteClientById(id, tx);
    await recordAuditEntry({
      actorEmail: email,
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

  revalidatePath("/admin/clients");
  redirect("/admin/clients");
}
