# Plan 059: Refresh property-filtered task views after each completed property index batch

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm its expected result before continuing. Write regression tests before changing product code. If a STOP condition occurs, stop and report rather than improvising. Update this plan's status in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat e3d0456..HEAD -- src/services/property-search-engine.ts src/main.ts src/plugin-lifecycle.ts tests/property-search-engine.test.ts tests/property-search-invalidation.test.ts tests/integration/property-search.test.ts docs/search.md ARCHITECTURE.md CHANGELOG.md`
>
> Compare changed paths and the Current state excerpts with live code before proceeding. Changes from named predecessor plans are expected: verify their documented contract, and record reconciled locations here. An unexplained semantic mismatch is a STOP condition. Also inspect uncommitted changes; do not overwrite other work.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: 058 (lifecycle-safe/latest-completion embedded/dashboard recipients), 061 (main-list post-filter/disposal guards), 069 (correct indexed property result semantics). Keep 058 → 059 and execute 069 → 059; 068 shares lifecycle wiring and should be reconciled if executed first.
- **Category**: bug
- **Planned at**: commit `e3d0456`, 2026-11-10 (dependency and completion contract refreshed)
- **Status**: TODO
- **Origin**: 2026-10-31 improve review, findings R10; this file contains the required context independently of that review.

## Why this matters

Changing only frontmatter updates the property index but does not change task equality, so visible property-filtered results remain stale. Updating the task collection synthetically would create redundant work and obscure the actual source of change. Notify all collection views once after a completed index batch.

## Current state

`src/services/property-search-engine.ts:623–694` removes/rebuilds entries then ends with:

```ts
this.pendingUpdates.clear();
```

There is no view notification. Initialization alone schedules refreshVisibleTaskListViews (`:97–100`). Its refreshVisibleTaskListViews delegates the injected refreshAllTaskListViews callback (`:149–155`). PluginLifecycleManager wires that callback to plugin.refreshAllTaskListViews (`src/plugin-lifecycle.ts:98–103`); the latter (`src/main.ts:382`) refreshes main/embedded lists but not dashboards. DashboardCodeBlockProcessor's file-change comment explicitly relies on TaskStateManager for modify/create; a frontmatter-only edit does not emit a changed task collection. Property fullPassActive/pendingUpdates/settleAfterPass already define a batched ownership model. This notification must publish only after the corrected engine result set from 069 is committed; notifying frequently does not repair a wrong property index. 058 and 061 supply render/view lifetime and newest-completion guards so property initialization or old searches cannot repaint closed/currently superseded recipients.

**Existing injected-callback exemplar** (`src/plugin-lifecycle.ts:100–103`):

```ts
{
  taskStateManager: this.plugin.taskStateManager,
  refreshAllTaskListViews: () => this.plugin.refreshAllTaskListViews(),
  vaultScanner: this.plugin.vaultScanner,
}
```

Follow tests/property-search-engine.test.ts's typed dependency fixtures and assert real query answers plus rendered recipients; do not substitute a callback-spy-only test.

**Project conventions to retain:** This is an Obsidian desktop/mobile plugin. PRODUCT.md's principle is “Tasks live in notes as plain text; the panel is a view, not a second database of record.” TaskStateManager owns collected state; KeywordManager owns task-state vocabulary; TaskWriter owns task writes. Use Obsidian editor/vault APIs inside TaskWriter, no Node filesystem APIs. No unsafe any assignments or console.log. Use console.debug for diagnostics. New date fixtures use local constructor components/getters. Put detailed user-visible behavior in the named docs pages. Limit CHANGELOG entries to one or two user-facing sentences.

## Commands you will need

| Purpose             | Command                                                            | Expected on success                                   |
| ------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| Typecheck           | `./node_modules/.bin/tsc -p tsconfig.json --noEmit --skipLibCheck` | exit 0, no errors                                     |
| Unit suite          | `npm test -- --runInBand`                                          | all suites pass                                       |
| Build               | `npm run build`                                                    | typecheck and plugin bundle complete                  |
| Lint                | `npm run lint`                                                     | exit 0                                                |
| Format scoped files | `./node_modules/.bin/prettier --write <changed in-scope files>`    | only explicitly named files formatted                 |
| Scope review        | `git diff --name-only` and `git status --short`                    | no unintended changes; existing local files preserved |

