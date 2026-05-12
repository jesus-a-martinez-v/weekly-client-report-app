"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({
  active,
  intervalMs = 3000,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);

  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
      Refreshing…
    </span>
  );
}
