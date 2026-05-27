# AGENTS.md - Weekly Client Reports

Agent guidance for this repo. Read by Codex, Cursor, Aider, and any other tool
that follows the [AGENTS.md convention](https://agents.md). Claude Code reads
[`CLAUDE.md`](./CLAUDE.md), which mirrors this file — keep them in sync.

This is a single-operator admin app for generating weekly client status reports.
It fetches repository activity, writes a non-technical narrative, renders a PDF,
creates a draft through an external email workflow, sends a notification, and
lets the operator review the result in the app.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js App Router, TypeScript, Tailwind |
| Auth | Auth.js with GitHub provider and an email allow-list |
| DB | Postgres via Drizzle ORM |
| Background jobs | Trigger.dev |
| AI | OpenRouter chat completions |
| GitHub | Octokit REST |
| PDF | Puppeteer HTML rendering |
| Blob storage | Vercel Blob |
| Email | External webhook that manages draft/send/discard actions |
| Notifications | Telegram Bot API |

## Related Guides

Consult these before starting work. They override generic instincts.

- [`TECH_STACK_GUIDE.md`](./TECH_STACK_GUIDE.md) — required reading before picking a
  tool, adding a dependency, or deciding where new code or background work should
  live (in-app service vs Trigger.dev vs n8n, Vercel vs Render, Postgres vs SQLite).
- [`LINEAR_GUIDE.md`](./LINEAR_GUIDE.md) — required reading for all task and issue
  handling. **No issue, no work** — including small fixes.

### Documented deviations from `TECH_STACK_GUIDE.md`

The guide's defaults assume a greenfield app. This project predates the guide and
intentionally differs in these places. These are the deployed state — do not
"fix" them without discussion:

- **Auth: Auth.js (not Supabase Auth).** GitHub provider + email allow-list is in
  production.
- **DB access: Drizzle ORM (not the Supabase client).** Schema and migrations live
  under `drizzle/`. The guide explicitly allows Drizzle "if explicitly requested" —
  treat that as settled here.
- **Postgres is plain Postgres**, not Supabase-hosted. No RLS, no Supabase Storage.
- **Blob storage: Vercel Blob** (used for PDFs).
- **Notifications: Telegram** — single-operator paging only, not a log sink.
- **Observability: Sentry not wired up yet.** When errors need to surface, follow
  the guide's Sentry-only rule rather than introducing a second tool.

## Public-Safety Rules

- Keep `.env.example` placeholder-only. Never include real domains, webhook paths,
  emails, tokens, project refs, chat IDs, or database hostnames.
- Keep the production narrative prompt out of git. Store it locally via
  `NARRATIVE_PROMPT_PATH`, or in hosted environments via `NARRATIVE_PROMPT`
  or `NARRATIVE_PROMPT_BASE64`. Hosted jobs must not fall back to the public
  example prompt.
- Keep seed data private. Point `SEED_CLIENTS_PATH` at a local YAML file.
- Use generic examples in docs, tests, prompts, and UI copy.
- Run `npm run audit:public` before committing or pushing.

## Common Commands

```bash
npm run dev
npm run lint
npm run build
npm run audit:public
npm run db:generate
npm run db:migrate
npm run db:seed
```

## Trigger.dev Deploy

Any change to files under `src/trigger/` must be deployed to Trigger.dev or the
new/changed task will not run in production. Deploy with env vars sourced from
`.env.local`:

```bash
set -a && source .env.local && set +a && npx trigger.dev@latest deploy
```

Always deploy immediately after committing Trigger.dev task changes — do not
leave it for later.

## Implementation Notes

- Schedules are managed imperatively through the Trigger.dev SDK and mirrored in
  the database for fast UI rendering. The schedule editor lives at `/admin/schedules`.
  If you rename a task ID in code, delete and recreate any imperative schedule that
  targets it — the app won't automatically re-point it.
- The drafted-report reminder fires on its own schedule (see `/admin/schedules`).
  The threshold before a nudge is sent is controlled by `REMINDER_THRESHOLD_HOURS`
  (default 18 hours).
- The app is intentionally single-operator. Avoid adding tenant, invite, or role
  systems unless the product direction changes.
- Email actions go through the webhook integration; the webapp should not manage
  mail-provider OAuth directly.
- Report PDFs use HTML rendered by Puppeteer. Keep templates self-contained and
  avoid external fonts or account-specific assets.

---

# How You Must Work

## General behavior

- Prefer clarity over cleverness. Small, focused changes — one concern per task.
- Before starting a task, follow the Linear workflow in `LINEAR_GUIDE.md`. No
  issue, no work — including small fixes.
- Before picking a tool, adding a dependency, or deciding where background work
  runs, consult `TECH_STACK_GUIDE.md`. Deviating from its defaults requires a
  stated reason and user approval (the deviations documented above are the
  exceptions).
- Before writing code on a non-trivial task: state your approach, list the files
  you'll touch, and wait for confirmation.
- If you're unsure about intended behavior, ask. Don't infer and proceed.
- Don't modify files outside the current task without explicit instruction.

## Code style (TypeScript)

- Type every function signature and exported symbol. No implicit `any`.
- Prefer `X | undefined` / `X | null` over wrapper types. No `any` without a
  comment explaining why.
- Use typed error returns or named exceptions at service boundaries. Don't
  swallow errors silently — surface them through Trigger.dev task logs for jobs
  or the request path for routes.
- Wrap external I/O (Octokit, OpenRouter, the email webhook, Vercel Blob,
  Telegram) so failures become typed errors before reaching callers.
- No mutable module-level state beyond clients/singletons. No secrets in code.

---

# Hard Limits

- Never skip `npm run audit:public` to land a change.
- Never suppress a lint or type error without an explanatory comment on the same
  line.
- Never rename, restructure, or refactor code unrelated to the current task.
- Never add a dependency without justifying it against `TECH_STACK_GUIDE.md`.
- Never commit real secrets, client names, production URLs, or the production
  narrative prompt.
- Never skip the Trigger.dev deploy after editing `src/trigger/`.

---

# Definition of Done

Before marking a task complete:

1. `npm run lint` — clean.
2. `npm run build` — passes (this is what enforces TypeScript correctness).
3. `npm run audit:public` — clean.
4. If `src/trigger/` changed: deployed via the command in **Trigger.dev Deploy**.
5. If schema changed: `npm run db:generate` was run and the migration committed.
6. Linear issue moved to `In Review` (or `Done` if no review needed) with a
   comment describing the change and branch name.
7. No files outside the task scope were modified.
