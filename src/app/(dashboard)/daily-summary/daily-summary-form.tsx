"use client";

import { useActionState } from "react";

import {
  generateDailySummaryAction,
  type DailySummaryActionState,
} from "@/server/actions/daily-summary";

type ClientOption = { id: string; name: string; status: string };

type Props = {
  active: ClientOption[];
  disabled: ClientOption[];
  today: string;
};

const INITIAL_STATE: DailySummaryActionState = { status: "idle" };

export function DailySummaryForm({ active, disabled, today }: Props): JSX.Element {
  const [state, formAction, isPending] = useActionState(
    generateDailySummaryAction,
    INITIAL_STATE,
  );

  return (
    <div className="mt-10 space-y-8">
      <form action={formAction} className="space-y-6">
        <div>
          <label
            htmlFor="clientId"
            className="block text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 mb-1.5"
          >
            Client
          </label>
          <select
            id="clientId"
            name="clientId"
            required
            className="w-full rounded-md border hairline bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            <option value="">Select a client…</option>
            {active.length > 0 && (
              <optgroup label="Active">
                {active.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            {disabled.length > 0 && (
              <optgroup label="Disabled">
                {disabled.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div>
          <label
            htmlFor="date"
            className="block text-xs font-medium uppercase tracking-[0.12em] text-zinc-500 mb-1.5"
          >
            Date
          </label>
          <input
            id="date"
            name="date"
            type="date"
            required
            max={today}
            defaultValue={today}
            className="w-full rounded-md border hairline bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="rounded-md border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? "Generating…" : "Generate summary →"}
        </button>
      </form>

      {state.status === "error" && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {state.status === "success" && (
        <div className="space-y-4">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-semibold tabular-nums">
              {state.result.hoursEstimate.toFixed(1)}h
            </span>
            <span className="text-sm text-zinc-500">{state.result.dateLabel}</span>
          </div>

          <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">
            {state.result.summary}
          </p>

          <div className="flex gap-4 text-xs text-zinc-400 pt-1">
            {state.result.totals.commits > 0 && (
              <span>{state.result.totals.commits} commit{state.result.totals.commits !== 1 ? "s" : ""}</span>
            )}
            {state.result.totals.prs > 0 && (
              <span>{state.result.totals.prs} PR{state.result.totals.prs !== 1 ? "s" : ""}</span>
            )}
            {state.result.totals.issues > 0 && (
              <span>{state.result.totals.issues} issue{state.result.totals.issues !== 1 ? "s" : ""}</span>
            )}
            {state.result.totals.comments > 0 && (
              <span>{state.result.totals.comments} comment{state.result.totals.comments !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
