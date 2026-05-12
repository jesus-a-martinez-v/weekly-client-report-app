import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { clients, projects } from "@/db/schema";

import { ClientForm } from "@/components/client-form";
import { DeleteClientDialog } from "@/components/delete-client-dialog";
import { StatusPill } from "@/components/status-pill";
import { ToggleStatusForm } from "../toggle-status-form";
import { updateClient } from "@/server/actions/clients";

export const dynamic = "force-dynamic";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [client] = await db.select().from(clients).where(eq(clients.id, id));
  if (!client) notFound();

  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.clientId, id))
    .orderBy(asc(projects.position));

  const initial = {
    id: client.id,
    name: client.name,
    slug: client.slug,
    contactName: client.contactName,
    contactEmail: client.contactEmail,
    tone: client.tone,
    projects: projectRows.map((p) => ({
      id: p.id,
      name: p.name ?? "",
      repos: p.repos as string[],
    })),
  };

  const bound = updateClient.bind(null, client.id);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
        Admin · Clients
      </p>
      <div className="mt-2 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">{client.name}</h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-zinc-600">
            <span className="font-mono">{client.slug}</span>
            <StatusPill status={client.status} />
          </div>
        </div>
        <div className="text-right">
          <ToggleStatusForm id={client.id} currentStatus={client.status} />
          <p className="mt-1 text-xs text-zinc-400">
            {client.status === "active"
              ? "Included in weekly run"
              : "Skipped on weekly run"}
          </p>
        </div>
      </div>

      <div className="mt-10">
        <ClientForm
          initial={initial}
          submit={bound}
          submitLabel="Save changes"
        />
      </div>

      <section className="mt-16 border-t border-red-100 pt-6">
        <p className="text-xs uppercase tracking-[0.14em] text-red-700">
          Danger zone
        </p>
        <div className="mt-3 flex items-start justify-between gap-6">
          <p className="max-w-md text-sm text-zinc-600">
            Hard-delete removes the client and project rows. Sent reports
            keep their attribution via the snapshot name. Prefer{" "}
            <span className="font-medium">Disable</span> for a temporary stop.
          </p>
          <DeleteClientDialog
            clientId={client.id}
            clientName={client.name}
            clientSlug={client.slug}
          />
        </div>
      </section>
    </div>
  );
}
