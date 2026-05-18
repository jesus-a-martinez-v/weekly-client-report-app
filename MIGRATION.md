# Architectural refactor — Vercel-frontend / Trigger.dev-backend

## Context

The current Next.js app on Vercel mixes responsibilities: server components query Postgres directly, server actions own all business logic, external service calls (n8n, Telegram, GitHub) happen from Next.js, and Trigger.dev only handles the async report-generation pipeline. The Vercel deploy ends up being a stateful full-stack app, not a frontend.

Target: **Vercel hosts only the UI + auth boundary; Trigger.dev tasks own everything else.** The frontend communicates with the backend through Trigger.dev task invocations — server components call `task.triggerAndWait()` for SSR data, client components use `@trigger.dev/react-hooks` for mutations and realtime updates. NextAuth stays on Vercel because GitHub OAuth needs a callback route there.

Locked decisions:
- **SSR with `triggerAndWait`**: server components fetch initial data from tasks; UI feels instant.
- **One repo, clean directory split**: `src/app/**` and `src/components/**` are Vercel-only; `src/trigger/**`, `src/db/**`, and backend `src/lib/**` files are Trigger.dev-only; pure utilities live under `src/lib/shared/**` and can be imported by both sides.
- **Multi-phase migration**: four phases, each a separate session.

Reference points from Trigger.dev v3 research:
- `auth.createTriggerPublicToken({ tasks, expirationTime, multipleUse })` mints scoped tokens for browser use.
- `@trigger.dev/react-hooks` provides `useRealtimeTaskTrigger`, `useRealtimeRun`, `useRealtimeRunsWithTag`.
- Per-task overhead ≈ 200–500ms over the network. Free tier ($5/mo compute credit) more than covers a single-operator CRUD workload.

---

## Target architecture

```
Browser
   │  NextAuth session cookie
   ▼
Vercel (Next.js)
   │  • Auth.js GitHub OAuth + email allow-list   (stays here)
   │  • Pages render UI shells
   │  • Server components call task.triggerAndWait() for SSR data
   │  • Client components call useRealtimeTaskTrigger for mutations / realtime
   │  • One route mints short-lived Trigger.dev PATs from the NextAuth session
   │
   │  HTTPS (Bearer: Trigger.dev PAT)
   ▼
Trigger.dev
   • CRUD tasks (one per current server action and per current DB-reading page)
   • Pipeline tasks (already exist: generate-client-report, weekly-report-run, drafted-reminder)
   • All DB access (Drizzle + postgres-js)
   • All external services (Octokit, OpenRouter, Puppeteer, Vercel Blob, n8n, Telegram)
   • Audit-log writes
   │
   ▼
Postgres (VM)   n8n (VM)   OpenRouter   GitHub   Telegram   Vercel Blob
```

The Vercel side ends up importing only: NextAuth, React, `@trigger.dev/sdk` (for `triggerAndWait` + `auth.createTriggerPublicToken`), `@trigger.dev/react-hooks`, Tailwind, `marked`, and pure utility modules. **Zero** imports of `@/db`, `@/lib/octokit`, `@/lib/openrouter`, `@/lib/pdf`, `@/lib/blob`, `@/lib/n8n`, `@/lib/telegram` from anything under `src/app/**` or `src/components/**`.

---

## Repository structure (final state)

```
src/
├── app/                            # Vercel-only
│   ├── (auth)/                     # signin, forbidden — unchanged
│   ├── (dashboard)/                # all pages call Trigger.dev tasks
│   ├── api/auth/[...nextauth]/     # NextAuth route — unchanged
│   └── api/trigger/token/          # NEW: mints short-lived PATs
├── components/                     # Vercel-only UI components
│   └── trigger-provider.tsx        # NEW: React context for the PAT
├── lib/
│   ├── auth.ts                     # NextAuth config — unchanged
│   ├── auth-handlers.ts            # unchanged
│   ├── trigger-tokens.ts           # NEW: PAT minting (server-only)
│   ├── shared/                     # NEW: pure utilities used by both sides
│   │   ├── window.ts               # moved from src/lib/window.ts
│   │   ├── audit.ts                # moved from src/lib/audit.ts
│   │   ├── schedules.ts            # moved from src/lib/schedules.ts
│   │   ├── pdf-template.ts         # moved from src/lib/pdf-template.ts
│   │   └── validation/             # moved from src/lib/validation/
│   ├── n8n.ts                      # Trigger.dev-only
│   ├── octokit.ts                  # Trigger.dev-only
│   ├── openrouter.ts               # Trigger.dev-only
│   ├── pdf.ts                      # Trigger.dev-only
│   ├── blob.ts                     # Trigger.dev-only
│   └── telegram.ts                 # Trigger.dev-only
├── db/                             # Trigger.dev-only (schema + client)
├── server/                         # DELETED entirely at end of Phase D
└── trigger/
    ├── generate-client-report.ts   # existing
    ├── weekly-report-run.ts        # existing
    ├── drafted-reminder.ts         # existing
    ├── api/                        # NEW: CRUD-style task files
    │   ├── clients.ts              # list/get/create/update/toggleStatus/delete
    │   ├── reports.ts              # list/get/send/discard/updateEmail/triggerOnDemand
    │   ├── runs.ts                 # list/get
    │   ├── schedules.ts            # list/upsert/delete/deleteUnmanaged
    │   └── audit.ts                # listForReport
    └── index.ts                    # barrel re-export of task refs for typed imports
```

