/**
 * Port of lib/window.py from the legacy Python project.
 * Returns the prior Mon 00:00 → Sun 23:59:59.999 window in America/Bogota,
 * plus the ISO week label of that Monday.
 *
 * Not wired anywhere in Phase 1 — Phase 2's generateClientReport uses it.
 */
const TZ = "America/Bogota";

export type ReportingWindow = {
  start: Date;
  end: Date;
  weekLabel: string;
};

export function reportingWindow(now: Date = new Date()): ReportingWindow {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const weekday = get("weekday"); // e.g. "Mon"
  const wdMap: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const wd = wdMap[weekday] ?? 0;

  const localTodayUTC = Date.UTC(year, month - 1, day);
  const localThisMon = localTodayUTC - wd * 86_400_000;
  const localLastMon = localThisMon - 7 * 86_400_000;
  const localLastSun = localThisMon - 1;

  const start = bogotaWallClockToUtc(localLastMon, 0, 0, 0, 0);
  const end = bogotaWallClockToUtc(localLastSun, 23, 59, 59, 999);
  const weekLabel = isoWeekLabel(new Date(localLastMon));

  return { start, end, weekLabel };
}

function bogotaWallClockToUtc(
  utcMidnight: number,
  hh: number,
  mm: number,
  ss: number,
  ms: number,
): Date {
  // Bogota is UTC-5 year-round (no DST).
  const dt = new Date(utcMidnight + hh * 3_600_000 + mm * 60_000 + ss * 1000 + ms);
  return new Date(dt.getTime() + 5 * 3_600_000);
}

function isoWeekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
