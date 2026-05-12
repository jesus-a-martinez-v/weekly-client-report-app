# Weekly Client Report App — Implementation Plan

## Context

The existing Python pipeline at `/path/to/private-source` works (Mon 09:00 Bogota cron → fetch GitHub via `gh` CLI → Claude narrative → Typst PDF → email provider draft → Telegram digest with inline Send/Discard buttons → Wed reminder), but it has problems we want to fix:

- Clients live in `clients.yaml` — editing means hand-editing files and pushing.
- The only review surface is email provider and Telegram. No single source of truth, no history view, no audit.
- Local cron is brittle (PATH issues, no UI), tied to this VM, can't be paused or rescheduled without editing crontab.
- No way to trigger a report on demand from outside Claude Code.

This rebuild moves the system to a proper webapp:
- **Webapp on Vercel** (Next.js 15 App Router) — admin UI, report review, on-demand triggers, schedule editing.
- **Workflows on Trigger.dev v3** — fetch / narrate / render / email steps, with dynamic schedules editable from the UI.
- **Postgres on this VM via reverse proxy** — clients, projects, runs, reports, schedule mirror.
- **n8n webhook** for email provider (n8n already holds your Google OAuth credentials — keeps secrets out of Vercel).
- **OpenRouter + `openai/gpt-5.5`** for the narrative step.
- **Telegram = notify-only.** All review and Send/Discard happens in the webapp.
- **Auth.js + GitHub OAuth, single-email allow-list (`admin@example-company.net`).**
- **Frontend design via the `frontend-design` skill** — invoked per screen during implementation. No generic AI dashboard look.

Intended outcome: a focused single-user admin app that takes over the existing pipeline 1:1, plus on-demand runs and editable schedules, with the existing narrative prompt and 4 clients seeded verbatim.

---

