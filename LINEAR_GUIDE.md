
# LINEAR GUIDE FOR AI DEV AGENTS

Use this guide every session. No exceptions.

---

## 1. CORE PRINCIPLES

- **Linear Issues** — source of truth. Every task, bug, and decision lives here.

> **No issue, no work.** Never write code or make changes without a corresponding open Linear issue.

Linear-specific notes:
- Every issue has a stable identifier like `ENG-123` (team prefix + number). Always reference issues by this ID.
- Workflow states drive intent: `Backlog → Todo → In Progress → In Review → Done` (or `Canceled`/`Duplicate`). The state is the status — never describe progress in prose when a state change communicates it.

---

## 2. INITIALIZATION — BEFORE EVERY TASK

Run this sequence before any planning or implementation:

1. **Search** — use `list_issues` (filter by team, state, and keywords) to check if a matching issue already exists. Match by title, area, and intent.
2. **Not found** → Create it (see Section 3).
3. **Found** → Update scope/criteria if needed, add a comment on what you're about to do and why.
4. **Move to `In Progress`** — set the workflow state on the issue before touching code.
5. **Create a branch** — use Linear's suggested branch name (Copy git branch name) or follow the format `<username>/<issue-id>-<short-slug>` (e.g. `jesus/eng-42-add-users-index`). The issue ID in the branch name lets Linear auto-link the PR. Never work directly on `main`.
6. **Comment the branch name** on the issue (covered in Section 4).

Applies to all tasks — including small changes and quick fixes.

---

## 3. ISSUE RULES

### Scope — Atomic Tasks Only
One issue = one concrete, independently completable outcome. If you can't describe the done state in one sentence, break it down further — use **sub-issues** for natural decomposition under a parent.

**❌ Too broad:** `[Auth] Build login feature` · `[DB] Design schema`

**✅ Correctly scoped:** `[DB] Create users table` · `[Auth] Implement POST /auth/login` · `[Auth] Add auth middleware`

### Title Format
`[Area] Action-oriented description`
- `[DB] Add index on users.email`
- `[API] Fix race condition in user upsert`

Do not include the Linear ID in the title — Linear assigns it automatically.

### Body Template
```
## Summary
What this is and why it matters.

## Scope
- What's included.
- What's explicitly out of scope (if relevant).

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Notes
Constraints, relevant files, links.
```

### Metadata
- **Team** — the correct team prefix (e.g. `ENG`, `OPS`). Never create cross-team issues without confirming.
- **Labels** — most specific default label that fits (see Section 7). Multiple labels are allowed when meaningful.
- **Priority** — set explicitly (`Urgent`, `High`, `Medium`, `Low`, or `No priority`). Default to `Medium` unless told otherwise.
- **Estimate** — assign a point value if the team uses estimation. Skip if the team does not.
- **Project** — attach to the active project if the work is part of a larger initiative (see Section 8).
- **Cycle** — assign to the current cycle if the team runs cycles and the work is planned for it. Do not pull work into a cycle unilaterally — confirm first.
- **Parent issue** — link to the parent if this is a sub-issue.
- **Assignee** — always assign to `jesus-a-martinez-v` (or the equivalent Linear username); no exceptions.

---

## 4. UPDATING ISSUES

