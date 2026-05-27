
# TECH STACK GUIDE FOR AI DEV AGENTS

Use this guide to decide **what tech to reach for and when**. The default stack is opinionated on purpose — deviating from it requires a stated reason.

---

## 1. CORE PRINCIPLES

- **Default stack first.** If a tool listed in Section 2 can do the job, use it. Do not introduce a new tool to solve a problem the existing stack already solves.
- **Decision rules over preferences.** Every fork in this doc (Trigger.dev vs in-app, Render vs Vercel, Postgres vs SQLite) has a written rule. Follow the rule unless you can articulate why this case is the exception.
- **No new dependencies without justification.** Adding a library, service, or framework outside this guide requires explicit user approval, with a one-line reason.

> **When in doubt, ask.** Picking the wrong tool early is much more expensive to undo than asking a clarifying question.

---

## 2. DEFAULT STACK AT A GLANCE

| Layer | Default | Notes |
|---|---|---|
| Language | **TypeScript** | All app code and Trigger.dev jobs |
| Framework | **Next.js (App Router)** | Fullstack — see Section 4 for MVC layout |
| Database (primary) | **PostgreSQL via Supabase** | Auth, storage, realtime included |
| Database (embedded) | **SQLite** | Only when criteria in Section 3 are met |
| Hosting (Next.js) | **Vercel** | |
| Hosting (anything else) | **Render** | Background workers, long-running services, cron, non-Next.js backends |
| Background jobs / automation | **Trigger.dev** | TypeScript, version-controlled, retryable |
| Visual / integration-heavy automation | **n8n** | Only when an integration would be hours of API glue but a single n8n node |
| Auth | **Supabase Auth** | Don't pull in NextAuth/Clerk/etc. without a reason |
| Errors + performance | **Sentry** | Errors and perf only — see Section 7 |

---

## 3. DATABASE — POSTGRES VS SQLITE

### Default: PostgreSQL (Supabase)
Reach for Supabase Postgres when **any** of the following is true:
- More than one process or instance writes to the database.
- The app is deployed (not just a local script or tool).
- You need auth, row-level security, realtime, or storage.
- The data outlives a single user session.
- Multiple users will read or write concurrently.

In practice: **almost every app uses Supabase Postgres.**

### Use SQLite only when **all** are true:
- Single process, single machine.
- No concurrent writers.
- Data is local-only (CLI tool, local script, embedded use case, dev fixture).
- No auth/realtime/storage needs.

Examples that warrant SQLite: a local CLI tool, a one-off script that caches API responses, an Electron app's local store, a test fixture.

### Anti-patterns
- ❌ Using SQLite in a multi-instance deployed app "because it's lighter." It will corrupt under concurrent writes.
- ❌ Spinning up a fresh Postgres for a tiny CLI tool. Use SQLite.
- ❌ Bypassing Supabase RLS with the service role key in user-facing code. Service role is for trusted server contexts only.

---

## 4. FRAMEWORK & MVC LAYOUT — NEXT.JS APP ROUTER

Default to **Next.js (App Router)**. Fullstack, but with **strict separation** — routes/server actions are thin, business logic lives in services, data access lives in repos.

### Folder layout
```
/app
  /(routes)/...              # Pages and route handlers
  /api/<resource>/route.ts   # API routes — controllers only
/lib
  /services/<domain>.ts      # Business logic — pure functions where possible
  /db/<resource>.ts          # Supabase queries — repository layer
  /clients/<service>.ts      # External API clients (Sentry, third-party APIs)
/types                       # Shared types
```

### Layer responsibilities
- **Route handlers / Server Actions (controllers):** Parse input, call a service, return a response. **No business logic, no DB queries.** If a route handler is more than ~20 lines, the logic belongs in a service.
- **Services:** All business logic. Pure where possible. Take a Supabase client (or repo) by injection so they're testable.
- **Repos (`/lib/db`):** The only place that touches Supabase queries directly. Returns typed domain objects, not raw rows.
- **Clients (`/lib/clients`):** Wrap external APIs. Centralize retries, auth, error handling.

### When to split out a standalone backend
If you find yourself fighting Next.js — needing WebSockets, persistent connections, runtimes >60s, or a non-HTTP entrypoint — that work belongs in a **separate Render service** or **Trigger.dev** (see Section 6), not in a Next.js route.

---

## 5. HOSTING — VERCEL VS RENDER

The choice is determined by app shape, not preference.

### Vercel — use when:
- The app is **Next.js**.
- All HTTP work fits inside Vercel's runtime limits (10s Hobby / 60s Pro / 300s Pro w/ fluid).
- No persistent connections (WebSockets beyond Pro limits, long SSE streams, etc.).
- No background workers, no cron beyond Vercel Cron's limits.

### Render — use when:
- The app is **not Next.js** (Express, Hono, Fastify, Python, etc.).
- You need a **background worker**, persistent process, or always-on socket connection.
- You need **cron jobs** more flexible than Vercel Cron.
- You need a persistent disk or a stateful service (Redis instance, etc.).