---

## Phase A — Foundation (one session)

Goal: stand up the auth+PAT bridge and reorganize shared utilities. No behavior changes yet; everything keeps working.

**New files:**
- `src/lib/trigger-tokens.ts` — server-only helper exporting `mintOperatorToken()` that:
  1. Calls `auth()` from `src/lib/auth.ts` to require a logged-in operator.
  2. Returns `await auth.createTriggerPublicToken({ tasks: [...allTaskIds], expirationTime: "30min", multipleUse: true })`.
  3. The full task-id list is read from a `TASK_IDS` constant exported from `src/trigger/api/index.ts` (created here as a stub returning `[]`; populated as Phase B adds tasks).
- `src/app/api/trigger/token/route.ts` — `GET` returns `{ token, expiresAt }` JSON, calls `mintOperatorToken()`, gated by NextAuth (returns 401 if no session).
- `src/components/trigger-provider.tsx` — client component context. Wraps children, fetches `/api/trigger/token` on mount, auto-refreshes every 20 minutes, exposes `useTriggerToken()` hook. Drop-in for the dashboard layout.
- `src/trigger/api/index.ts` — empty barrel exporting `TASK_IDS = [] as const` and (later) all task refs.

**Reorganizations:**
- `mv src/lib/window.ts src/lib/shared/window.ts`
- `mv src/lib/audit.ts src/lib/shared/audit.ts`
- `mv src/lib/schedules.ts src/lib/shared/schedules.ts`
- `mv src/lib/pdf-template.ts src/lib/shared/pdf-template.ts`
- `mv src/lib/validation src/lib/shared/validation`
- Update all imports across the codebase (`@/lib/window` → `@/lib/shared/window`, etc.).

**Modify:**
- `src/app/(dashboard)/layout.tsx` — wrap children in `<TriggerProvider>`.
- `package.json` — add `@trigger.dev/react-hooks` dependency.
- `.env.example` — no new vars; `TRIGGER_SECRET_KEY` already documented.

**Verification:**
- `npm run build` clean (no behavior changes).
- Log into the app, hit `/api/trigger/token` from devtools, confirm a JSON token comes back.
- Logged-out request to `/api/trigger/token` returns 401.

---

## Phase B — Backend CRUD tasks (one session, biggest)

Goal: every server action and every server-component DB query gets a one-for-one Trigger.dev task. Frontend doesn't use them yet.

**Pattern per task** (define inside `src/trigger/api/*.ts`):

```ts
export const listClients = task({
  id: "api.clients.list",
  run: async (payload: ListClientsInput) => {
    const rows = await db.select(...).from(clients)...;
    return { clients: rows };
  },
});
```

Each task:
- Uses `task()` from `@trigger.dev/sdk/v3` (not `schedules.task`).
- ID format: `api.{resource}.{verb}` for clear telemetry grouping.
- Validates input with Zod (reuse schemas from `src/lib/shared/validation/`).
- Writes audit-log entries internally where the old server action did.
- Returns JSON-serializable output (`{ data: ... }` or `{ ok: true }`).
- Actor email for audit: read `process.env.ADMIN_EMAIL` directly (single-operator app — no need to thread actor through the payload).

**Tasks to create** (mirrors the codebase inventory):

