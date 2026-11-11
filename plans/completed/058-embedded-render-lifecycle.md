# Plan 058: Release embedded task lists and dashboards when their Markdown renders unload

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm its expected result before continuing. Write regression tests before changing product code. If a STOP condition occurs, stop and report rather than improvising. Update this plan's status in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat e3d0456..HEAD -- src/view/embedded-task-list/code-block-processor.ts src/view/embedded-task-list/event-handler.ts src/view/embedded-dashboard/dashboard-code-block-processor.ts tests/code-block-processor.test.ts tests/embedded-event-handler.test.ts tests/embedded-render-lifecycle.test.ts tests/integration/embedded-task-list.test.ts tests/integration/dashboard-cards.test.ts ARCHITECTURE.md docs/embedded-task-lists.md docs/dashboards.md CHANGELOG.md`
>
> Compare changed paths and the Current state excerpts with live code before proceeding. Changes from named predecessor plans are expected: verify their documented contract, and record reconciled locations here. An unexplained semantic mismatch is a STOP condition. Also inspect uncommitted changes; do not overwrite other work.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `e3d0456`, 2026-11-10 (lifecycle handoff refreshed)
- **Status**: TODO
- **Origin**: 2026-10-31 improve review, findings R14; this file contains the required context independently of that review.

## Why this matters

Every rendered embedded list/dashboard is retained in a strong map until note deletion or plugin cleanup. Revisiting notes and switching modes retains detached DOM, and later task changes refresh those historical blocks. Bind instances and async completions to Obsidian's Markdown render lifetime so work scales with live blocks.

## Current state

Embedded processing (`src/view/embedded-task-list/code-block-processor.ts:125–131`) calls trackCodeBlock; `event-handler.ts:70–75` stores:

```ts
this.activeCodeBlocks.set(containerId, {
  element,
  source,
  filePath,
  isCollapsed: initialCollapsed,
});
```

refreshAllCodeBlocks (`:158`) iterates all tracked hosts. An untrackCodeBlock method already exists and file-deletion uses it. Dashboard processing (`dashboard-code-block-processor.ts:153`) similarly stores el/contentRoot/callbacks, and refreshAllDashboards iterates every entry. Dashboard cleanup only unsubscribes and clears its map (`:284–292`). Both processor constructors keep debounce timeouts in local variables. Neither registers ctx.addChild render teardown. A live refresh also awaits manager.filterAndSortTasksWithCount (`event-handler.ts:204`) or aggregator.aggregate (`dashboard-code-block-processor.ts:219`) before rendering without a per-instance completion token; a lifetime guard must be checked on both success and catch paths. Add a newest-refresh token so two live refreshes cannot commit out of order while property initialization is pending. `tests/code-block-processor.test.ts` currently mocks the event handler; that alone cannot prove removal of real registry entries.

**Test exemplar:** tests/code-block-processor.test.ts exercises the actual processor callback; tests/embedded-event-handler.test.ts supplies manager/renderer seams. Keep actual registries and lifecycle child hooks for this plan. The production ownership seam to test is:

```ts
const { tasks: filteredTasks, totalCount } =
  await this.manager.filterAndSortTasksWithCount(allTasks, params);
this.renderer.renderTaskList(
  codeBlock.element,
  filteredTasks,
  params,
  totalCount,
  codeBlock.isCollapsed,
  (id: string) => this.toggleCollapse(id),
  containerId,
);
```

Pause the manager promise, invoke the actual child unload, then settle it: asserting a mocked untrack call alone is insufficient.

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

- `src/view/embedded-task-list/code-block-processor.ts`
- `src/view/embedded-task-list/event-handler.ts`
- `src/view/embedded-dashboard/dashboard-code-block-processor.ts`
- `tests/code-block-processor.test.ts`
- `tests/embedded-event-handler.test.ts`
- `tests/embedded-render-lifecycle.test.ts`
- `tests/integration/embedded-task-list.test.ts`
- `tests/integration/dashboard-cards.test.ts`
- `ARCHITECTURE.md`
- `docs/embedded-task-lists.md`
- `docs/dashboards.md`
- `CHANGELOG.md`

