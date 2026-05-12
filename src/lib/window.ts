/**
 * Port of lib/window.py from the legacy Python project.
 * Returns the prior Mon 00:00 → Sun 23:59:59.999 window in America/Bogota,
 * plus the ISO week label of that Monday.
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
  const weekday = get("weekday");
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

const WEEK_LABEL_RE = /^(\d{4})-W(\d{2})$/;

export function isoWeekToWindow(weekLabel: string): ReportingWindow {
  const m = WEEK_LABEL_RE.exec(weekLabel);
  if (!m) throw new Error(`Invalid week label: ${weekLabel} (expected YYYY-Www)`);
  const year = Number(m[1]);
  const week = Number(m[2]);

  // ISO 8601: week 1 is the week containing Jan 4. Find that week's Monday.
  const jan4UTC = Date.UTC(year, 0, 4);
  const jan4Dow = new Date(jan4UTC).getUTCDay() || 7;
  const week1MondayUTC = jan4UTC - (jan4Dow - 1) * 86_400_000;
  const localMondayUTC = week1MondayUTC + (week - 1) * 7 * 86_400_000;
  const localSundayUTC = localMondayUTC + 6 * 86_400_000;

  const start = bogotaWallClockToUtc(localMondayUTC, 0, 0, 0, 0);
  const end = bogotaWallClockToUtc(localSundayUTC, 23, 59, 59, 999);
  return { start, end, weekLabel };
}

export function formatRange(start: Date, end: Date): string {
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...opts }).format(d);
  const sMonth = fmt(start, { month: "short" });
  const sDay = fmt(start, { day: "numeric" });
  const sYear = fmt(start, { year: "numeric" });
  const eMonth = fmt(end, { month: "short" });
  const eDay = fmt(end, { day: "numeric" });
  const eYear = fmt(end, { year: "numeric" });
  if (sYear === eYear && sMonth === eMonth) {
    return `${sMonth} ${sDay} – ${eDay}, ${sYear}`;
  }
  if (sYear === eYear) {
    return `${sMonth} ${sDay} – ${eMonth} ${eDay}, ${sYear}`;
  }
  return `${sMonth} ${sDay}, ${sYear} – ${eMonth} ${eDay}, ${eYear}`;
}

export function reportFilename(clientName: string, startDateISO: string): string {
  const safe = clientName
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "");
  return `${safe}_${startDateISO}_report.pdf`;
}

export function bogotaDateISO(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
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
