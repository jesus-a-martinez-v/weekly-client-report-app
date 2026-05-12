# CLAUDE.md - Weekly Client Reports

This is a single-operator admin app for generating weekly client status reports.
It fetches repository activity, writes a non-technical narrative, renders a PDF,
creates a draft through an external email workflow, sends a notification, and
lets the operator review the result in the app.

## Status

- Phase 1 is complete: scaffold, database schema, authentication, and client CRUD.
- Phase 2 is in progress: background jobs, activity fetching, narrative generation,
  PDF rendering, email draft creation, and run digests.
- The public repository must not contain private prompts, production URLs, private
  client names, personal emails, local absolute paths, infrastructure topology, or
  real credentials.

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

## Public-Safety Rules

- Keep `.env.example` placeholder-only. Never include real domains, webhook paths,
  emails, tokens, project refs, chat IDs, or database hostnames.
- Keep the production narrative prompt out of git. Store it locally via
  `NARRATIVE_PROMPT_PATH` or in the environment via `NARRATIVE_PROMPT`.
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

## Implementation Notes

- Schedules are managed imperatively through the Trigger.dev SDK and mirrored in
  the database for fast UI rendering.
- The app is intentionally single-operator. Avoid adding tenant, invite, or role
  systems unless the product direction changes.
- Email actions go through the webhook integration; the webapp should not manage
  mail-provider OAuth directly.
- Report PDFs use HTML rendered by Puppeteer. Keep templates self-contained and
  avoid external fonts or account-specific assets.