Update whenever:
- **Starting work** — move to `In Progress`, create the branch (see Section 2, step 5), then comment with the branch name.
- **Scope changes** — edit the body; never silently widen or shrink scope.
- **Blocked** — move state back to `Todo` or apply the `blocked` label, then comment explaining the blocker. If another issue is the blocker, add a **Blocked by** relationship.
- **Subtask done** — check off the acceptance criterion in the body (or close the sub-issue).
- **Related issue found** — add a **Related** or **Blocked by** relationship (Linear's native links, not free-text references).
- **Ready for review** — move to `In Review` when the PR is opened.

If work is paused or abandoned, move back to `Todo` (paused) or `Canceled` (abandoned) and leave a comment explaining why.

---

## 5. CLOSING ISSUES

Close only when all acceptance criteria are met and work is merged or verified.

1. Check off every acceptance criterion in the issue body.
2. Add a closing comment summarizing what was done.
3. Confirm the PR is linked to the issue (auto-linked via branch name or `Fixes ENG-N` magic word).
4. Move the issue state to `Done` (Linear will do this automatically on PR merge if the integration is wired up — verify it happened).

Never close speculatively. Incomplete work = issue stays open in `Todo` or `In Progress`.

If the issue is invalid, a duplicate, or won't be done, set the state to `Canceled` or `Duplicate` (link the canonical issue) rather than `Done`.

---

## 6. PULL REQUESTS

Every issue branch **must** be merged into `main` via a PR — never push directly to `main`. Create a PR as soon as a branch has reviewable code. Use **Draft PR** if not complete.

**Title:** `[Area] Short description` (same format as issues; include the Linear ID prefix, e.g. `[API] ENG-42: Add users index`, so it surfaces in the Linear sidebar).

**Body:**
```
## What
What this PR does.

## Why
Fixes ENG-<issue_number>

## How
Key implementation decisions.

## Testing
What was tested and what the reviewer should verify.

## Checklist
- [ ] Self-reviewed
- [ ] Tests added/updated
- [ ] Docs updated if needed
- [ ] No unrelated changes
```

**Magic words** (auto-link and auto-close the issue on merge via Linear's GitHub integration):
- `Fixes ENG-N`
- `Closes ENG-N`
- `Resolves ENG-N`
- `Ref ENG-N` — link without closing

Use the full team-prefixed ID (`ENG-N`, not `#N`). A correctly named branch (`<user>/eng-N-slug`) also auto-links the PR.

---

## 7. LABELS

| Label | Use when |
|---|---|
| `bug` | Something is broken |
| `feature` | New functionality |
| `improvement` | Enhancement to existing functionality |
| `documentation` | Docs missing or incorrect |
| `blocked` | Cannot proceed without external input |
| `question` | Needs clarification before work starts |
| `duplicate` | Same as an existing issue (also set state to `Duplicate`) |
| `wontfix` | Acknowledged but intentionally skipped (also set state to `Canceled`) |
| `tech-debt` | Cleanup or refactor with no user-visible behavior change |

Add team-specific labels (e.g. `area/api`, `area/db`) when the team uses them. Do not invent new labels unilaterally — confirm with the user first.

---

## 8. PROJECTS AND CYCLES

Linear has two grouping concepts; do not confuse them:

- **Project** — a multi-issue initiative with a goal and a target date (e.g. "Q3 Billing Rewrite"). Issues stay attached for the life of the initiative.
- **Cycle** — a time-boxed sprint (typically 1–2 weeks). Issues enter a cycle when planned for that window.

Rules:
- Attach to the active project at issue creation if the work clearly belongs to it. Use `list_projects` to check.
- Assign to the current cycle only when the work is committed to that cycle. Use `list_cycles` to check.
- **Never create a project or cycle unilaterally** — confirm with the user first.

---

## 9. SESSION CHECKLIST

**Start:**
- [ ] Review assigned and `In Progress` issues (`list_issues` filtered by assignee and active state).
- [ ] Run Initialization (Section 2) for each task you'll work on.

**During:**
- [ ] Create issues for anything new.
- [ ] Keep workflow state accurate as work progresses.

**End:**
- [ ] Comment progress on every issue touched.
- [ ] Move completed issues to `Done`.
- [ ] Move blocked issues back to `Todo`, apply `blocked` label, and explain the blocker.

---

## 10. MCP OPERATIONS REFERENCE

Exact tool names depend on the Linear MCP server in use; the operations below are the canonical set.

| Operation | When |
|---|---|
| `list_issues` | Session start, initialization search (filter by team, state, assignee, label) |
| `get_issue` | Before updating an issue, to read current state and relationships |
| `create_issue` | New task identified |
| `update_issue` | Scope, labels, priority, state, project, cycle, parent changes |
| `create_comment` | Progress, blockers, start/close notes |
| `list_projects` | Before attaching an issue to a project |
| `list_cycles` | Before assigning an issue to a cycle |
| `list_teams` | When unsure which team prefix to use |
| `list_users` | When confirming an assignee handle |
| `create_issue_relation` | Add `Blocked by` / `Related` links between issues |