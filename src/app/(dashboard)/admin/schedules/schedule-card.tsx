"use client";

import * as Sentry from "@sentry/nextjs";
import { useState, useTransition } from "react";
import { StatusPill } from "@/components/status-pill";
import { upsertSchedule, deleteSchedule } from "@/server/actions/schedules";
import { CURATED_TIMEZONES, type ScheduleKind } from "@/lib/shared/schedules";
import type { ScheduleRow } from "@/lib/db/repos";

const DAYS = [
  { value: "*", label: "Every day" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "0", label: "Sunday" },
];

const HOURS = Array.from({ length: 24 }, (_, h) => {
  const label =
    h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
  return { value: String(h), label };
});

const MINUTES = Array.from({ length: 12 }, (_, i) => {
  const m = i * 5;
  return { value: String(m), label: String(m).padStart(2, "0") };
});

function parseCron(cron: string): { day: string; hour: string; minute: string } | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hr, dom, mon, dow] = parts;
  if (dom !== "*" || mon !== "*") return null;
  if (!/^\d+$/.test(min) || !/^\d+$/.test(hr)) return null;
  if (dow !== "*" && !/^\d+$/.test(dow)) return null;
  return { day: dow, hour: hr, minute: min };
}

function buildCron(day: string, hour: string, minute: string): string {
  return `${minute} ${hour} * * ${day}`;
}

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
  } catch (err) {
    Sentry.captureException(err, {
      tags: {
        area: "schedules",
        operation: "format-next-run",
        reason: "format-fallback",
      },
      extra: { timezone },
    });
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
  const initialCron = row?.cron ?? defaultCron;
  const parsed = parseCron(initialCron);

  const [day, setDay] = useState(parsed?.day ?? "1");
  const [hour, setHour] = useState(parsed?.hour ?? "9");
  const [minute, setMinute] = useState(parsed?.minute ?? "0");
  const [timezone, setTimezone] = useState(row?.timezone ?? defaultTimezone);
  const [active, setActive] = useState(row?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isNewSchedule = !row;
  const currentStatus = isNewSchedule ? "inactive" : active ? "active" : "inactive";
  const cron = buildCron(day, hour, minute);

  const dayLabel = DAYS.find((d) => d.value === day)?.label ?? day;
  const hourLabel = HOURS.find((h) => h.value === hour)?.label ?? `${hour}:00`;
  const minuteLabel = String(minute).padStart(2, "0");

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

  const selectCls =
    "rounded-md border hairline bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900";

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
            Runs
          </label>
          <div className="flex flex-wrap gap-2">
            <select value={day} onChange={(e) => setDay(e.target.value)} className={selectCls}>
              {DAYS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
            <span className="flex items-center text-sm text-zinc-500">at</span>
            <select value={hour} onChange={(e) => setHour(e.target.value)} className={selectCls}>
              {HOURS.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
            <select value={minute} onChange={(e) => setMinute(e.target.value)} className={selectCls}>
              {MINUTES.map((m) => (
                <option key={m.value} value={m.value}>:{m.label}</option>
              ))}
            </select>
          </div>
          <p className="mt-1.5 text-xs text-zinc-400 font-mono">
            {dayLabel} at {hourLabel}:{minuteLabel} → <span className="text-zinc-500">{cron}</span>
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
            className={`w-full ${selectCls}`}
          >
            {CURATED_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
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
          <label htmlFor={`active-${kind}`} className="text-sm text-zinc-700 select-none">
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
