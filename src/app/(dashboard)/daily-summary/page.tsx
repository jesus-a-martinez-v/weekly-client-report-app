import Link from "next/link";

import { bogotaDateISO } from "@/lib/shared/window";
import { loadClients } from "@/server/actions/clients";
import { DailySummaryForm } from "./daily-summary-form";

export const dynamic = "force-dynamic";

export default async function DailySummaryPage(): Promise<JSX.Element> {
  const allClients = (await loadClients()).map(({ client }) => ({
    id: client.id,
    name: client.name,
    status: client.status,
  }));

  const active = allClients.filter((c) => c.status === "active");
  const disabled = allClients.filter((c) => c.status !== "active");

  const today = bogotaDateISO(new Date());

  return (
    <div className="mx-auto max-w-lg">
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">On-demand</p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight">Daily summary</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Generate a short summary of one day&apos;s activity for any client.
      </p>

      {allClients.length === 0 ? (
        <p className="mt-10 text-sm text-zinc-500">
          No clients configured yet. Add one in{" "}
          <Link href="/admin/clients" className="underline hover:text-zinc-900">
            Admin → Clients
          </Link>
          .
        </p>
      ) : (
        <DailySummaryForm
          active={active}
          disabled={disabled}
          today={today}
        />
      )}
    </div>
  );
}