## Stack (locked)

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 App Router, TypeScript, Tailwind, shadcn primitives only as needed |
| Auth | Auth.js v5 (NextAuth), GitHub provider, allow-list of one email |
| DB | Postgres 16 in Docker on this VM, public via reverse proxy TCP+SNI, TLS in Postgres (Let's Encrypt DNS-01) |
| ORM | Drizzle ORM + `postgres` driver (serverless-friendly) |
| Background jobs | Trigger.dev v3 cloud (`@trigger.dev/sdk`, `@trigger.dev/build`) |
| AI | OpenRouter — `openai/gpt-5.5`, JSON mode, `reasoning_effort: "medium"` |
| GitHub | Octokit REST, single PAT (`repo` scope) covering Example Company + ExampleOrg orgs |
| PDF | Puppeteer inside a Trigger.dev task (`puppeteer()` build extension), HTML template |
| Blob | Vercel Blob (`@vercel/blob`) for PDFs |
| Email | n8n webhook → email provider node (draft / send / discard) using existing n8n OAuth credentials |
| Telegram | Bot API single `sendMessage` with link to webapp, no inline buttons |
| Realtime UI | `@trigger.dev/react-hooks` `useRealtimeRun` for run progress pages |

Code root: `/path/to/weekly-client-report-app` (currently empty).

---

## Trigger.dev — dynamic schedules

Schedules are **imperative only** (managed from the UI), not declared in code. Two scheduled tasks, each with one schedule attached:

```ts
// src/trigger/weekly-report-run.ts (Monday)
export const weeklyReportRun = schedules.task({ id: "weekly-report-run", run: async (p) => { … } });

// src/trigger/weekly-report-reminder.ts (Wednesday)
export const weeklyReportReminder = schedules.task({ id: "weekly-report-reminder", run: async (p) => { … } });
```

Server actions in `src/server/actions/schedules.ts` wrap the SDK:

```ts
await schedules.create({ task: "weekly-report-run", cron: "0 9 * * 1",
  timezone: "America/Bogota", externalId: "weekly-main",
  deduplicationKey: "weekly-main" });
await schedules.update(id, { cron, timezone });
await schedules.deactivate(id);  // pause
await schedules.activate(id);    // resume
await schedules.del(id);
await schedules.list();
```

**Source of truth = Trigger.dev.** Our `schedules` table mirrors the last-known state for fast UI rendering. Every mutation goes through the SDK first, then upserts the mirror. A `/api/schedules/sync` route forces a reconcile if drift is suspected.

---

## Database schema (Drizzle)

`src/db/schema.ts` — Postgres 16, `pgcrypto` extension, UUID PKs.

- **`clients`** — id, name, slug (unique), contact_name, contact_email, tone, status (`active` | `disabled`), created_at, updated_at.
- **`projects`** — id, client_id (fk cascade), name (nullable; null = single-project client), repos (`text[]` of `owner/repo`), position, created_at.
- **`runs`** — id, kind (`weekly` | `on_demand`), week_label (`2026-W19`), window_start, window_end, status (`queued|running|succeeded|partial|failed`), trigger_run_id, schedule_id (nullable fk), error_message, started_at, finished_at, created_at.
- **`reports`** — id, run_id (fk), client_id (fk), week_label, window_start, window_end, status (`pending|fetching|narrating|rendering|drafted|sent|discarded|quiet|failed`), totals_prs / issues / commits, activity_json (jsonb), narrative_md (text), email_subject, email_body, pdf_blob_url, pdf_filename, gmail_draft_id, sent_at, discarded_at, trigger_run_id, error_message, created_at, updated_at. Unique on `(client_id, week_label)`.
- **`schedules`** — id, trigger_schedule_id (unique), kind (`weekly_main` | `weekly_reminder`), external_id, cron, timezone, active, next_run, last_synced_at, created_at, updated_at.
- **`audit_log`** — id, actor_email, action, entity_type, entity_id, payload (jsonb), created_at.

No `users` table — Auth.js JWT session + email allow-list is sufficient.

---

## Trigger.dev tasks (`src/trigger/`)

1. **`weeklyReportRun`** (scheduled) — compute window, insert `runs` row, `tasks.batchTrigger` one `generateClientReport` per active client, send Telegram digest after batch completes.
2. **`weeklyReportReminder`** (scheduled, Wed) — count reports stuck in `drafted` for the current week → Telegram ping if any.
3. **`generateClientReport(clientId, weekLabel?, runId?, onDemand?)`** — main pipeline:
   1. `fetchActivity` — Octokit per repo: merged PRs, closed issues, commits in the Bogota Mon–Sun window. Persist `activity_json` + totals.
   2. Quiet-week branch (all totals zero) → templated 2-paragraph narrative, skip OpenRouter and Puppeteer.
   3. `generateNarrative` — call OpenRouter with the **verbatim** `prompts/narrative.md` from the Python project. Second short call returns `{ subject, body }`.
   4. `renderPdf` — Puppeteer HTML → PDF, upload to Vercel Blob at `reports/<weekLabel>/<slug>_<YYYY-MM-DD>_report.pdf`.
   5. `createemail providerDraft` — POST n8n webhook `{ action: "draft", to, subject, body, pdf_url, filename }`. Save returned `draft_id`. Status → `drafted`.
4. **`emailAction({ reportId, action })`** — invoked from webapp Send/Discard buttons. POSTs n8n with action + draft_id, updates report status, writes `audit_log`.

On-demand runs from the webapp call `tasks.trigger<typeof generateClientReport>("generate-client-report", { clientId, weekLabel, onDemand: true })`, insert a `runs` row with `kind='on_demand'`, redirect UI to `/runs/[id]` with realtime subscription.

---

## Webapp routes (`src/app/`)

```
(auth)/signin                       single GitHub button
(dashboard)/                        layout requires session
  page                              home: last weeks' reports, next scheduled run, quick actions
  clients/                          list + active toggle
    new                             create
    [id]                            edit (inline project + repo CRUD)
  reports/                          list grouped by week
    [id]                            split pane: narrative + editable email | PDF iframe, Send/Discard/Regenerate
  runs/                             list of recent runs
    [id]                            realtime per-client progress (useRealtimeRun)
  schedule/                         two cards: Monday + Wednesday; cron + tz + pause; cronstrue preview
  on-demand/                        client picker + week picker + Trigger button
api/
  auth/[...nextauth]/route          Auth.js
  schedules/sync/route              manual SDK→DB reconcile (admin)
  webhooks/n8n/route                optional async callback
```

Server actions in `src/server/actions/`: `clients.ts`, `reports.ts`, `schedules.ts`, `runs.ts`.

Auth.js v5 in `src/lib/auth.ts` — GitHub provider, `signIn` callback checks `ALLOWED.has(profile.email)`, JWT session, middleware redirects anonymous to `/signin`.

---

## n8n workflow — `example-email-workflow`

Webhook (POST `/webhook/example`, header auth `x-api-key`) → Switch on `action`:
- **draft**: HTTP Request `GET {{$json.pdf_url}}` as binary → email provider "Create Draft" with attachment → respond `{ draft_id, status: "drafted" }`.
- **send**: email provider "Send Draft" with `draft_id` → respond `{ status: "sent" }`.
- **discard**: email provider "Delete Draft" with `draft_id` → respond `{ status: "discarded" }`.

Reuse existing email provider OAuth credential in n8n. During implementation, consult the **n8n-mcp-tools-expert**, **n8n-workflow-patterns**, and **n8n-node-configuration** skills, and validate with `validate_workflow` before deploying.

---

## Postgres on the VM

Add `weekly-reports-db` service to `/path/to/private-compose.yml` (reverse proxy + n8n already running there):

- Image `postgres:16`, volume `weekly_reports_pgdata`, env from `.env` (POSTGRES_USER=app, POSTGRES_DB=weekly_reports, strong scram-sha-256 password).
- TLS: issue cert for `db.example.com` via `certbot --dns-<provider>` (DNS-01; port 80 is busy with reverse proxy), mount cert into container, set `ssl=on`, `ssl_cert_file`, `ssl_key_file`. `pg_hba.conf`: `hostssl all all 0.0.0.0/0 scram-sha-256` only.
- reverse proxy: new `postgres` entrypoint on `:5432`, TCP router with `SNI rule(\`db.example.com\`)` and `tls.passthrough=true`, service load-balances to `weekly-reports-db:5432`.
- `DATABASE_URL=postgresql://app:<pw>@db.example.com:5432/weekly_reports?sslmode=require`.
- Nightly `pg_dump | gzip` → `/root/backups/weekly_reports_<date>.sql.gz`, retain 14 days, via host cron.

(Pin the subdomain `db.example.com` to this VM in DNS as part of Phase 1.)

---

## Frontend design — MUST use the `frontend-design` skill

Invoke the `frontend-design` skill before building each screen. Design language: **editorial, typographic, dense-but-quiet** — large weekly hero numbers, Inter or Lato, neutral grayscale with one warm accent for status pills, no card-shadow soup.

Screens to design:
1. Sign in (single GitHub button + brand mark).
2. Dashboard home (latest reports, next-run countdown, on-demand CTA).
3. Clients list (table + status pill + last-report date + active toggle).
4. Client edit (inline project editor with chip-style repo entry).
5. Reports list (grouped by week, status pills, week filter).
6. Report detail (split pane: editable subject/body left, PDF iframe right, sticky Send/Discard/Regenerate, audit timeline).
7. Runs list + Run detail (realtime per-client step pills via `useRealtimeRun`).
8. Schedule (two cards with cron input + cronstrue preview + tz select + pause toggle + next-3-runs preview).
9. On-demand (client picker + week picker + big Trigger button).

---

## Env vars

| Var | Where used | Purpose |
|---|---|---|
| `DATABASE_URL` | Vercel + Trigger.dev | `postgresql://app:<pw>@db.example.com:5432/weekly_reports?sslmode=require` |
| `AUTH_SECRET` | Vercel | Auth.js JWT signing |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | Vercel | GitHub OAuth app credentials |
| `ADMIN_EMAIL` | Vercel | `admin@example-company.net` (allow-list) |
| `APP_BASE_URL` | Vercel + Trigger.dev | `https://reports.example-company.net` for Telegram deep links |
| `TRIGGER_SECRET_KEY` | Vercel + Trigger.dev | SDK auth (`tr_prod_...`) |
| `TRIGGER_PROJECT_REF` | Vercel | Trigger.dev project ref |
| `GITHUB_PAT` | Trigger.dev | `repo` scope, covers Example Company + ExampleOrg |
| `OPENROUTER_API_KEY` | Trigger.dev | **ask user during Phase 2** |
| `OPENROUTER_MODEL` | Trigger.dev | `openai/gpt-5.5` |
| `N8N_WEBHOOK_URL` | Trigger.dev | `https://n8n.example-company.net/webhook/example` |
| `N8N_WEBHOOK_SECRET` | Trigger.dev + n8n | shared `x-api-key` header |
| `TELEGRAM_BOT_TOKEN` | Trigger.dev | reused from Python project (`@example-company_assistant_bot`) |
| `TELEGRAM_CHAT_ID` | Trigger.dev | reused |
| `BLOB_READ_WRITE_TOKEN` | Vercel + Trigger.dev | `@vercel/blob` |
| `PUPPETEER_EXECUTABLE_PATH` | Trigger.dev | set by `puppeteer()` extension |

---

## Phasing

**Phase 1 — Scaffold + DB + Auth + Client CRUD (1–2 days)**
- `create-next-app` (TS, App Router, Tailwind), Drizzle schema, first migration.
- Bring up Postgres on the VM via reverse proxy with TLS; verify `psql 'sslmode=require'` from outside.
- Auth.js v5 GitHub OAuth + allow-list + middleware.
- Clients/projects CRUD UI + server actions.
- `scripts/seed.ts` — read `/path/to/private-source/clients.yaml` and seed 4 clients idempotently by slug.

**Phase 2 — Trigger.dev pipeline end-to-end (2–3 days)**
- `trigger.config.ts` with `puppeteer()` extension, `maxDuration: 600`.
- Implement `generateClientReport` end-to-end. Test on `example-client` against real GitHub + real OpenRouter key. PDF lands in Vercel Blob; n8n returns draft id; Telegram pings.
- Build the `example-email-workflow` workflow in n8n (consult the n8n skills).
- Implement `weeklyReportRun` parent + fanout via `tasks.batchTrigger`.

**Phase 3 — Reports UI + Send/Discard + Realtime (1–2 days)**
- Reports list + detail. Editable subject/body persisted to DB; Send uses current values.
- `emailAction` task + Send/Discard buttons.
- `/runs/[id]` with `useRealtimeRun` + `auth.createPublicToken` on the server.
- On-demand page.

**Phase 4 — Schedule UI + reminder + design pass (1 day)**
- Schedule page wired to imperative SDK + DB mirror.
- `weeklyReportReminder` task + Wednesday schedule.
- Frontend-design pass per screen.
- Audit log surface on Report detail.

---

## Critical files

Reused verbatim (copy from existing Python project):
- `/path/to/private-source/prompts/narrative.md` → `src/prompts/narrative.md` (the narrative prompt is the IP)
- `/path/to/private-source/clients.yaml` → input to `scripts/seed.ts`

To be created (highest-leverage):
- `/path/to/weekly-client-report-app/src/db/schema.ts`
- `/path/to/weekly-client-report-app/src/trigger/generate-client-report.ts`
- `/path/to/weekly-client-report-app/src/trigger/weekly-report-run.ts`
- `/path/to/weekly-client-report-app/src/trigger/weekly-report-reminder.ts`
- `/path/to/weekly-client-report-app/src/trigger/email-action.ts`
- `/path/to/weekly-client-report-app/src/lib/openrouter.ts` (single-prompt narrative call + email-format call)
- `/path/to/weekly-client-report-app/src/lib/octokit.ts` (port of `fetch_activity.py`)
- `/path/to/weekly-client-report-app/src/lib/window.ts` (port of `window.py` — Mon–Sun Bogota)
- `/path/to/weekly-client-report-app/src/lib/pdf-template.ts` (HTML template for Puppeteer)
- `/path/to/weekly-client-report-app/src/lib/n8n.ts` (typed POSTs to n8n webhook)
- `/path/to/weekly-client-report-app/src/lib/telegram.ts` (single sendMessage with deep link)
- `/path/to/weekly-client-report-app/src/lib/schedules.ts` (SDK wrappers + DB mirror upsert)
- `/path/to/weekly-client-report-app/src/lib/auth.ts` (Auth.js v5 config + allow-list)
- `/path/to/weekly-client-report-app/src/server/actions/{clients,reports,schedules,runs}.ts`
- `/path/to/weekly-client-report-app/scripts/seed.ts`
- `/path/to/weekly-client-report-app/trigger.config.ts`
- `/path/to/weekly-client-report-app/drizzle.config.ts`
- Postgres service block + reverse proxy labels in `/path/to/private-compose.yml`

---

## Verification

1. **Local dev**: `npm run dev` for Next, `npx trigger.dev@latest dev` for the Trigger.dev local dev server pointing at the cloud project. `DATABASE_URL` points to the VM reverse proxy DSN — this verifies the production DSN works in dev.
2. **Seed + golden run**: seed 4 clients → trigger `generateClientReport` on `example-client` for `2026-W19` → diff its `activity_json` totals against running the old Python `fetch_activity.py` for the same window. Numbers must match.
3. **Quiet week**: trigger a client+week with zero activity → confirm `status='quiet'`, no PDF, draft body has the "lighter week" prose.
4. **Multi-project**: trigger Example Client Two → confirm `# ExampleOrg` and `# Example Project` H1 sections in the narrative.
5. **n8n round-trip**: draft → confirm email provider draft exists with the correct PDF attached → Send from UI → confirm sent in email provider outbox → Discard from UI on a fresh draft → confirm deletion.
6. **Schedule UI**: create the weekly schedule from `/schedule`, confirm via Trigger.dev dashboard and `npx trigger.dev@latest schedules list`. Pause + resume. Change cron `0 9 * * 1 → 0 8 * * 1`, confirm `nextRun` updates.
7. **Reminder**: leave a `drafted` row, trigger the reminder schedule manually (`schedules.test` or direct `tasks.trigger`), confirm Telegram ping fires.
8. **Auth allow-list**: sign in with a non-allowed GitHub email, confirm 403.
9. **Realtime**: on-demand trigger → watch `/runs/[id]` flip per-client statuses live without manual reload.
10. **Backup**: run nightly `pg_dump` manually, restore into a throwaway DB, count rows match.

---

## Open items to resolve during implementation

- **OpenRouter API key** — ask user when starting Phase 2.
- **GitHub OAuth app** — create or reuse an existing one; needs `https://reports.example-company.net/api/auth/callback/github` as the callback URL.
- **DNS** — `reports.example-company.net` to Vercel; `db.example.com` to this VM (A record).
- **Trigger.dev project** — confirm whether to reuse an existing project or create `weekly-report-app`.
- **Connection pooling** — start without PgBouncer (only ~4 reports/week + light admin UI traffic). Revisit if Vercel cold-start connection storms appear.
- **Vercel Blob privacy** — start with `access: "public"` (unguessable URLs). Switch to signed URLs if any client engagement is sensitive.
