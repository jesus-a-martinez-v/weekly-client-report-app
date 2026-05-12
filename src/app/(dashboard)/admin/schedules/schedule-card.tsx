"use client";

import { useState, useTransition } from "react";
import { StatusPill } from "@/components/status-pill";
import { upsertSchedule, deleteSchedule } from "@/server/actions/schedules";
import { CURATED_TIMEZONES, type ScheduleKind } from "@/lib/schedules";
import type { ScheduleRow } from "@/server/actions/schedules";

function formatNextRun(date: Date | null, timezone: string): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function ScheduleCard({
  kind,
  label,
  description,
  defaultCron,
  defaultTimezone,
  row,
}: {
  kind: ScheduleKind;
  label: string;
  description: string;
  defaultCron: string;
  defaultTimezone: string;
  row: ScheduleRow | undefined;
}) {
  const [cron, setCron] = useState(row?.cron ?? defaultCron);
  const [timezone, setTimezone] = useState(row?.timezone ?? defaultTimezone);
  const [active, setActive] = useState(row?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isNewSchedule = !row;
  const currentStatus = isNewSchedule ? "inactive" : active ? "active" : "inactive";

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("cron", cron);
    fd.set("timezone", timezone);
    fd.set("active", String(active));
    startTransition(async () => {
      try {
        await upsertSchedule(kind, fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save schedule");
      }
    });
  }

  function handleDelete() {
    if (!window.confirm("Delete this schedule? It will stop firing until recreated."))
      return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteSchedule(kind);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete schedule");
      }
    });
  }

  return (
    <div className="rounded-md border hairline bg-white p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="font-medium text-zinc-900">{label}</p>
          <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
        </div>
        <StatusPill status={currentStatus} />
      </div>

      {isNewSchedule && (
        <p className="mb-4 text-xs text-zinc-400 italic">
          Not scheduled yet — save to enable.
        </p>
      )}

      {!isNewSchedule && row.nextRun && (
        <p className="mb-4 text-xs text-zinc-500">
          Next run:{" "}
          <span className="font-medium text-zinc-700">
            {formatNextRun(row.nextRun, row.timezone)}
          </span>
        </p>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 mb-1.5">
            Cron expression
          </label>
          <input
            name="cron"
            type="text"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            placeholder="0 9 * * 1"
            pattern="^\S+(\s+\S+){4}$"
            required
            className="w-full rounded-md border hairline bg-white px-3 py-2 text-sm font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
          <p className="mt-1 text-xs text-zinc-400">
            5 fields: minute hour day month weekday
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 mb-1.5">
            Timezone
          </label>
          <select
            name="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded-md border hairline bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            {CURATED_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            id={`active-${kind}`}
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
          />
          <label
            htmlFor={`active-${kind}`}
            className="text-sm text-zinc-700 select-none"
          >
            Active
          </label>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save"}
          </button>

          {!isNewSchedule && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="text-xs text-zinc-400 hover:text-rose-600 disabled:opacity-50"
            >
              Delete schedule
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
