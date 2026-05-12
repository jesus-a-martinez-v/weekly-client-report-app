# Weekly Client Reports - Roadmap

## Context

Weekly Client Reports is a private-operations admin app that turns repository
activity into client-ready weekly status reports. The app provides a durable
review surface, report history, on-demand runs, editable schedules, and audited
send/discard actions.

The public repository intentionally uses generic names and placeholders. Private
client data, production prompts, infrastructure details, real URLs, and account
identifiers live outside git.

## Architecture

| Area | Design |
|---|---|
| Webapp | Next.js App Router with TypeScript and Tailwind |
| Authentication | GitHub OAuth with a single allowed admin email |
| Database | Postgres with Drizzle schema and migrations |
| Jobs | Trigger.dev tasks for scheduled and on-demand report generation |
| Repository data | Octokit REST calls over configured `owner/repo` values |
| Narrative | OpenRouter model call using a private prompt supplied at runtime |
| PDF | Puppeteer renders a self-contained HTML template |
| Storage | Blob storage for generated PDFs |
| Email | External webhook handles draft, send, and discard actions |
| Notifications | Telegram Bot API sends review links |

## Data Model

- `clients`: name, slug, contact, tone, status, timestamps.
- `projects`: client-owned groups of repositories.
- `runs`: weekly or on-demand job attempts with status and timing.
- `reports`: per-client report output, totals, narrative, email copy, PDF metadata,
  email draft id, and lifecycle status.
- `schedules`: local mirror of external schedules for fast rendering.
- `audit_log`: operator and system actions.

## Runtime Configuration

All sensitive and deployment-specific values come from environment variables:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `ADMIN_EMAIL`
- `APP_BASE_URL`
- `APP_DISPLAY_NAME`
- `TRIGGER_SECRET_KEY`
- `TRIGGER_PROJECT_REF`
- `GITHUB_PAT`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `NARRATIVE_PROMPT`
- `NARRATIVE_PROMPT_PATH`
- `REPORT_SENDER_NAME`
- `N8N_WEBHOOK_URL`
- `N8N_WEBHOOK_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `BLOB_READ_WRITE_TOKEN`
- `SEED_CLIENTS_PATH`
- `PUPPETEER_EXECUTABLE_PATH`

`.env.example` must stay placeholder-only.

## Phases

### Phase 1 - Scaffold, DB, Auth, Client CRUD

Complete.

- Next.js scaffold with TypeScript and Tailwind.
- Drizzle schema and initial migration.
- Auth.js GitHub provider with email allow-list.
- Client/project CRUD with audit logging.
- Private seed data supported through `SEED_CLIENTS_PATH`.

### Phase 2 - End-to-End Report Pipeline

In progress.

- Trigger.dev config and report-generation tasks.
- Activity fetch from configured repositories.
- Private prompt loading from env or local path.
- Narrative and email copy generation.
- PDF rendering and blob upload.
- Email draft creation through webhook.
- Weekly parent task with per-client fanout and digest notification.

### Phase 3 - Reports UI and Actions

Planned.

- Report list and report detail views.
- Editable email subject/body.
- Send and discard actions routed through the webhook workflow.
- Run progress views with realtime updates.
- On-demand report generation.

### Phase 4 - Schedule UI and Final Polish

Planned.

- Schedule editor backed by imperative SDK calls.
- Reminder task and schedule.
- Audit log surface on report detail.
- Final public-safety and design pass.

## Verification

- Run `npm run lint`.
- Run `npm run build`.
- Run `npm run audit:public`.
- Seed from a private YAML file using `SEED_CLIENTS_PATH`.
- Run a report against a private test client and verify activity totals, narrative,
  PDF upload, email draft creation, and notification delivery.
- Confirm disabled clients are skipped for scheduled runs and still available for
  explicit on-demand runs when intended.

## Public Repository Hygiene

- Do not commit private prompts, real seed files, local service paths, domains,
  emails, account identifiers, webhook routes, database topology, or production
  credentials.
- Keep lockfile registry and sponsor URLs; those are ordinary package metadata.
- Generic third-party API endpoints are acceptable only when they contain no
  account-specific path or secret.
