import { signIn } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-12">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            {process.env.APP_DISPLAY_NAME || "Weekly Client Reports"}
          </p>
          <h1 className="mt-2 text-3xl font-medium tracking-tight">
            Weekly client reports
          </h1>
          <p className="mt-3 text-sm text-zinc-600">
            Admin sign-in. One operator, one allowed email.
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/admin/clients" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md border border-zinc-900 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Continue with GitHub
          </button>
        </form>
        <p className="mt-8 text-xs text-zinc-500">
          Sign-in is restricted to{" "}
          <span className="font-mono">{process.env.ADMIN_EMAIL}</span>.
        </p>
      </div>
    </main>
  );
}
