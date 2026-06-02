import { tasks } from "@trigger.dev/sdk/v3";
import * as Sentry from "@sentry/node";
import type { Breadcrumb, BreadcrumbHint, ErrorEvent, EventHint } from "@sentry/node";

import { scrubBreadcrumb, scrubEvent } from "@/lib/sentry-scrub";

// scrubEvent is typed against the broad Event type from @sentry/nextjs.
// In @sentry/node v10, beforeSend is narrowed to ErrorEvent (transactions use
// beforeSendTransaction). The scrub logic only touches common Event fields and
// is safe on ErrorEvent — use a double cast to bridge the type gap without
// modifying the DAT-5 shared helper.
const beforeSend = scrubEvent as unknown as (
  event: ErrorEvent,
  hint: EventHint,
) => ErrorEvent | null;
const beforeBreadcrumb = scrubBreadcrumb as (
  breadcrumb: Breadcrumb,
  hint?: BreadcrumbHint,
) => Breadcrumb | null;

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Disable Sentry's default integrations: the console integration would swallow
  // Trigger.dev run logs, and the Node HTTP integration would double-instrument
  // the worker process alongside the Next.js app's own Sentry setup.
  defaultIntegrations: false,
  tracesSampleRate: 1,
  debug: false,
  beforeSend,
  beforeBreadcrumb,
});

// Global failure hook — fires once per task run that exhausts all retries.
// Tags each Sentry event with the task id and the Trigger.dev run id so events
// can be filtered in Sentry without grepping Trigger.dev run logs.
tasks.onFailure(({ payload, error, ctx }) => {
  Sentry.captureException(error, {
    tags: {
      task_id: ctx.task.id,
      trigger_run_id: ctx.run.id,
    },
    extra: { payload, ctx }, // sensitive fields scrubbed by beforeSend
  });
});
