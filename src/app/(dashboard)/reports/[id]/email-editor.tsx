"use client";

import { useState } from "react";
import { updateReportEmail } from "@/server/actions/reports";

export function EmailEditor({
  reportId,
  initialSubject,
  initialBody,
}: {
  reportId: string;
  initialSubject: string;
  initialBody: string;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("subject", subject);
    fd.set("body", body);
    try {
      await updateReportEmail(reportId, fd);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 mb-1">
          Subject
        </label>
        <input
          name="subject"
          type="text"
          value={subject}
          onChange={(e) => { setSubject(e.target.value); setSaved(false); }}
          className="w-full rounded-md border hairline bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          maxLength={240}
          required
        />
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 mb-1">
          Body
        </label>
        <textarea
          name="body"
          value={body}
          onChange={(e) => { setBody(e.target.value); setSaved(false); }}
          rows={10}
          className="w-full rounded-md border hairline bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 font-mono"
          maxLength={32768}
          required
        />
      </div>
      {error && (
        <p className="text-sm text-rose-600">{error}</p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {saved && (
          <span className="text-sm text-emerald-600">Draft updated.</span>
        )}
      </div>
    </form>
  );
}
