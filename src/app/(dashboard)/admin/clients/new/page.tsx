import { ClientForm } from "@/components/client-form";
import { createClient } from "@/server/actions/clients";

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
        Admin · Clients
      </p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight">New client</h1>
      <p className="mt-3 text-sm text-zinc-600">
        Add a client and at least one project. Repos use{" "}
        <span className="font-mono">Owner/repo</span> form.
      </p>
      <div className="mt-10">
        <ClientForm submit={createClient} submitLabel="Create client" />
      </div>
    </div>
  );
}
