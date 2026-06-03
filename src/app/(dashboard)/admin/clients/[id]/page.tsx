import { notFound } from "next/navigation";

import { findClientByIdWithLinearToken } from "@/lib/db/repos";

import { ClientForm, type ClientFormInitial } from "@/components/client-form";
import { DeleteClientDialog } from "@/components/delete-client-dialog";
import { StatusPill } from "@/components/status-pill";
import { ToggleStatusForm } from "../toggle-status-form";
import { updateClient } from "@/server/actions/clients";

export const dynamic = "force-dynamic";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const { id } = await params;

  const row = await findClientByIdWithLinearToken(id);
  if (!row) notFound();

  const initial: ClientFormInitial = {
    id: row.client.id,
    source: row.client.source === "linear" ? "linear" : "github",
    name: row.client.name,
    slug: row.client.slug,
    contactName: row.client.contactName,
    contactEmail: row.client.contactEmail,
    tone: row.client.tone,
    hasLinearToken: !!row.client.linearTokenEnc,
    projects: row.projects.map((project) => ({
      id: project.id,
      name: project.name ?? "",
      repos: project.repos,
      linearTeamKey: project.linearTeamKey ?? undefined,
      linearProjectId: project.linearProjectId ?? undefined,
    })),
  };

  const bound = updateClient.bind(null, row.client.id);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
        Admin · Clients
      </p>
      <div className="mt-2 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">
            {row.client.name}
          </h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-zinc-600">
            <span className="font-mono">{row.client.slug}</span>
            <StatusPill status={row.client.status} />
          </div>
        </div>
        <div className="text-right">
          <ToggleStatusForm
            id={row.client.id}
            currentStatus={row.client.status}
          />
          <p className="mt-1 text-xs text-zinc-400">
            {row.client.status === "active"
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
            clientId={row.client.id}
            clientName={row.client.name}
            clientSlug={row.client.slug}
          />
        </div>
      </section>
    </div>
  );
}
