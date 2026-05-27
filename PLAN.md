# Architectural Alignment Refactor — Ticket Staging

This file is a **staging document**. It exists to draft a batch of Linear
tickets before they're filed. Once they're in Linear, delete this file —
Linear is the source of truth per [`LINEAR_GUIDE.md`](./LINEAR_GUIDE.md), and
the closed issues + merged PRs are the record.

The refactor brings the codebase in line with the layering rules in
[`TECH_STACK_GUIDE.md`](./TECH_STACK_GUIDE.md) §4 (Next.js MVC layout). It does
**not** revisit the documented deviations in [`CLAUDE.md`](./CLAUDE.md)
(Auth.js, Drizzle, plain Postgres, Vercel Blob, Telegram).

## Why this refactor

The audit done on 2026-05-27 found three structural gaps:

1. **No repository layer.** 26 raw `db.*` call sites across server actions,
   Trigger.dev tasks, and page components. Schema lives at
   [`src/db/schema.ts`](./src/db/schema.ts) but there's no typed access layer.
2. **No services layer.** Business logic is inline in fat server actions
   ([`reports.ts`](./src/server/actions/reports.ts) at 396 lines,
   [`clients.ts`](./src/server/actions/clients.ts) at 198 lines) and in the
   330-line trigger task
   [`generate-client-report.ts`](./src/trigger/generate-client-report.ts).
3. **Pages query the DB directly.** Multiple `page.tsx` files import `@/db`.

The macro architecture (where work runs — Trigger.dev vs n8n vs Vercel routes)
is fine. This refactor is about **micro layering**, not relocating work.

## Sequencing principle

1. Wire observability **first** so the refactor doesn't hide regressions.
2. Build the **repo layer before the services layer** — services should depend
   on repos, not raw Drizzle calls.
3. Migrate one domain at a time. Each domain ships fully (repo + service +
   caller switch) before the next starts. That keeps each PR small and lets
   you stop after any domain without leaving the codebase half-converted.
4. Pages and trigger tasks are migrated **last**, once the layer they call
   into is stable.

Domain order (smallest blast radius first, largest last): **audit → schedules
→ runs → clients → reports**.

## Ticket index

Each entry below is sized to one Linear issue per
[`LINEAR_GUIDE.md`](./LINEAR_GUIDE.md). Title format `[Area] Action-oriented
description`. Labels per §7. All assigned to `jesus-a-martinez-v`. Default
priority `Medium` unless noted.

### Stage A — Foundations
1. `[Obs] Wire Sentry into Next.js routes and server actions`
2. `[Obs] Wire Sentry into Trigger.dev tasks`
3. `[Refactor] Move /db to /lib/db and add repo skeleton`

### Stage B — Repository layer
4. `[DB] Extract audit-log writes into auditRepo`
5. `[DB] Extract schedules queries into schedulesRepo`
6. `[DB] Extract runs queries into runsRepo`
7. `[DB] Extract clients and projects queries into clientsRepo`
8. `[DB] Extract reports queries into reportsRepo`

### Stage C — Services layer
9. `[Service] Extract schedule business logic into scheduleService`
10. `[Service] Extract run lifecycle into runService`
11. `[Service] Extract client CRUD into clientService`
12. `[Service] Extract report send/discard/revise into reportService`
13. `[Service] Extract report-generation pipeline into reportPipelineService`

### Stage D — Caller migrations
14. `[Action] Thin server actions over services`
15. `[Trigger] Migrate generate-client-report to reportPipelineService`
16. `[Trigger] Migrate weekly-report-run and drafted-reminder to services`
17. `[App] Replace direct db.* calls in page components with repos`

### Stage E — Hardening & cleanup
18. `[Refactor] Move external API clients under /lib/clients`
19. `[Obs] Replace silent best-effort catches with Sentry.captureException`

---

# Tickets

## 1. `[Obs] Wire Sentry into Next.js routes and server actions`

**Labels:** `improvement`, `tech-debt` · **Priority:** High

### Summary
The deviations section of [`CLAUDE.md`](./CLAUDE.md) flags Sentry as "not
wired up yet." Wiring it now — before any other refactor — gives the rest of
the work a safety net: regressions surface instead of failing silently.

### Scope
- Add `@sentry/nextjs` and run its installer.
- Configure `sentry.client.config.ts`, `sentry.server.config.ts`,
  `sentry.edge.config.ts`.
- Add a `beforeSend` hook that scrubs `email`, `token`, `secret`, and the
  narrative body from event payloads (see Public-Safety Rules in
  [`CLAUDE.md`](./CLAUDE.md)).
