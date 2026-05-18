"use client";

import { useTransition } from "react";

export function DeleteRowButton({
  action,
  confirmMessage,
  label = "Delete",
  className,
}: {
  action: () => Promise<void>;
  confirmMessage: string;
  label?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm(confirmMessage)) return;
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        window.alert(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={
        className ??
        "text-xs text-zinc-400 hover:text-rose-600 disabled:opacity-50"
      }
    >
      {pending ? "Deleting…" : label}
    </button>
  );
}