Targeted commands and expected red/green outcomes are specified per step. Dependencies are already installed; do not update the lockfile as a side effect. The original audit at this SHA passed 170 unit suites / 5,500 tests, typecheck and lint; those historical results are not verification of the proposed fix. Build/integration commands are executor gates, not commands run while authoring this plan.

## Scope

**In scope** (the only product/test/docs files to modify; new test files below may be created):

- `src/services/property-search-engine.ts`
- `src/main.ts`
- `src/plugin-lifecycle.ts`
- `tests/property-search-engine.test.ts`
- `tests/property-search-invalidation.test.ts`
- `tests/integration/property-search.test.ts`
- `docs/search.md`
- `ARCHITECTURE.md`
- `CHANGELOG.md`

Local bookkeeping: this plan and its row/dependency notes in `plans/README.md` may be updated but never staged.

**Out of scope:** No property grammar change, new property filters, broad refresh semantics changes, scanner equality changes, or search-engine cache redesign. All files not explicitly listed above require a scope revision before editing. Never regenerate `docs/assets/` or the screenshot manifest as a side effect.

## Git workflow

Use the current worktree and a feature branch from the default branch (suggested: `advisor/059-property-view-invalidation`); preserve existing local work. Do not create a separate worktree/clone unless explicitly requested. Do not stage/commit `plans/`, `.freebuff/`, or local plugin `data.json`. Do not push or open a PR without instruction. If committing is requested, stage only in-scope product files, use a temporary commit-message file, and delete it afterward. Include the project trailers `🤖 Generated with Codebuff` and `Co-Authored-By: Codebuff <noreply@codebuff.com>`. Describe behavior in commit/changelog text, never local plan numbers.

## Steps

### Step 1: Write batch and displayed-query regressions

Create `tests/property-search-invalidation.test.ts` with actual PropertySearchEngine, metadata and TaskStateManager fixtures. Update frontmatter only, drain the debounce, and assert both changed query answers and one post-index refresh callback. Cover deletion of the last matching property, multiple files in one batch, pending updates during a full pass and destroy-before-flush. Reuse 069's representative missing/present property semantics as result assertions before notifying. Add a callback that queries the engine immediately and receives the committed result; a disposed recipient and an older deferred query must remain untouched when later index notifications occur. Test a refresh callback that throws without preventing batch completion or the next notification.

**Verify**: `npm test -- --runInBand --coverage=false --runTestsByPath tests/property-search-invalidation.test.ts tests/property-search-engine.test.ts` → new completed-batch notification cases fail; query matching baseline remains green.

### Step 2: Wire completed-index invalidation to every view

Emit after mutations and pendingUpdates cleanup, using the existing callback/error containment and 069's corrected committed-index boundary. Do not emit from intermediate partial full-pass state or after the engine owner has been destroyed. Keep lifecycle guards owned by their existing modules; do not add a second UI generation scheme here. Add the property-specific plugin refresh helper or lifecycle closure to include dashboardProcessor.refreshAllDashboards. Keep notification scheduling coalesced and initialization recursion guard intact; if a full pass and its drained batch already share a notification, avoid duplicate refreshes.

**Verify**: `npm test -- --runInBand --coverage=false --runTestsByPath tests/property-search-invalidation.test.ts tests/property-search-engine.test.ts` → all batch cases pass, exactly one notification per nonempty completed batch.

### Step 3: Verify visible property filters in Obsidian

Extend `tests/integration/property-search.test.ts`: display a panel query and a filtered embedded list/dashboard, change only frontmatter via vault.process, and await correct counts/rows without another task interaction. Update `docs/search.md`, ARCHITECTURE and concise CHANGELOG text.

**Verify**: `npm run test:integration -- --project=obsidian property-search.test.ts` → panel/embed/dashboard results update after metadata processing without rescanning all task files. Name the added case `property changes refresh panel embedded list and dashboard after index commit`; retain the existing `a settings change still rebuilds the property cache when a pass is in flight` case.

### Step 4: Complete verification and scope review