| File | Task IDs | Replaces |
|---|---|---|
| `src/trigger/api/clients.ts` | `api.clients.list`, `api.clients.get`, `api.clients.create`, `api.clients.update`, `api.clients.toggleStatus`, `api.clients.delete` | `src/server/actions/clients.ts` + DB reads in `src/app/(dashboard)/admin/clients/page.tsx` and `[id]/page.tsx` |
| `src/trigger/api/reports.ts` | `api.reports.list`, `api.reports.get`, `api.reports.send`, `api.reports.discard`, `api.reports.updateEmail`, `api.reports.triggerOnDemand` | `src/server/actions/reports.ts` + DB reads in `src/app/(dashboard)/reports/page.tsx` and `[id]/page.tsx`. `triggerOnDemand` internally calls `generateClientReport.trigger(...)` |
| `src/trigger/api/runs.ts` | `api.runs.list`, `api.runs.get` | DB reads in `src/app/(dashboard)/runs/page.tsx` and `[id]/page.tsx` |
| `src/trigger/api/schedules.ts` | `api.schedules.list`, `api.schedules.upsert`, `api.schedules.delete`, `api.schedules.deleteUnmanaged` | `src/server/actions/schedules.ts` (entire file moves) |
| `src/trigger/api/audit.ts` | `api.audit.listForReport` | DB read in `src/app/(dashboard)/reports/[id]/page.tsx` |

**Update:**
- `src/trigger/api/index.ts` — re-export every task and `TASK_IDS` array.
- `src/lib/trigger-tokens.ts` — `mintOperatorToken` now passes the full `TASK_IDS` list to `createTriggerPublicToken`.

**Existing tasks unchanged**: `generate-client-report.ts`, `weekly-report-run.ts`, `drafted-reminder.ts` — they keep doing their pipeline work.

**Deploy step at end of phase:**
```bash
npx trigger.dev@latest deploy
```
After deploy, sanity-check by triggering one task from the Trigger.dev dashboard (e.g. `api.clients.list`) and confirming it returns rows.

**Verification:**
- All tasks listed in the Trigger.dev dashboard after deploy.
- Trigger one of each via the dashboard, confirm:
  - Reads return data.
  - Mutations affect the DB.
  - Audit-log rows show up with `actorEmail = ADMIN_EMAIL`.
- `npm run build` still clean (no Next.js code changed yet — both old and new paths coexist).

---

## Phase C — Frontend migration (one session, page by page)

Goal: rewrite every page and form to use Trigger.dev tasks. Server actions still exist but are dead code by end of phase.

**Pattern per page** (server component):

```ts
import { tasks } from "@trigger.dev/sdk/v3";
import { listClients } from "@/trigger/api";   // type-only import via barrel

export default async function Page() {
  const run = await tasks.triggerAndWait<typeof listClients>(
    "api.clients.list",
    { /* payload */ },
  );
  if (!run.ok) throw new Error(run.error);
  return <ClientsTable rows={run.output.clients} />;
}
```

**Pattern per form** (client component):

```ts
'use client';
import { useRealtimeTaskTrigger } from "@trigger.dev/react-hooks";
import { useTriggerToken } from "@/components/trigger-provider";

export function CreateClientForm() {
  const token = useTriggerToken();
  const { submit, run, isLoading } = useRealtimeTaskTrigger("api.clients.create", {
    accessToken: token,
    onComplete: () => router.refresh(),
  });
  // ...
}
```

**Pattern for in-flight progress** (replaces `src/components/auto-refresh.tsx` polling pattern):

```ts
import { useRealtimeRun } from "@trigger.dev/react-hooks";
const { run } = useRealtimeRun(triggerRunId, { accessToken: token });
// re-render as run.metadata / run.output updates
```

**Migration order** (smallest blast radius first):

1. `/admin/clients` — list, detail, new, status toggle, delete. Replace `src/components/client-form.tsx` submit path.
2. `/on-demand` — uses `api.clients.list` + `api.reports.triggerOnDemand`.
3. `/admin/schedules` — replace `src/app/(dashboard)/admin/schedules/schedule-card.tsx` actions, server component fetch.
4. `/runs` and `/runs/[id]` — fetch via tasks; swap `src/components/auto-refresh.tsx` for `useRealtimeRun(triggerRunId)` on in-flight runs.
5. `/reports` and `/reports/[id]` — biggest page. Email editor calls `api.reports.updateEmail`. Send/discard buttons call `api.reports.send` / `api.reports.discard`. The audit timeline gets its data from `api.audit.listForReport`. In-flight reports use `useRealtimeRun(report.triggerRunId)` for live status, replacing the existing polling.
6. Sidebar/layout — only touched for the `<TriggerProvider>` already added in Phase A.

**Files modified/replaced per page:**
- Every `page.tsx` under `(dashboard)/`: drop `import { db }` and DB queries; add `tasks.triggerAndWait`.
- Every form component: drop `action={serverAction}`; add `useRealtimeTaskTrigger`.

**Verification:**
- Walk every page in the browser. Confirm:
  - Initial render shows data (no spinner).
  - Forms work, see toast/redirect on success.
  - Mutations show up in Trigger.dev dashboard as runs.
  - In-flight reports update in realtime when triggered.
