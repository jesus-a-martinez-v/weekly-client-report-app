import Link from "next/link";

export default function DashboardHome() {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
        Weekly Client Reports
      </p>
      <h1 className="mt-2 text-3xl font-medium tracking-tight">
        What would you like to do?
      </h1>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        <Link
          href="/reports"
          className="rounded-md border hairline bg-white px-5 py-4 hover:border-zinc-400"
        >
          <p className="font-medium">Reports</p>
          <p className="mt-1 text-sm text-zinc-500">
            View, edit, send, or discard drafted reports.
          </p>
        </Link>
        <Link
          href="/runs"
          className="rounded-md border hairline bg-white px-5 py-4 hover:border-zinc-400"
        >
          <p className="font-medium">Runs</p>
          <p className="mt-1 text-sm text-zinc-500">
            Track weekly and on-demand job history.
          </p>
        </Link>
        <Link
          href="/on-demand"
          className="rounded-md border hairline bg-white px-5 py-4 hover:border-zinc-400"
        >
          <p className="font-medium">On-demand</p>
          <p className="mt-1 text-sm text-zinc-500">
            Trigger a report for one client right now.
          </p>
        </Link>
      </div>
      <div className="mt-8">
        <Link
          href="/admin/clients"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          Manage clients →
        </Link>
      </div>
    </div>
  );
}
