"use client";

import { useState, useTransition } from "react";

import { deleteClient } from "@/server/actions/clients";

export function DeleteClientDialog({
  clientId,
  clientName,
  clientSlug,
}: {
  clientId: string;
  clientName: string;
  clientSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setTyped("");
    setError(null);
  }

  function onConfirm() {
    setError(null);
    if (typed !== clientSlug) return;
    startTransition(async () => {
      try {
        await deleteClient(clientId, typed);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
      >
        Delete permanently…
      </button>

      {open && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-lg border hairline bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs uppercase tracking-[0.14em] text-red-700">
              Danger zone
            </p>
            <h2 className="mt-2 text-lg font-medium">
              Delete {clientName}?
            </h2>
            <p className="mt-3 text-sm text-zinc-600">
              Type{" "}
              <span className="font-mono font-medium">{clientSlug}</span> to
              confirm. Project records will be removed; previously sent
              reports remain attributed to{" "}
              <span className="italic">(deleted) {clientName}</span>.
            </p>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-4 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono focus:border-zinc-500 focus:outline-none"
              placeholder={clientSlug}
            />
            {error && (
              <p className="mt-3 text-sm text-red-700">{error}</p>
            )}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={close}
                className="text-sm text-zinc-500 hover:text-zinc-900"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={typed !== clientSlug || pending}
                onClick={onConfirm}
                className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {pending ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
