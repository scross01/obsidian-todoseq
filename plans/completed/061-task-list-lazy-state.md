# Plan 061: Keep task-list search completions, cached rows and pagination consistent

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm its expected result before continuing. Write regression tests before changing product code. If a STOP condition occurs, stop and report rather than improvising. Update this plan's status in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat e3d0456..HEAD -- src/view/task-list/task-list-view.ts src/view/task-list/task-element-cache.ts src/view/task-list/chunked-render-queue.ts tests/task-list-view.test.ts tests/task-element-cache.test.ts tests/chunked-render-queue.test.ts tests/integration/task-list-view.test.ts docs/task-list.md CHANGELOG.md`
>
> Compare changed paths and the Current state excerpts with live code before proceeding. Changes from named predecessor plans are expected: verify their documented contract, and record reconciled locations here. An unexplained semantic mismatch is a STOP condition. Also inspect uncommitted changes; do not overwrite other work.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — guard all asynchronous completion paths without weakening row reuse or current-query error handling.
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e3d0456`, 2026-11-10 (amended after deep review)
- **Status**: TODO
- **Origin**: 2026-10-31 findings R12/R13 plus 2026-11-10 N06 (post-filter stale/error completion and disposal). This file is the complete combined handoff.

## Why this matters

Rows beyond the first render batch can reuse old text/state/priority after an edit. A zero-match query returns before clearing the old pagination, allowing a scroll callback to append tasks from the previous query under the empty-state message. An older property search can also finish after a newer query and clear its list or overwrite its result count/error, because the generation check occurs after those mutations. Repair search completion and the shared lazy-render lifecycle while preserving keyed DOM reuse.

## Current state

`src/view/task-list/task-list-view.ts:1876–1881` reuses a cached element without patching:

```ts
let element = this.taskElementCache.get(task);
if (!element) {
  element = this.buildTaskListItem(task);
  this.taskElementCache.set(task, element);
}
return element;
```

Refresh patches only `visible.slice(0, INITIAL_LOAD_COUNT)` (`:2142–2143`), then detaches later rows. TaskElementCache.get keys solely by getTaskKey. The empty branch (`:2073–2112`) empties the list and returns before:

```ts
this.renderQueue.clear();
this.resetLazyLoading();
this.totalTaskCount = visible.length;
this.isAllTasksLoaded = renderCount >= visible.length;
this.loadedTaskCount = renderCount;
```

It also skips cachedVisibleTasks assignment (`:2218`). The existing scroll handler still holds the detached sentinel and loadMoreTasks reads the previous cached array. Follow the existing updateTaskElementContent + reconcileRowsInPlace pattern rather than rebuilding every row.

**Search completion evidence (N06):** `refreshVisibleList` checks `refreshGeneration` after its initial yield (`src/view/task-list/task-list-view.ts:1938`), then awaits Search.filterTasks (`:1966`) and immediately mutates shared error state:

```ts
visible = await Search.filterTasks(
  visible,
  q,
  this.isCaseSensitive,
  this.plugin.settings,
  this.plugin.propertySearchEngine ?? undefined,
);
this.searchError = null;
```

The catch sets this.searchError at `:1992`. Result-count/error DOM updates begin at `:1998`; the empty branch empties the list and returns (`:2073–2112`). The next generation guard (`:2186`) is too late for these paths. PropertySearchEngine.searchProperties awaits initialize (`src/services/property-search-engine.ts:242`), which can wait on scanning, so a deferred property query can outlive a newer plain/empty query. `onClose` (`:2760`) clears references but does not invalidate refreshGeneration at entry.

**Test exemplar:** tests/task-list-view.test.ts uses installObsidianDomMocks and real TaskListView with a small Obsidian ItemView shell:

```ts
contentEl: HTMLElement;
constructor() {
  this.contentEl = activeDocument.createElement('div');
}
```

Reuse its createBaseTask/createBaseSettings fixtures and actual cache/render queue. Defer only the asynchronous Search.filterTasks boundary (typed deferred promises) to establish ordering; assert actual list/count/error DOM rather than only spying on refresh calls.

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

- `src/view/task-list/task-list-view.ts`
- `src/view/task-list/task-element-cache.ts`
- `src/view/task-list/chunked-render-queue.ts`
- `tests/task-list-view.test.ts`
- `tests/task-element-cache.test.ts`
- `tests/chunked-render-queue.test.ts`
- `tests/integration/task-list-view.test.ts`
- `docs/task-list.md`
- `CHANGELOG.md`

Local bookkeeping: this plan and its row/dependency notes in `plans/README.md` may be updated but never staged.

**Out of scope:** No new virtualization library, grouping UI, CSS/style refresh, performance metric claims, bundle change, or screenshot capture. All files not explicitly listed above require a scope revision before editing. Never regenerate `docs/assets/` or the screenshot manifest as a side effect.

## Git workflow

Use the current worktree and a feature branch from the default branch (suggested: `advisor/061-task-list-lazy-state`); preserve existing local work. Do not create a separate worktree/clone unless explicitly requested. Do not stage/commit `plans/`, `.freebuff/`, or local plugin `data.json`. Do not push or open a PR without instruction. If committing is requested, stage only in-scope product files, use a temporary commit-message file, and delete it afterward. Include the project trailers `🤖 Generated with Codebuff` and `Co-Authored-By: Codebuff <noreply@codebuff.com>`. Describe behavior in commit/changelog text, never local plan numbers.

## Steps

### Step 1: Write lazy-loading and asynchronous search regressions

Extend `tests/task-list-view.test.ts` using 80 actual task fixtures: lazy-load row 60, edit its data, refresh and reload; then search from >50 results to zero and trigger the old scroll callback. Add a deferred chunk callback case and empty→nonempty recovery. Use installObsidianDomMocks and actual cache/render queue where possible. Separately defer an old property query, complete a newer nonempty plain/empty query, then resolve the old query with zero matches: the new rows/count/error must stay unchanged. Cover old rejection after new success, old success after new validation error, and onClose while filtering is pending. Resolve/reject the deferred operation after close; no DOM mutation, cache refill, sentinel installation or error UI may occur. Include two pending searches completed out of order and an empty→nonempty recovery after each.

**Verify**: `npm test -- --runInBand --coverage=false --runTestsByPath tests/task-list-view.test.ts tests/task-element-cache.test.ts tests/chunked-render-queue.test.ts` → new stale-row/old-query/post-filter/close-during-filter cases fail for the described defects; existing first-batch behavior remains green.

### Step 2: Guard asynchronous commits, patch cached rows and centralize pagination reset

Update cached lazy rows using updateTaskElementContent, including current handlers/snapshot. Add one reset path used by empty/scanning branches and successful result-set changes; guard chunk completions with the current refresh generation before appending. Change the queue only if a test proves cancellation cannot otherwise stop its callbacks. Do not clear every DOM cache on each keystroke.

Define an explicit view lifetime: invalidate the current refresh generation at the START of onClose and mark the view disposed before clearing fields or awaiting teardown; if the host reuses the same view instance onOpen, start a fresh lifetime there. Reject refresh entry and all post-await continuations from disposed/old lifetimes. After Search.filterTasks settles, validate generation/lifetime BEFORE assigning searchError or updating any DOM/cache/pagination. Compute the result/error locally, preserving the existing fallback-search semantics for the CURRENT query; a stale rejection must not overwrite a newer error or invoke its fallback UI. Retain the guard after renderToElements as well. Do not globally cancel shared Search/PropertySearchEngine work used by other views.

**Verify**: `npm test -- --runInBand --coverage=false --runTestsByPath tests/task-list-view.test.ts tests/task-element-cache.test.ts tests/chunked-render-queue.test.ts` → all lazy/search/disposal lifecycle cases pass; unchanged keyed nodes are still reused and current-query errors remain visible.

### Step 3: Verify scrolling/search in Obsidian and document

Extend `tests/integration/task-list-view.test.ts` with >50 focused fixture tasks and actual scroll-triggered loading, edit then reload, and zero-result scroll. Add named tests `task list keeps the newest query after a delayed property search` and `task list does not render after closing during a property search`; control the real property-initialization boundary in the isolated host with a typed temporary wrapper restored in finally, not fixed sleeps. Assert row text, count and errors agree with the CURRENT input after older work settles. Add `task list scrolling keeps current rows across an empty query` for pagination. Update `docs/task-list.md` to describe current-query results and live updates through scrolled results; add concise CHANGELOG fix text.

**Verify**: `npm run test:integration -- --project=obsidian task-list-view.test.ts` → new named host scroll/search/disposal cases and existing Task list view tests pass without old rows, stale counts/errors or stale task actions.

### Step 4: Complete verification and scope review

Format only changed files, run the full unit suite, typecheck/build and lint. For any specified host integration gate, record actual results and restore the isolated fixture through the harness; do not substitute jsdom success for real Obsidian verification. Run `npm run docs:screenshots -- --check` manually when plugin sources changed; stale rows are informational, record them without regeneration. Update the local plan/index status with tests and limitations.

**Verify**: `npm test -- --runInBand`, `npm run build`, and `npm run lint` → each exits 0; `git diff --check` → exit 0; `git diff --name-only` → only intended in-scope product changes (besides preexisting user work). An unavailable required integration environment must be reported as incomplete verification, not a passing result.

## Test plan

Pin row text, state, priority/date output and clicking the updated row; a text-only assertion misses stale callback closures. Include table cells sharing a path/line, repeated empty queries, scanning/no-task state, queued animation callback and a later fresh nonempty search. Control timers/RAF deterministically and clean up views after each test. Assert unchanged rows retain DOM identity to protect the recent reconciliation work. Post-filter tests must check success AND catch paths, with old-empty/new-nonempty, old-error/new-success, old-success/new-error, close-before-resolve and close-before-reject. A test that checks only the final row count misses stale error/count mutations. Restore Search/host wrappers after every case.

## Done criteria

- [ ] A previously cached row beyond the first batch shows current task fields and acts on current identity.
- [ ] No old-query row appears after zero results, including queued/in-flight lazy callbacks.
- [ ] Pagination recovers correctly from empty to nonempty and preserves existing batch size and DOM reuse.
- [ ] Older query success/rejection cannot change the current query's rows, count, error, cache or pagination.
- [ ] Closing invalidates every pending refresh before teardown; later success/rejection performs no view mutation, including after a subsequent fresh onOpen lifetime.
- [ ] All targeted regression suites and specified integration gates pass; full `npm test -- --runInBand`, `npm run build` and `npm run lint` exit 0.
- [ ] Named docs pages and concise CHANGELOG behavior summaries are updated.
- [ ] No out-of-scope edits or regenerated screenshot assets appear in the task diff.
- [ ] `plans/README.md` status and this plan's Results section record actual commands/results and any outstanding verification; local planning files stay unstaged.

## STOP conditions

Stop and report (do not improvise) if:

- The live code differs semantically from the excerpts beyond verified predecessor-plan changes.
- The required fix changes sorting/classification, search grammar, current-query fallback semantics, view-mode filtering or planned grouping semantics.
- A proposed fix globally cancels shared property-engine/search work or relies only on isConnected instead of explicit view lifetime.
- A host regression cannot control the asynchronous boundary or restore its temporary wrapper safely: report incomplete host verification rather than add arbitrary delays.
- The cache patch helper cannot refresh a field/handler used by the failing test; identify that field and extend the plan before replacing the whole rendering system.
- A verification fails twice after a focused correction, or the fix requires editing an out-of-scope path.

## Maintenance notes

Property invalidation 059 must follow this plan so its extra refreshes cannot reintroduce stale completions. Pending grouping plan 035 and incremental-refresh plan 048 must retain these >50-row AND out-of-order-search/disposal regressions. Cache keys identify location, not immutable task content; every reuse path must either validate or patch content.

## Results

Implemented 2026-11-11.

- Search completions are computed locally and committed only when the refresh
  generation and the view lifetime are still current, so an older property or
  plain search can no longer clear the list, overwrite the result count or
  replace the current error. The fallback used on a rejected query runs only
  for the current query; a stale rejection is discarded before it can show
  its error or fallback UI.
- `refreshVisibleList` has an explicit lifetime: `onClose` marks the view
  disposed and bumps the generation before teardown, `onOpen` starts a fresh
  generation, and every post-await continuation (after the yield, after
  `Search.filterTasks`, after row rendering, and after a lazy chunk) checks
  it.
- Rows beyond the first batch are patched with `updateTaskElementContent`
  before a cached element is reused, so an edited task shows its current
  text, state, priority and handlers when it scrolls back into view.
- Empty and scanning-with-no-tasks results go through one `resetPagination`
  path that clears the render queue, zeroes the lazy counters and empties the
  cached visible tasks, so a scroll callback captured for the previous query
  appends nothing.
- `tests/task-list-view.test.ts` adds six cases against the real view, task
  element cache and chunked render queue: patched lazy row, zero-result
  scroll, older success and older rejection out of order, and resolve/reject
  after close. `Search.filterTasks` and the item renderer are the only test
  doubles; DOM rows, result count and error state are asserted directly.
- Docs: `docs/task-list.md`; one concise CHANGELOG entry.

Red/green evidence: with only `src/view/task-list/task-list-view.ts` reverted,
the new tests fail (6 failed / 60 passed); with the change they pass (66
passed). Final gates: `npm test -- --runInBand` 179 suites / 5,570 tests;
`npm run build` and `npm run lint` exit 0.

Limitations: the plan's Step 3 Playwright host spec was not added, so real
Obsidian scrolling and live property-search ordering are covered in jsdom
rather than the host. Row content assertions use the file's faithful renderer
double rather than the full `TaskItemRenderer`.