Local bookkeeping: this plan and its row/dependency notes in `plans/README.md` may be updated but never staged.

**Out of scope:** No renderer redesign, CSS changes, chart algorithm optimization, screenshot regeneration, or broad changes to global test mocks. All files not explicitly listed above require a scope revision before editing. Never regenerate `docs/assets/` or the screenshot manifest as a side effect.

## Git workflow

Use the current worktree and a feature branch from the default branch (suggested: `advisor/058-embedded-render-lifecycle`); preserve existing local work. Do not create a separate worktree/clone unless explicitly requested. Do not stage/commit `plans/`, `.freebuff/`, or local plugin `data.json`. Do not push or open a PR without instruction. If committing is requested, stage only in-scope product files, use a temporary commit-message file, and delete it afterward. Include the project trailers `🤖 Generated with Codebuff` and `Co-Authored-By: Codebuff <noreply@codebuff.com>`. Describe behavior in commit/changelog text, never local plan numbers.

## Steps

### Step 1: Add actual lifecycle regression tests

Create `tests/embedded-render-lifecycle.test.ts` using actual processors/registries, a minimal lifecycle-capable ctx.addChild seam and jsdom. Repeatedly render/unload blocks and assert later task changes render only live hosts. Pause initial/refresh aggregation, unload, resolve and assert no registration or DOM mutation occurs. Cover rejection after unload as well as success. Start two refreshes while a block remains live and complete them in reverse order: only the newest can render counts/error UI. Unloading one of two blocks in the same note must not cancel the other's shared engine work.

**Verify**: `npm test -- --runInBand --coverage=false --runTestsByPath tests/embedded-render-lifecycle.test.ts tests/embedded-event-handler.test.ts` → new lifecycle tests fail on retained entries and post-unload mutations.

### Step 2: Bind both processor types to render ownership

Register render children before async work; add guarded unregister and completion handling. Store a lifetime/disposed marker and per-instance refresh generation; before every post-await success/catch mutation verify the instance is still registered in the same lifetime and the completion is newest. Do not use isConnected alone because Obsidian may initially render disconnected hosts. Promote constructor-local timeout handles to owned fields so cleanup cancels them. Keep file-delete/rename cleanup idempotent and preserve per-instance collapse state. Retain one state subscription per processor rather than creating a global subscription per historical render.

**Verify**: `npm test -- --runInBand --coverage=false --runTestsByPath tests/embedded-render-lifecycle.test.ts tests/embedded-event-handler.test.ts tests/code-block-processor.test.ts` → repeated unload returns tracking count to baseline; no disposed host refreshes.

### Step 3: Verify mode-switch behavior and document lifecycle

Extend existing embedded-task-list and dashboard-cards integration suites with render teardown/mode-switch/reopen cases. Update ARCHITECTURE ownership and `docs/embedded-task-lists.md`/`docs/dashboards.md` live behavior; add a concise user-facing CHANGELOG fix entry without timer/internal terminology.

**Verify**: `npm run test:integration -- --grep 'embedded|dashboard'` → affected host integration tests pass; live lists/charts continue updating after reopen.

### Step 4: Complete verification and scope review

Format only changed files, run the full unit suite, typecheck/build and lint. For any specified host integration gate, record actual results and restore the isolated fixture through the harness; do not substitute jsdom success for real Obsidian verification. Run `npm run docs:screenshots -- --check` manually when plugin sources changed; stale rows are informational, record them without regeneration. Update the local plan/index status with tests and limitations.

**Verify**: `npm test -- --runInBand`, `npm run build`, and `npm run lint` → each exits 0; `git diff --check` → exit 0; `git diff --name-only` → only intended in-scope product changes (besides preexisting user work). An unavailable required integration environment must be reported as incomplete verification, not a passing result.

