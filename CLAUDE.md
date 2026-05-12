# CLAUDE.md — weekly-client-report-app

A single-user admin webapp that takes over the Example Company weekly client reporting pipeline. Every Monday it pulls a week of GitHub activity per client, has GPT-5.5 write a non-technical narrative, renders a PDF, creates a email provider draft via n8n, pings Telegram, and lets Admin review + Send/Discard inside the app.

## Status

- Repo currently holds **`ROADMAP.md`** and this file. No code yet.
- Implementation is broken into 4 phases in `ROADMAP.md`. Work them sequentially, one per session, unless the user says otherwise.
- The predecessor pipeline (still in production until this app replaces it) lives at `/path/to/private-source`. Treat it as the source of truth for the narrative prompt, the `clients.yaml` seed data, and the GitHub-fetch window logic.

## Stack (locked)

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 App Router · TypeScript · Tailwind |
| Auth | Auth.js v5 (GitHub provider) · single-email allow-list (`admin@example-company.net`) |
| DB | Postgres 16 self-hosted on this VM, public via reverse proxy TCP+SNI, TLS in Postgres |
| ORM | Drizzle ORM + `postgres` driver |
| Background jobs | Trigger.dev v3 cloud (imperative schedules, editable from the UI) |
| AI | OpenRouter · `openai/gpt-5.5` · JSON mode · `reasoning_effort: "medium"` |
| GitHub | Octokit REST · single PAT covering `Example Company` and `ExampleOrg` orgs |
| PDF | Puppeteer inside a Trigger.dev task (`puppeteer()` build extension) |
| Blob | Vercel Blob for PDF storage |
| Email | n8n webhook → email provider node (draft / send / discard) using n8n's existing Google OAuth |
| Telegram | Bot API single `sendMessage` with deep link — **no inline buttons** |

## Key paths

- `ROADMAP.md` — the authoritative implementation plan; phases, schema, tasks, env vars, verification
- `/path/to/private-source/prompts/narrative.md` — the narrative prompt (the IP); copy **verbatim** to `src/prompts/narrative.md`
- `/path/to/private-source/clients.yaml` — seed input for `scripts/seed.ts`
- `/path/to/private-source/lib/{fetch_activity,window,gmail,render_pdf,telegram}.py` — reference implementations to port (logic, not code)
- `/path/to/private-compose.yml` — where the new `weekly-reports-db` Postgres service gets added in Phase 1

## Conventions and constraints

- **Timezone**: `America/Bogota` (UTC−5, no DST). The reporting window is the prior Mon 00:00 → Sun 23:59 in Bogota. All schedules use this tz.
- **Single user.** Don't add multi-tenant features, role hierarchies, or invitation flows. Auth.js gates a single allowed email.
- **Telegram is notification-only.** A single `sendMessage` with a link to the webapp. **Do not** rebuild inline Send/Discard buttons — review happens in the app.
- **Email goes through n8n, not direct email provider OAuth.** The app POSTs to an n8n webhook with `{ action: "draft" | "send" | "discard", ... }`. n8n already has the Google OAuth credentials.
- **PDFs use Puppeteer + HTML**, not Typst. Look-and-feel can iterate later — start simple.
- **Frontend design: use the `frontend-design` skill before building each screen.** No generic shadcn dashboard. The design language is editorial, typographic, dense-but-quiet — large weekly hero numbers, neutral grayscale with one warm accent for status.
- **Schedules are imperative.** Don't declare `cron` in code on `schedules.task()`. Attach schedules at runtime via `schedules.create/update/del`, mirrored to the `schedules` table for fast UI rendering. Trigger.dev is the source of truth.
- **Narrative prompt is verbatim.** Don't paraphrase or edit `prompts/narrative.md` from the old repo. If you think it needs changes, surface them as a separate decision.
- **Editable email subject/body.** Drafts created via n8n use the narrative-time copy, but the report-detail page lets Admin edit subject/body in place; Send uses the current DB values.

## Common commands (after Phase 1 scaffold)

```bash
# Dev
npm run dev                          # Next.js dev server
npx trigger.dev@latest dev           # Trigger.dev local dev (talks to cloud project)
npx drizzle-kit studio               # DB inspector

# Migrations
npx drizzle-kit generate             # generate migration from schema diff
npx drizzle-kit migrate              # apply to DATABASE_URL

# Deploy
npx trigger.dev@latest deploy        # ship tasks to Trigger.dev cloud
vercel --prod                        # deploy the webapp

# Verify
npx trigger.dev@latest schedules list
psql "$DATABASE_URL" -c "\dt"
```

## Don't

- Don't propose Neon / Supabase Cloud / Vercel Postgres — DB lives on this VM behind reverse proxy.
- Don't add a direct email provider OAuth flow inside the Next.js app — route through n8n.
- Don't rebuild Telegram inline Send/Discard buttons — those moved to the webapp on purpose.
- Don't add a `users` table — Auth.js JWT + email allow-list is sufficient.
- Don't enable Vercel Blob signed URLs in Phase 2 — start with `access: "public"`, switch only if engagement turns sensitive.
- Don't replace the narrative prompt or invent "improvements" without asking.
- Don't try to ship the whole roadmap in one session. Work one phase per session.

## When picking up a fresh session

1. Read `ROADMAP.md` to find the current phase boundary.
2. Skim `git log` to see what's already done.
3. Ask Admin which phase he wants to tackle, unless he opens with it.
4. For Phase 2+, you'll need: `OPENROUTER_API_KEY`, `GITHUB_PAT`, the n8n webhook URL + shared secret, and the Trigger.dev project credentials. Ask when first needed; don't assume.
