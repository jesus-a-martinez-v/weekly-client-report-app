"use client";

import { useState } from "react";
import { marked } from "marked";
import { updateReportNarrative, rewriteReportNarrative } from "@/server/actions/reports";

export function NarrativeEditor({
  reportId,
  initialNarrative,
}: {
  reportId: string;
  initialNarrative: string;
}) {
  const [value, setValue] = useState(initialNarrative);
  const [pending, setPending] = useState(false);
  const [aiPending, setAiPending] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const previewHtml = marked.parse(value, { async: false }) as string;

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("narrativeMd", value);
    try {
      await updateReportNarrative(reportId, fd);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setPending(false);
    }
  }

  async function handleAiRevise(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAiPending(true);
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("instructions", instructions);
    try {
      await rewriteReportNarrative(reportId, fd);
      setInstructions("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI revision failed");
    } finally {
      setAiPending(false);
    }
  }

  const isWorking = pending || aiPending;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <textarea
          value={value}
          onChange={(e) => { setValue(e.target.value); setSaved(false); }}
          rows={20}
          className="w-full rounded-md border hairline bg-white px-3 py-2 text-sm text-zinc-900 font-mono focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-y"
          disabled={isWorking}
        />
        <div
          className="prose prose-sm max-w-none rounded-md border hairline bg-zinc-50 px-4 py-3 overflow-auto"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <form onSubmit={handleSave} className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isWorking}
          className="rounded-md border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save & regenerate PDF"}
        </button>
        {saved && (
          <span className="text-sm text-emerald-600">
            Saved. PDF re-renders in the background — refresh in ~30 s.
          </span>
        )}
      </form>

      <div className="border-t hairline pt-4 space-y-2">
        <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Ask AI to revise</p>
        <form onSubmit={handleAiRevise} className="space-y-2">
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
            placeholder="Describe the changes you'd like…"
            disabled={isWorking}
            className="w-full rounded-md border hairline bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-y"
          />
          <button
            type="submit"
            disabled={isWorking || !instructions.trim()}
            className="rounded-md border border-zinc-700 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            {aiPending ? "Revising…" : "Ask AI"}
          </button>
        </form>
      </div>
    </div>
  );
}