## Test plan

Use installObsidianDomMocks in jsdom and small lifecycle test doubles that execute real onload/onunload hooks. Avoid testing a mocked track/untrack pair only. Assert repeated unload is harmless, two live blocks in one note remain independent, initially disconnected hosts may render, unload during rejection does not show an error on disposed DOM, and processor cleanup drains timers. If the global Obsidian mock lacks lifecycle support, implement it locally in this new test rather than widening the whole mock.

## Done criteria

- [ ] After unmount, both processor maps return to their original size and state changes touch only live blocks.
- [ ] No initial or refresh promise success/rejection registers/mutates an unloaded block.
- [ ] Out-of-order refreshes of a still-live block commit only the newest result/error; disposing one block cannot cancel another's shared query work.
- [ ] Processor cleanup leaves no debounce callbacks that refresh disposed instances.
- [ ] Lifecycle tests establish bounded retained instances; no unmeasured speedup claims are added.
- [ ] All targeted regression suites and specified integration gates pass; full `npm test -- --runInBand`, `npm run build` and `npm run lint` exit 0.
- [ ] Named docs pages and concise CHANGELOG behavior summaries are updated.
- [ ] No out-of-scope edits or regenerated screenshot assets appear in the task diff.
- [ ] `plans/README.md` status and this plan's Results section record actual commands/results and any outstanding verification; local planning files stay unstaged.

## STOP conditions

Stop and report (do not improvise) if:

- The live code differs semantically from the excerpts beyond verified predecessor-plan changes.
- The host context does not support render-owned child teardown at the manifest minimum; verify the actual API before replacing it with isConnected polling.
- The fix requires a global MutationObserver, periodic whole-document sweep, or changing the aggregator/search cache contract.
- A verification fails twice after a focused correction, or the fix requires editing an out-of-scope path.

## Maintenance notes

Property invalidation plan 059 will refresh these processors more often; teardown/latest-completion safety must hold before wiring that notification. Plugin-owner cleanup belongs to 068 and is independent; do not duplicate its coordinator/UI teardown here. Sequence 069's property result corrections before 059 as well; per-render tokens prevent stale UI, not incorrect engine result sets. Review both success and catch paths after every await. Full heap snapshots remain optional measurement, not a prerequisite for this deterministic retention fix.

## Results

Implemented 2026-11-11.

- Each render registers a `MarkdownRenderChild` with the post-processor context.
  Its unload hook sets a per-render disposed flag and removes the tracked
  instance, so the initial render (after its await) and every later refresh
  check ownership before touching DOM.
- `EmbeddedTaskListEventHandler` carries a per-block `refreshGeneration`; both
  the success and catch paths verify the block is still tracked and its refresh
  is newest before rendering. `DashboardCodeBlockProcessor` does the same with
  a per-dashboard token and rejects stale refreshes before updating content or
  error UI.
- Debounce timers in both processors are owned fields cleared by `cleanup()`,
  so a pending refresh cannot fire after the processor is gone.
- `tests/embedded-render-lifecycle.test.ts` uses the real processors, real
  registries and lifecycle child hooks (only parser/manager boundaries are
  paused): unload during a pending initial render, unload before a rejection,
  reverse-order refreshes committing only the newest, two live blocks staying
  independent, and dashboard teardown/refresh.
- Docs: `docs/embedded-task-lists.md`, `docs/dashboards.md` and
  `ARCHITECTURE.md` describe render ownership; one concise CHANGELOG entry.

Verification at this revision: targeted lifecycle/handler/processor suites 36
tests pass; `npm test -- --runInBand` 178 suites / 5,558 tests; `npm run build`
and `npm run lint` exit 0.

Limitations: no Playwright mode-switch/reopen spec was added; Obsidian's
render-lifetime API is exercised through a local Component/MarkdownRenderChild
test double, not a real vault render. The production path guards on
`typeof MarkdownRenderChild === 'function'`, so environments without the class
keep the previous behaviour.
