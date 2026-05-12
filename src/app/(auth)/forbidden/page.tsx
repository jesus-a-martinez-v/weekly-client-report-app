import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          403
        </p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">
          That account isn&apos;t on the allow-list.
        </h1>
        <p className="mt-4 text-sm text-zinc-600">
          Sign-in is restricted to a single email. If you think this is wrong,
          poke Admin.
        </p>
        <Link
          href="/signin"
          className="mt-8 inline-block rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100"
        >
          Back to sign-in
        </Link>
      </div>
    </main>
  );
}