- Check Vercel function logs — no Postgres connections from the Vercel-side runtime.

---

## Phase D — Cleanup + deploy (one session)

Goal: delete the dead code path, lock in the boundary, ship.

**Delete:**
- `src/server/actions/` — entire directory.
- Any remaining `import { db }` from anything under `src/app/**` or `src/components/**` (lint check: grep should return zero hits).
- Any remaining import of `@/lib/{n8n,octokit,openrouter,pdf,blob,telegram}` from `src/app/**` or `src/components/**`.

**Modify:**
- `CLAUDE.md` — add an "Architecture" section describing the Vercel/Trigger.dev split, the PAT flow, and that any new feature must add a Trigger.dev task before touching the UI.
- `README.md` (if exists) — same.
- `scripts/audit-public.sh` — adjust paths if it referenced any moved files; otherwise no change.

**Deploy:**
1. Push the branch and verify CI / build is green.
2. `npx trigger.dev@latest deploy` (deploys updated tasks).
3. `vercel --prod` (deploys the Next.js app). Vercel auto-detects Next.js; no `vercel.json` needed.
4. Set Vercel env vars (one-time):
   - `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF`
   - `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `ADMIN_EMAIL`
   - `APP_BASE_URL` (the production Vercel URL)
   - `APP_DISPLAY_NAME`
   - NOT NEEDED on Vercel: `DATABASE_URL`, `OPENROUTER_*`, `GITHUB_PAT`, `BLOB_*`, `N8N_*`, `TELEGRAM_*`, `NARRATIVE_PROMPT*`, `REPORT_SENDER_NAME`, `REMINDER_THRESHOLD_HOURS`, `PUPPETEER_*`, `SEED_CLIENTS_PATH` — these all live in the Trigger.dev project.
5. Update GitHub OAuth callback URL on the GitHub app to `https://<vercel-domain>/api/auth/callback/github`.

**Verification (end-to-end):**
- Log in via GitHub.
- Open every page; confirm data renders.
- Create a test client → confirm new row appears via task run in Trigger.dev dashboard.
- Trigger an on-demand report → watch realtime status updates on `/reports/[id]`.
- Toggle a schedule active/inactive at `/admin/schedules`.
- Verify the audit timeline shows the new operator actions.
- Run on local dev: `npm run lint && npm run build && npm run audit:public`.

---

## Critical files (cross-phase reference)

**Phase A scaffolding:**
- `src/lib/trigger-tokens.ts` — PAT minting
- `src/app/api/trigger/token/route.ts` — PAT endpoint
- `src/components/trigger-provider.tsx` — token context
- `src/trigger/api/index.ts` — task barrel
- `src/app/(dashboard)/layout.tsx` — wrap with provider

**Phase B tasks (new):**
- `src/trigger/api/clients.ts`
- `src/trigger/api/reports.ts`
- `src/trigger/api/runs.ts`
- `src/trigger/api/schedules.ts`
- `src/trigger/api/audit.ts`

**Reused existing code (moves into tasks):**
- DB layer: `src/db/index.ts`, `src/db/schema.ts`
- Backend services: `src/lib/n8n.ts`, `src/lib/octokit.ts`, `src/lib/openrouter.ts`, `src/lib/pdf.ts`, `src/lib/blob.ts`, `src/lib/telegram.ts`
- Pipeline tasks (unchanged): `src/trigger/generate-client-report.ts`, `src/trigger/weekly-report-run.ts`, `src/trigger/drafted-reminder.ts`
- Shared utilities (moved to `src/lib/shared/`): window, audit, schedules, pdf-template, validation

---

## Risks and tradeoffs

- **Page latency**: every Vercel page-load fires a Trigger.dev task (200–500ms overhead vs ~50ms with direct DB). For a solo admin tool used a few times a day this is fine; consciously accepting the tradeoff in exchange for clean separation.
- **PAT expiry**: 30-minute tokens with 20-minute auto-refresh from `<TriggerProvider>`. If the tab is open >30 min without focus the next mutation could fail; the realtime hooks bubble the error and the auto-refresh retries.
- **In-between state during migration**: Phases B and C can be done in either order safely — Phase B adds tasks without breaking anything; Phase C swaps the frontend without breaking tasks. Phase D cleanup is the only destructive step and should land last.
- **`triggerAndWait` quota**: server-component calls count against the per-project run quota. Free tier is comfortable for solo usage (~hundreds of CRUD ops/day fits well under the $5/mo credit).
- **Vendor coupling**: deeper Trigger.dev coupling than before. Acceptable since the existing pipeline is already deeply integrated and there's no plan to migrate away.