- Add `Sentry.setUser` in [`src/lib/auth.ts`](./src/lib/auth.ts) so events
  are attributable.
- Add `SENTRY_DSN` (and `SENTRY_AUTH_TOKEN` for source maps) to
  [`.env.example`](./.env.example) as placeholders.

Out of scope: Sentry in Trigger.dev tasks (ticket #2), changes to existing
catch-blocks (ticket #19).

### Acceptance Criteria
- [ ] Throwing a synthetic error from a server action produces a Sentry event
      in the dashboard with user context attached.
- [ ] `beforeSend` strips the keys listed above (verified by a unit-style
      check or by inspecting an event payload).
- [ ] `npm run audit:public` still passes after the env-var additions.

### Notes
- Sentry is the only observability tool per
  [`TECH_STACK_GUIDE.md`](./TECH_STACK_GUIDE.md) §7.
- Do **not** pipe `console.log` into Sentry.

---

## 2. `[Obs] Wire Sentry into Trigger.dev tasks`

**Labels:** `improvement`, `tech-debt` · **Priority:** High · **Blocked by:** #1

### Summary
Extend Sentry coverage into the four tasks under
[`src/trigger/`](./src/trigger/). Today task failures only show up in
Trigger.dev's run log; nothing aggregates them with the rest of the app's
errors.

### Scope
- Init Sentry inside [`trigger.config.ts`](./trigger.config.ts) (or a shared
  helper imported by every task).
- Wrap each task's `run` with a try/`Sentry.captureException`/rethrow
  pattern, or use Sentry's task instrumentation if available for v4.
- Tag events with `task_id` and `trigger_run_id`.
- Deploy via `set -a && source .env.local && set +a && npx
  trigger.dev@latest deploy` per [`CLAUDE.md`](./CLAUDE.md).

Out of scope: silent-catch replacements (ticket #19).

### Acceptance Criteria
- [ ] Force a failure in `regenerate-report-pdf` against staging and confirm
      the event lands in Sentry with `task_id=regenerate-report-pdf` and a
      `trigger_run_id` tag.
- [ ] Trigger.dev deploy succeeds and the task continues to run end-to-end.

---

## 3. `[Refactor] Move /db to /lib/db and add repo skeleton`

**Labels:** `tech-debt`

### Summary
The guide expects [`/lib/db/`](./src/lib/db/). Today the schema and client
live at top-level [`/db/`](./src/db/). Move them (cosmetic) and add an empty
[`/lib/db/repos/`](./src/lib/db/repos/) directory plus a shared `Repo` type
so subsequent repo extractions have somewhere to land.

### Scope
- Move `src/db/index.ts` → `src/lib/db/client.ts`.
- Move `src/db/schema.ts` → `src/lib/db/schema.ts`.
- Update the 15 importers (search for `from "@/db"`).
- Add `src/lib/db/repos/` with a placeholder `index.ts` exporting nothing
  yet.

Out of scope: any query extraction (that's #4–#8).

### Acceptance Criteria
- [ ] `npm run build` passes.
- [ ] `grep -r '"@/db"' src` returns zero hits.
- [ ] No behavior change — diff is purely import-path renames + file moves.

### Notes
- Single PR, mechanical. Run `npm run build` after the move to catch
  stragglers.

---

## 4. `[DB] Extract audit-log writes into auditRepo`

**Labels:** `tech-debt` · **Blocked by:** #3

### Summary
`auditLog` writes are scattered through server actions and trigger tasks.
They all follow the same shape (actor, action, entityType, entityId,
payload) and are the smallest piece of the DB to abstract — good warm-up for
the repo pattern.

### Scope
- Create [`src/lib/db/repos/audit.ts`](./src/lib/db/repos/audit.ts) exposing
  `recordAuditEntry({ actor, action, entityType, entityId, payload, tx? })`.
- The `tx?` arg lets callers participate in an existing Drizzle transaction
  (used by `sendReport`, `markReportSent`, etc.).
- Replace every direct `tx.insert(auditLog)` and `db.insert(auditLog)` call.

Out of scope: changing what gets audited or the schema.

### Acceptance Criteria
- [ ] `grep -r "insert(auditLog)" src` returns only the new repo file.
- [ ] Existing audit entries still appear unchanged after running an
      on-demand report end-to-end.
- [ ] `npm run build` passes.

### Notes
- Touches: `reports.ts`, `clients.ts`, `runs.ts`, `schedules.ts`,
  `generate-client-report.ts`, `regenerate-report-pdf.ts`,
  `weekly-report-run.ts`.

---

## 5. `[DB] Extract schedules queries into schedulesRepo`

**Labels:** `tech-debt` · **Blocked by:** #3

### Summary
Schedules is the simplest stateful domain — one table, mirrored from
Trigger.dev. Use it to establish the repo pattern other domains will follow.

### Scope
- Create `src/lib/db/repos/schedules.ts` with functions for every query
  currently in
  [`src/server/actions/schedules.ts`](./src/server/actions/schedules.ts) and
  [`src/lib/shared/schedules.ts`](./src/lib/shared/schedules.ts).
- Return typed domain objects, not raw Drizzle rows.
- Migrate the call sites listed above to use the repo.

Out of scope: business logic (still lives in `schedules.ts` for now),
service extraction (#9), Trigger.dev SDK calls (those stay where they are).

### Acceptance Criteria
- [ ] All schedule reads/writes go through `schedulesRepo`.
- [ ] Schedule editor at `/admin/schedules` renders and edits correctly.
- [ ] `npm run build` passes.

---

## 6. `[DB] Extract runs queries into runsRepo`

**Labels:** `tech-debt` · **Blocked by:** #3

### Summary
Runs is the smallest domain by action size (72 lines in
[`runs.ts`](./src/server/actions/runs.ts)) but it's referenced from trigger
tasks too. Extracting it now unblocks the report-generation repo work.

### Scope
- Create `src/lib/db/repos/runs.ts` with: `findRunById`, `listRuns`,
  `createRun`, `updateRunStatus`, `listClientsForRun`, plus whatever else
  surfaces.
- Migrate `runs.ts` action file, page components that list runs, and
  trigger tasks that touch the runs table.

### Acceptance Criteria
- [ ] `grep -rn "from \"@/lib/db/schema\".*runs" src` outside the repo file
      returns nothing (services/tasks shouldn't import the `runs` schema
      directly anymore).
- [ ] Runs index and detail pages render with the same data shape.
- [ ] `npm run build` passes.

---

## 7. `[DB] Extract clients and projects queries into clientsRepo`

**Labels:** `tech-debt` · **Blocked by:** #3

### Summary
Bundles `clients` and `projects` since `projects` only exists scoped to a
client and is always queried alongside it. Avoids creating a near-empty
`projectsRepo`.

### Scope
- Create `src/lib/db/repos/clients.ts` covering: `listClients`,
  `findClientById`, `findClientBySlug`, `createClient`, `updateClient`,
  `archiveClient`, plus the project mutations (`addProject`, `removeProject`,
  `setProjects`).
- Migrate `clients.ts` action file, admin/clients pages, and trigger tasks
  that fetch client+project context.

### Acceptance Criteria
- [ ] Client CRUD works end-to-end through the UI.
- [ ] Disabled-client logic still excludes them from scheduled runs and
      includes them in on-demand runs.
- [ ] `npm run build` passes.

---

## 8. `[DB] Extract reports queries into reportsRepo`

**Labels:** `tech-debt` · **Blocked by:** #3, #6 (runs repo, since reports
link to runs)

### Summary
Largest domain. The repo is going to be substantial — `reports` has 396
lines of actions and a 330-line trigger task hitting it. Doing it last in
Stage B lets the smaller repos shake out the pattern first.

### Scope
- Create `src/lib/db/repos/reports.ts` covering: `findReportById`,
  `listReports`, `listReportsForRun`, `createReport`, `updateReportStatus`,
  `updateReportNarrative`, `updateReportEmail`, `updateReportPdf`,
  `deleteReport`.
- Migrate every call site (server actions, trigger tasks, page components).

### Acceptance Criteria
- [ ] No `db.*` calls referring to the `reports` table remain outside
      `reportsRepo`.
- [ ] Report list, detail, send, mark-sent, discard, narrative revise, PDF
      regenerate all still work.
- [ ] `npm run build` passes.

---

## 9. `[Service] Extract schedule business logic into scheduleService`

**Labels:** `tech-debt` · **Blocked by:** #5

### Summary
Schedule actions today do: parse form → call Trigger.dev SDK → write to
`schedulesRepo`. The middle two belong in a service so the action file
becomes a thin controller.

### Scope
- Create `src/lib/services/schedules.ts` exposing `upsertSchedule`,
  `deleteSchedule`, `listSchedules`. These take the repo and the Trigger.dev
  SDK as collaborators (injected, not imported at module top).
- Action file
  ([`src/server/actions/schedules.ts`](./src/server/actions/schedules.ts))
  parses form input, calls the service, revalidates paths.

### Acceptance Criteria
- [ ] No `await db.*` or `await client.schedules.*` calls in the action
      file.
- [ ] Schedule editor still works.
- [ ] `npm run build` passes.

---

## 10. `[Service] Extract run lifecycle into runService`

**Labels:** `tech-debt` · **Blocked by:** #6

### Summary
Runs have a clear lifecycle (`running → succeeded | failed | partial`).
Today that state machine is implicit across action and trigger code. Codify
it in a service.

### Scope
- Create `src/lib/services/runs.ts` with `startRun`, `markRunSucceeded`,
  `markRunFailed`, `markRunPartial`, `cancelRun`.
- Centralize the "what counts as partial" rule (today it's recomputed
  inline).
- Migrate callers.

### Acceptance Criteria
- [ ] State transitions only happen via `runService`.
- [ ] On-demand and weekly runs still terminate in the right state.
- [ ] `npm run build` passes.

---

## 11. `[Service] Extract client CRUD into clientService`

**Labels:** `tech-debt` · **Blocked by:** #7

### Summary
Move validation + business rules (slug uniqueness, allowed status
transitions, project re-binding) out of the action file and into a service.

### Scope
- Create `src/lib/services/clients.ts` exposing `createClient`,
  `updateClient`, `archiveClient`, `setProjects`, `listClients`.
- Each function returns a discriminated union (`{ ok: true, value } | { ok:
  false, code, message }`) so the action layer can map to UI errors without
  re-throwing.
- Move slug-collision and "can't archive while runs are in flight" checks
  here.

### Acceptance Criteria
- [ ] Client validation errors surface in the UI with the same messages.
- [ ] Action file is <100 lines.
- [ ] `npm run build` passes.

---

## 12. `[Service] Extract report send/discard/revise into reportService`

**Labels:** `tech-debt` · **Blocked by:** #8

### Summary
Carve `reports.ts` (396 lines) into a thin action file and a service. This
ticket covers the **operator-driven** actions (send, mark-sent, discard,
edit email, revise narrative, delete). Generation pipeline is ticket #13.

### Scope
- Create `src/lib/services/reports.ts` with: `sendReport`, `markReportSent`,
  `discardReport`, `updateEmailDraft`, `reviseNarrative`, `deleteReport`.
- Service depends on `reportsRepo`, `auditRepo`, the n8n client, the
  OpenRouter client, and the blob client — all injected.
- Action file becomes thin (auth check, call service, revalidate).

### Acceptance Criteria
- [ ] Every operator action on a report still works from the UI.
- [ ] `src/server/actions/reports.ts` is <120 lines.
- [ ] `npm run build` passes.

---

## 13. `[Service] Extract report-generation pipeline into reportPipelineService`

**Labels:** `tech-debt` · **Blocked by:** #8, #10

### Summary
The 330-line `generate-client-report` task does: load client → fetch GitHub
activity → call OpenRouter for narrative + email → render PDF → upload blob
→ post n8n draft → write reports + audit rows. That pipeline belongs in a
service so it can be unit-tested and the task becomes a thin orchestrator.

### Scope
- Create `src/lib/services/report-pipeline.ts` exposing
  `generateReportForClient({ clientId, weekLabel, runId, onDemand })`.
- Service depends on: `clientsRepo`, `runsRepo`, `reportsRepo`, `auditRepo`,
  octokit client, openrouter client, pdf renderer, blob client, n8n client.
- Keep the existing `GenerateClientReportPayload`/`Result` types as the
  contract.

Out of scope: changing the pipeline's behavior or order.

### Acceptance Criteria
- [ ] The service can be invoked from a Node script (e.g. a future
      `npm run pipeline:replay`) without importing Trigger.dev.
- [ ] An end-to-end on-demand run against a test client produces identical
      audit entries, report row, and PDF as before.
- [ ] `npm run build` passes.

---

## 14. `[Action] Thin server actions over services`

**Labels:** `tech-debt` · **Blocked by:** #9, #10, #11, #12

### Summary
Final pass on the action layer. After services exist, action files should
only parse form input, do the auth check, call a service, and revalidate
paths.

### Scope
- Audit every file under
  [`src/server/actions/`](./src/server/actions/) and remove any remaining
  `await db.*`, direct `Octokit/OpenRouter/n8n/blob` imports, or business
  rule code.
- Sum of all four files should be <500 lines (down from ~890 today).

### Acceptance Criteria
- [ ] `grep -rn 'await db\\.' src/server/actions` returns no hits.
- [ ] `grep -rn '@/lib/octokit\\|@/lib/openrouter\\|@/lib/n8n\\|@/lib/blob' src/server/actions`
      returns no hits.
- [ ] All operator actions still work via the UI.

---

## 15. `[Trigger] Migrate generate-client-report to reportPipelineService`

**Labels:** `tech-debt` · **Blocked by:** #13

### Summary
Replace the 330-line task body with a thin shell that wires Trigger.dev's
`payload`/`ctx` to a `reportPipelineService` call.

### Scope
- [`src/trigger/generate-client-report.ts`](./src/trigger/generate-client-report.ts)
  should drop to <50 lines.
- Trigger-specific concerns (logger, ctx, run id) stay in the task;
  everything else goes through the service.
- Deploy to Trigger.dev per [`CLAUDE.md`](./CLAUDE.md).

### Acceptance Criteria
- [ ] Task file is <50 lines.
- [ ] On-demand and weekly runs produce identical output to the
      pre-refactor version (eyeball one report end-to-end on staging).
- [ ] `npx trigger.dev@latest deploy` succeeds.

---

## 16. `[Trigger] Migrate weekly-report-run and drafted-reminder to services`

**Labels:** `tech-debt` · **Blocked by:** #10, #12

### Summary
Same treatment as #15 for the two smaller tasks.

### Scope
- [`weekly-report-run.ts`](./src/trigger/weekly-report-run.ts) calls
  `runService.startRun` + `reportPipelineService.generateReportForClient`
  per client.
- [`drafted-reminder.ts`](./src/trigger/drafted-reminder.ts) calls
  `reportService` (or a small new `reminderService`) to send the Telegram
  nudge.
- [`regenerate-report-pdf.ts`](./src/trigger/regenerate-report-pdf.ts)
  calls `reportService.regeneratePdf`.

### Acceptance Criteria
- [ ] Each task is <40 lines.
- [ ] Weekly schedule still fans out correctly.
- [ ] `npx trigger.dev@latest deploy` succeeds.

---

## 17. `[App] Replace direct db.* calls in page components with repos`

**Labels:** `tech-debt` · **Blocked by:** #5, #6, #7, #8

### Summary
Page components under [`src/app/(dashboard)/`](./src/app/(dashboard)/)
reach into `@/db` directly. Server components are still allowed to read
data — they just need to do it through repos so the schema isn't leaking
into the view layer.

### Scope
- Audit every `page.tsx` for `from "@/db"` or `from "@/lib/db"` imports.
- Replace with repo calls.
- This is a read-only pass — no write paths in pages.

### Acceptance Criteria
- [ ] `grep -rn 'from "@/lib/db"' src/app` returns no hits in `page.tsx`
      files (repo imports are fine; raw schema imports are not).
- [ ] Every dashboard page renders.

---

## 18. `[Refactor] Move external API clients under /lib/clients`

**Labels:** `tech-debt`

### Summary
[`TECH_STACK_GUIDE.md`](./TECH_STACK_GUIDE.md) §4 puts external API
wrappers under `/lib/clients/`. Today they're flat in `/lib`. Mechanical
move, run last so it doesn't churn the diffs in earlier tickets.

### Scope
- Move `src/lib/octokit.ts`, `openrouter.ts`, `pdf.ts`, `n8n.ts`,
  `telegram.ts`, `blob.ts` → `src/lib/clients/`.
- Keep [`src/lib/auth.ts`](./src/lib/auth.ts), `auth-handlers.ts`, and
  `trigger-tokens.ts` at the `/lib` root — they're app-internal, not
  external clients.
- Update all importers.

### Acceptance Criteria
- [ ] `grep -rn 'from "@/lib/octokit"' src` returns no hits.
- [ ] `npm run build` passes.

---

## 19. `[Obs] Replace silent best-effort catches with Sentry.captureException`

**Labels:** `tech-debt`, `improvement` · **Blocked by:** #2

### Summary
Several catches today swallow errors with a "best-effort" comment (example:
[`reports.ts:85-91`](./src/server/actions/reports.ts#L85-L91) on the n8n
discard call). The intent is correct — don't block the DB transition — but
without Sentry these failures are invisible.

### Scope
- Find every `catch {` and `catch (_) {` in `src/`.
- For each, decide:
  - Genuinely best-effort? Keep the comment, add `Sentry.captureException(err, { tags: { area, reason: "best-effort" } })`.
  - Should propagate? Re-throw.
  - Should fail loudly? Remove the catch.

### Acceptance Criteria
- [ ] No empty `catch {}` blocks remain.
- [ ] Each remaining best-effort catch has a Sentry capture + tag
      explaining why swallowing is intentional.
