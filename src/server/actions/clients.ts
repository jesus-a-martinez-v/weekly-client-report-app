"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import type { ClientWithProjects } from "@/lib/db/repos";
import {
  createClient as createClientInService,
  deleteClient as deleteClientInService,
  listClients as listClientsInService,
  toggleClientStatus as toggleClientStatusInService,
  updateClient as updateClientInService,
  type ClientServiceResult,
} from "@/lib/services/clients";
import { clientServiceDeps } from "@/lib/services/client-service-deps";

async function actorEmail(): Promise<string> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Unauthorized");
  return email;
}

function unwrap<T>(result: ClientServiceResult<T>): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

export async function loadClients(): Promise<ClientWithProjects[]> {
  await actorEmail();
  return unwrap(await listClientsInService(clientServiceDeps));
}

export async function createClient(formData: FormData): Promise<void> {
  const email = await actorEmail();
  const newId = unwrap(
    await createClientInService(formData, email, clientServiceDeps),
  );

  revalidatePath("/admin/clients");
  redirect(`/admin/clients/${newId}`);
}

export async function updateClient(
  id: string,
  formData: FormData,
): Promise<void> {
  const email = await actorEmail();
  unwrap(await updateClientInService(id, formData, email, clientServiceDeps));

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
}

export async function toggleClientStatus(id: string): Promise<void> {
  const email = await actorEmail();
  unwrap(await toggleClientStatusInService(id, email, clientServiceDeps));

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
}

export async function deleteClient(
  id: string,
  typedSlug: string,
): Promise<void> {
  const email = await actorEmail();
  unwrap(await deleteClientInService(id, typedSlug, email, clientServiceDeps));

  revalidatePath("/admin/clients");
  redirect("/admin/clients");
}
