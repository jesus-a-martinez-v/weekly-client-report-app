const ACTION_LABELS: Record<string, string> = {
  "report.drafted": "Drafted",
  "report.quiet": "Quiet (no activity)",
  "report.edited": "Email edited",
  "report.sent": "Sent",
  "report.discarded": "Discarded",
  "report.failed": "Failed",
  "report.reminded": "Reminded",
  "schedule.created": "Schedule created",
  "schedule.updated": "Schedule updated",
  "schedule.activated": "Schedule activated",
  "schedule.deactivated": "Schedule deactivated",
};

export function formatAuditAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function summarizeAuditPayload(
  action: string,
  payload: Record<string, unknown>,
): string {
  switch (action) {
    case "report.drafted": {
      const t = payload.totals as
        | { prs: number; issues: number; commits: number }
        | undefined;
      if (t) return `${t.prs} PRs · ${t.issues} issues · ${t.commits} commits`;
      return "";
    }
    case "report.quiet":
      return "No repository activity this week";
    case "report.edited": {
      const old = payload.oldDraftId;
      const next = payload.newDraftId;
      if (old && next) return `draft updated`;
      return "";
    }
    case "report.sent":
    case "report.discarded":
      return "";
    case "report.failed": {
      const err = typeof payload.error === "string" ? payload.error : "";
      return err.slice(0, 120);
    }
    case "report.reminded": {
      const h = payload.hoursOld;
      return typeof h === "number" ? `${h}h old at reminder time` : "";
    }
    case "schedule.created":
    case "schedule.updated": {
      const after = payload.after as
        | { cron?: string; timezone?: string }
        | undefined;
      if (after?.cron) return `${after.cron} (${after.timezone ?? "UTC"})`;
      return "";
    }
    default:
      return "";
  }
}

export type AuditCategory = "system" | "operator" | "failure";

const SYSTEM_ACTIONS = new Set([
  "report.drafted",
  "report.quiet",
  "report.reminded",
  "report.failed",
  "run.completed",
]);

const FAILURE_ACTIONS = new Set(["report.failed"]);

export function auditCategory(action: string): AuditCategory {
  if (FAILURE_ACTIONS.has(action)) return "failure";
  if (SYSTEM_ACTIONS.has(action)) return "system";
  return "operator";
}
