import { asc, eq } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import { clients } from "@/db/schema";
import { reportingWindow } from "@/lib/window";
import { triggerOnDemandReport } from "@/server/actions/reports";

export const dynamic = "force-dynamic";

export default async function OnDemandPage() {
  const allClients = await db
    .select({ id: clients.id, name: clients.name, status: clients.status })
    .from(clients)
    .orderBy(asc(clients.name));

  const active = allClients.filter((c) => c.status === "active");
  const disabled = allClients.filter((c) => c.status !== "active");

  const currentWeek = reportingWindow().weekLabel;

  return (
    <div className="mx-auto max-w-lg">
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">On-demand</p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight">Trigger a report</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Generate a report for one client outside the weekly schedule.
      </p>

      <form action={triggerOnDemandReport} className="mt-10 space-y-6">
        <div>
          <label
            htmlFor="clientId"
            className="block text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 mb-1.5"
          >
            Client
          </label>
          <select
            id="clientId"
            name="clientId"
            required
            className="w-full rounded-md border hairline bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">Select a client…</option>
            {active.length > 0 && (
              <optgroup label="Active">
                {active.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            {disabled.length > 0 && (
              <optgroup label="Disabled">
                {disabled.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div>
          <label
            htmlFor="weekLabel"
            className="block text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 mb-1.5"
          >
            Week{" "}
            <span className="normal-case tracking-normal text-zinc-400">
              (optional — defaults to last week)
            </span>
          </label>
          <input
            id="weekLabel"
            name="weekLabel"
            type="text"
            placeholder={currentWeek}
            pattern="^\d{4}-W\d{2}$"
            className="w-full rounded-md border hairline bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono placeholder-zinc-400"
          />
          <p className="mt-1.5 text-xs text-zinc-400">Format: YYYY-Www, e.g. {currentWeek}</p>
        </div>

        {allClients.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No clients configured yet. Add one in{" "}
            <Link href="/admin/clients" className="underline hover:text-zinc-900">
              Admin → Clients
            </Link>
            .
          </p>
        ) : (
          <button
            type="submit"
            className="rounded-md border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Generate report →
          </button>
        )}
      </form>
    </div>
  );
}
