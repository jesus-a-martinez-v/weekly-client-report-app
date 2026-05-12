import { SCHEDULE_DEFS, SCHEDULE_KINDS } from "@/lib/schedules";
import {
  loadScheduleRows,
  loadUnmanagedSchedules,
  deleteUnmanagedSchedule,
} from "@/server/actions/schedules";
import { ScheduleCard } from "./schedule-card";

export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  const [rows, unmanaged] = await Promise.all([
    loadScheduleRows(),
    loadUnmanagedSchedules().catch(() => [] as Awaited<ReturnType<typeof loadUnmanagedSchedules>>),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-medium tracking-tight">Schedules</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Manage the recurring tasks that generate and remind about client reports.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {SCHEDULE_KINDS.map((kind) => {
          const def = SCHEDULE_DEFS[kind];
          return (
            <ScheduleCard
              key={kind}
              kind={kind}
              label={def.label}
              description={def.description}
              defaultCron={def.defaultCron}
              defaultTimezone={def.defaultTimezone}
              row={rows[kind]}
            />
          );
        })}
      </div>

      {unmanaged.length > 0 && (
        <section className="mt-10">
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500 mb-3">
            Unmanaged schedules
          </p>
          <p className="mb-4 text-sm text-zinc-500">
            These schedules exist in Trigger.dev but are not tracked by this
            app. Delete them to avoid duplicate runs.
          </p>
          <div className="space-y-2">
            {unmanaged.map((s) => (
              <div
                key={s.triggerScheduleId}
                className="flex items-center justify-between rounded-md border hairline bg-white px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-mono text-zinc-700">{s.cron}</span>
                  <span className="ml-2 text-zinc-400">
                    {s.timezone} · {s.taskId}
                  </span>
                </div>
                <form
                  action={deleteUnmanagedSchedule.bind(
                    null,
                    s.triggerScheduleId,
                  )}
                >
                  <button
                    type="submit"
                    className="text-xs text-zinc-400 hover:text-rose-600"
                  >
                    Delete
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