Format only changed files, run the full unit suite, typecheck/build and lint. For any specified host integration gate, record actual results and restore the isolated fixture through the harness; do not substitute jsdom success for real Obsidian verification. Run `npm run docs:screenshots -- --check` manually when plugin sources changed; stale rows are informational, record them without regeneration. Update the local plan/index status with tests and limitations.

**Verify**: `npm test -- --runInBand`, `npm run build`, and `npm run lint` → each exits 0; `git diff --check` → exit 0; `git diff --name-only` → only intended in-scope product changes (besides preexisting user work). An unavailable required integration environment must be reported as incomplete verification, not a passing result.

## Test plan

Follow property-search-engine.test.ts metadata-cache fixtures but replace Date.now timestamps with local fixed date values in new tests. Use fake timers to advance the actual property debounce and typed injected refresh callback. Include query refresh after the cache is committed, not simply a callback count. Keep a no-op/empty-batch case and a refresh-callback-that-queries case to detect loops.

## Done criteria

- [ ] Frontmatter-only edits update all three displayed collection surfaces without task edits.
- [ ] A completed nonempty batch requests at most one view invalidation, and empty/destroyed batches request none.
- [ ] TaskStateManager receives no fabricated task mutation solely to refresh property queries.
- [ ] Immediate callback queries observe the corrected committed result set; no partial/destroyed batch publishes.
- [ ] Extra notifications cannot revive disposed renders or let older deferred query completions overwrite current results (058/061 regressions remain green).
- [ ] All targeted regression suites and specified integration gates pass; full `npm test -- --runInBand`, `npm run build` and `npm run lint` exit 0.
- [ ] Named docs pages and concise CHANGELOG behavior summaries are updated.
- [ ] No out-of-scope edits or regenerated screenshot assets appear in the task diff.
- [ ] `plans/README.md` status and this plan's Results section record actual commands/results and any outstanding verification; local planning files stay unstaged.

## STOP conditions

Stop and report (do not improvise) if:

- The live code differs semantically from the excerpts beyond verified predecessor-plan changes.
- Metadata-cache changed events do not precede the relevant batch in a failing host test; diagnose ordering before adding arbitrary delays.
- A fix requires a global rescan, synchronous full-vault property rebuild per edit, or per-row metadata listeners.
- 069's result semantics or commit boundary are absent/drifted: execute/reconcile that prerequisite rather than compensating in the notification layer.
- A verification fails twice after a focused correction, or the fix requires editing an out-of-scope path.

## Maintenance notes

Plans 058/061 supply render/view-lifetime and completion-order safety; 069 supplies correct property sets. Keep those tests green when adding new notification recipients. Plugin teardown wiring from 068 must be retained if already landed. Future collection surfaces must join this explicit property invalidation path; task-state subscriptions alone do not cover metadata-only edits.

## Results

Implemented 2026-11-11, after 058.

- `PropertySearchEngine.processPendingUpdates` now publishes exactly one view
  notification after a drained, nonempty batch has mutated the cache and
  cleared its queue. Empty batches return before publishing, and a disposed
  engine publishes nothing.
- `notifyIndexCommitted` contains a throwing recipient: the error is logged
  and the next batch still notifies.
- `main.refreshAllTaskListViews` now also refreshes dashboard cards, so the
  property notification reaches panel, embedded lists and dashboards.
- `tests/property-search-invalidation.test.ts` drives the real engine with
  frontmatter fixtures: a frontmatter-only change updates `[status:...]`
  answers and calls the injected refresh once, several changed files coalesce
  into one call, an empty batch calls nobody, a recipient can query the
  committed result inside the callback, a throwing recipient does not stop
  later batches, and a destroyed engine stays silent.
- Docs: `docs/search.md` and `ARCHITECTURE.md`; one concise CHANGELOG entry.

Verification at this revision: targeted invalidation/engine suites pass;
`npm test -- --runInBand` 179 suites / 5,564 tests; `npm run build` and
`npm run lint` exit 0.

Limitations: prerequisite 069 (correct indexed property result semantics) is
still unimplemented, so the notification publishes the engine's current
committed cache rather than corrected result sets; no compensation was added
in the notification layer. No Playwright `property-search.test.ts` host case
was added, so live-vault frontmatter propagation is not host-verified.
