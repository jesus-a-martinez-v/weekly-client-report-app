import type { Breadcrumb, BreadcrumbHint, Event, EventHint } from "@sentry/nextjs";

// Keys whose values are scrubbed recursively in Sentry event payloads.
// Covers the DAT-5 spec keys (email, token, secret) plus narrative/email
// fields from the reports table and common PII/auth field names.
const SENSITIVE_KEY_RE =
  /^(email|token|secret|password|authorization|cookie|narrativeMd|narrativeMarkdown|narrative|emailBody|emailSubject|activityJson)$/i;

function scrubValue(val: unknown): unknown {
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(scrubValue);
  const obj = val as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? "[Filtered]" : scrubValue(v);
  }
  return out;
}

export function scrubEvent<T extends Event>(event: T, _hint: EventHint): T | null {
  if (event.extra) event.extra = scrubValue(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = scrubValue(event.contexts) as typeof event.contexts;
  if (event.request) event.request = scrubValue(event.request) as typeof event.request;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      data: b.data ? (scrubValue(b.data) as typeof b.data) : b.data,
    }));
  }
  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb, _hint?: BreadcrumbHint): Breadcrumb | null {
  if (breadcrumb.data) {
    breadcrumb.data = scrubValue(breadcrumb.data) as typeof breadcrumb.data;
  }
  return breadcrumb;
}
