import { redirect } from "next/navigation";

import { auth, signOut } from "@/lib/auth";

import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/signin");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b hairline px-8">
          <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            {process.env.APP_DISPLAY_NAME || "Weekly Client Reports"} · Admin
          </div>
          <div className="flex items-center gap-4 text-sm text-zinc-600">
            <span className="font-mono">{session.user.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/signin" });
              }}
            >
              <button className="text-zinc-500 hover:text-zinc-900">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 px-8 py-10">{children}</main>
      </div>
    </div>
  );
}
