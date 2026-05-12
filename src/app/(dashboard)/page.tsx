import Link from "next/link";

export default function DashboardHome() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
        Phase 1
      </p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight">
        Foundation in place.
      </h1>
      <p className="mt-4 max-w-prose text-sm text-zinc-600">
        The DB, auth, and clients CRUD are live. Reports, runs, and the
        on-demand trigger arrive in Phase 2.
      </p>
      <div className="mt-10">
        <Link
          href="/admin/clients"
          className="inline-flex items-center rounded-md border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Manage clients →
        </Link>
      </div>
    </div>
  );
}
