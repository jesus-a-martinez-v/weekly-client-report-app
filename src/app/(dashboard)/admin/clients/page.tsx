import { asc } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import { clients, projects } from "@/db/schema";

import { StatusPill } from "@/components/status-pill";
import { ToggleStatusForm } from "./toggle-status-form";

export const dynamic = "force-dynamic";

export default async function ClientsListPage() {
  const all = await db.select().from(clients).orderBy(asc(clients.name));
  const allProjects = await db
    .select()
    .from(projects)
    .orderBy(asc(projects.position));

  const projectsByClient = new Map<string, typeof allProjects>();
  for (const p of allProjects) {
    const arr = projectsByClient.get(p.clientId) ?? [];
    arr.push(p);
    projectsByClient.set(p.clientId, arr);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">Clients</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {all.length} client{all.length === 1 ? "" : "s"} configured.
            Disabled clients are skipped on the weekly run.
          </p>
        </div>
        <Link
          href="/admin/clients/new"
          className="rounded-md border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          + New client
        </Link>
      </div>

      {all.length === 0 ? (
        <div className="rounded-md border hairline bg-white p-8 text-center text-sm text-zinc-500">
          No clients yet. Run{" "}
          <span className="font-mono">npm run db:seed</span> or click{" "}
          <span className="font-medium">New client</span>.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border hairline bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b hairline text-xs uppercase tracking-[0.12em] text-zinc-500">
                <th className="px-5 py-3 text-left font-medium">Client</th>
                <th className="px-5 py-3 text-left font-medium">Slug</th>
                <th className="px-5 py-3 text-left font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Projects</th>
                <th className="px-5 py-3 text-right font-medium">Repos</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {all.map((c) => {
                const ps = projectsByClient.get(c.id) ?? [];
                const repoCount = ps.reduce(
                  (n, p) => n + (p.repos?.length ?? 0),
                  0,
                );
                return (
                  <tr key={c.id} className="border-b hairline last:border-b-0">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/clients/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      <p className="text-xs text-zinc-500">{c.contactEmail}</p>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-zinc-600">
                      {c.slug}
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={c.status} />
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {ps.length}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {repoCount}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <ToggleStatusForm
                          id={c.id}
                          currentStatus={c.status}
                        />
                        <Link
                          href={`/admin/clients/${c.id}`}
                          className="text-xs text-zinc-500 hover:text-zinc-900"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
