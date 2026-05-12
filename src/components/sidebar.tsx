import Link from "next/link";

const sections = [
  {
    label: "Reports",
    href: "/reports",
    items: [{ label: "All reports", href: "/reports", disabled: false }],
  },
  {
    label: "Runs",
    href: "/runs",
    items: [{ label: "All runs", href: "/runs", disabled: false }],
  },
  {
    label: "On-demand",
    href: "/on-demand",
    items: [{ label: "Trigger now", href: "/on-demand", disabled: false }],
  },
  {
    label: "Admin",
    href: "/admin",
    items: [
      { label: "Clients", href: "/admin/clients", disabled: false },
      { label: "Schedule", href: "/admin/schedule", disabled: true },
    ],
  },
];

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r hairline px-6 py-10">
      <Link href="/admin/clients" className="block">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
          Weekly
        </p>
        <p className="font-medium tracking-tight">Client reports</p>
      </Link>
      <nav className="mt-10 space-y-7">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">
              {section.label}
            </p>
            <ul className="mt-2 space-y-1">
              {section.items.map((item) => (
                <li key={item.href}>
                  {item.disabled ? (
                    <span className="block py-1 text-sm text-zinc-300">
                      {item.label}
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      className="block py-1 text-sm text-zinc-700 hover:text-zinc-900"
                    >
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