### Rule of thumb
- **Next.js → Vercel.**
- **Everything else → Render.**
- Long-running work coming out of a Next.js app on Vercel → push it to **Trigger.dev** (Section 6), not into a route handler.

### Anti-patterns
- ❌ Running an Express server on Vercel "because we already pay for it." It fights you the whole way.
- ❌ Deploying a Next.js app to Render to avoid Vercel's function limits. Move the long work to Trigger.dev instead.
- ❌ Sleeping/polling inside a Vercel route handler. The function times out.

---

## 6. AUTOMATION & BACKGROUND WORK — THE THREE-WAY FORK

There are three places work can run. Pick using this decision tree, in order:

### A. In-app service layer (synchronous)
Use when **all** are true:
- Runs in <5–10 seconds.
- It's fine if the work dies on a redeploy (no durability needed).
- One-shot per request, no retry policy needed beyond a try/catch.
- Doesn't need to run on a schedule.

Examples: writing a row, sending one transactional email, validating input, a single Supabase mutation.

### B. Trigger.dev (default for background work)
Use when **any** are true:
- Work takes >10 seconds, or could.
- Needs to **retry on failure** with backoff.
- Needs to **survive a redeploy** (durable execution).
- Runs on a **schedule** (cron).
- **Fan-out:** one trigger, many parallel sub-tasks.
- User-visible work that exceeds Vercel's function timeout.

Examples: AI generation, scraping, batch syncs, sending a campaign, processing webhooks with downstream side effects, nightly data rollups.

### C. n8n (last resort, integration-heavy only)
Use only when **all** are true:
- The work is mostly stitching SaaS APIs together (Slack ↔ HubSpot ↔ Gmail, etc.).
- An integration that would take **hours of API glue** in TS is a **single pre-built node** in n8n.
- The branching/logic is shallow — n8n's UI gets unreadable past a handful of conditionals.
- It's acceptable that the workflow lives outside your repo (no version control parity with the app).

If logic is non-trivial **or** the integration also exists as a maintained npm SDK, prefer Trigger.dev.

### Anti-patterns
- ❌ A trivial "fire and forget" routed through Trigger.dev when a service-layer call would do (overhead, indirection, debugging pain).
- ❌ A 30-second AI call inside a Next.js route handler on Vercel (timeout + no retry + no observability).
- ❌ A 12-node n8n workflow with nested IFs and Code nodes. At that point it should be a Trigger.dev task.
- ❌ Mixing concerns: business logic duplicated between an in-app service and a Trigger.dev job. The job should *call* the service, not reimplement it.

---

## 7. OBSERVABILITY — SENTRY ONLY

**Sentry handles errors and performance. There is no separate logger.**

### What Sentry is for
- Uncaught exceptions in app code, route handlers, server actions.
- Caught exceptions you want to surface (`Sentry.captureException`).
- Performance traces (slow routes, slow DB queries).
- Trigger.dev task failures (wire Sentry into the task error handler).

### What Sentry is **not** for
- ❌ Info/debug logs. Use `console.log` in dev; in prod, those go to Vercel/Render logs.
- ❌ Audit trails. Those belong in a Postgres table.
- ❌ Business metrics. Wrong tool — use the DB, or add a real metrics tool when you actually need one.

### Rules
- Wrap external I/O so failures become **typed errors** before reaching Sentry — raw network errors with no context are noise.
- Set `Sentry.setUser` and `Sentry.setContext` early in the request so events are debuggable.
- Never log secrets, tokens, or PII to Sentry. Scrub at the SDK level with `beforeSend`.
- Don't pipe `console.log` into Sentry to make it a logger. It isn't one.

---

## 8. WHAT'S NOT IN THE DEFAULT STACK

If the task seems to call for one of these, **stop and ask** before introducing it:

- A second database (Mongo, DynamoDB, Firestore, etc.) — Supabase Postgres handles 99% of cases.
- A second auth provider (NextAuth, Clerk, Auth0) — Supabase Auth is the default.
- A separate ORM (Prisma, Drizzle) — Supabase client + typed repos is the default. Drizzle is acceptable if explicitly requested.
- A separate queue (BullMQ, SQS) — that's what Trigger.dev is for.
- A separate cron service (GitHub Actions cron, Render Cron) — Trigger.dev schedules unless there's a clear reason.
- A logging service (Logtail, Datadog, Axiom) — Sentry only.
- A separate cache layer (Redis, Upstash) — Postgres + Next.js caching first.

Introducing any of these requires: (1) a one-line reason the default can't do it, and (2) explicit user approval.

---

## 9. SESSION CHECKLIST

**Before writing code, ask:**
- [ ] Database — does this need Postgres, or is SQLite genuinely sufficient (Section 3)?
- [ ] Where does this run — in-app service, Trigger.dev, or n8n (Section 6)?
- [ ] If hosted — Vercel or Render (Section 5)?
- [ ] Am I introducing anything outside the default stack (Section 8)? If yes, stop and ask.

**Before opening a PR:**
- [ ] Errors flow into Sentry with enough context to debug.
- [ ] No secrets/PII in Sentry payloads.
- [ ] No long-running work (>10s) inside a Vercel route handler.
- [ ] No business logic in route handlers or repos — it lives in services.