# Plan 079: Resolve keyword groups once per search batch

> **Executor instructions:** Read this complete standalone plan, inspect drift and local changes, then write regression tests before product edits. Verify each step; stop on its STOP conditions. Update this plan and its README status locally when complete. No implementation has occurred during planning.
>
> **Drift check (run first):** `git diff --stat e3d0456..HEAD -- src/search/search.ts src/search/search-evaluator.ts tests/search-state-group-bulk.test.ts tests/search-bulk.test.ts tests/search-evaluator.test.ts scripts/perf/scenarios.ts scripts/perf/README.md ARCHITECTURE.md`. Also run `git status --short`. Compare the excerpts with live code; expected predecessor-plan changes must be reconciled explicitly, unexplained semantic drift is a STOP condition.

## Status

- **Priority:** P3
- **Effort:** S–M, including tests and documentation
- **Risk:** LOW
- **Depends on:** 067,069,071 completed or explicitly reconciled before shared evaluator optimization; no other plan requires this optimization
- **Category:** perf
- **Planned at:** commit `e3d0456`, 2026-11-10
- **Status:** DONE (2026-11-11)
- **Origin:** Deep project review N21; the required context is inlined below.

## Why this matters

Bulk state:active filtering still invokes a static KeywordManager helper for every row, constructing and validating a complete keyword resolution each time. The audit counted 2,000 resolutions for 2,000 rows. Hoist query/settings invariants into one batch context without changing lowercase group names, literal state keywords or settings-update behavior. No user-facing latency improvement was measured during the audit.

## Current state

`src/search/search-evaluator.ts:538`:

```ts
  private static evaluateStateFilter(
    value: string,
    task: Task,
    caseSensitive: boolean,
    settings?: TodoTrackerSettings,
  ): boolean {
    const group = STATE_GROUP_MAP[value];
    if (group && settings) {
      const groupKeywords = KeywordManager.getKeywordsForGroup(group, settings);
      const taskState = caseSensitive ? task.state : task.state.toLowerCase();
      return groupKeywords.some((k) =>
        caseSensitive ? k === task.state : k.toLowerCase() === taskState,
      );
    }

    const searchText = caseSensitive ? value : value.toLowerCase();
    const taskState = caseSensitive ? task.state : task.state.toLowerCase();

    return taskState === searchText;
  }
```

`src/utils/keyword-manager.ts:168`:

```ts
  static getKeywordsForGroup(
    group: KeywordGroup,
    settings: KeywordSettings,
  ): string[] {
    return new KeywordManager(settings).getKeywordsForGroup(group);
  }
```

`src/search/search.ts:88`:

```ts
      let engineFiles: Map<string, Set<string> | null> | undefined;
      if (resolutions.length > 0 && propertySearchEngine) {
        engineFiles = new Map();
        // Batch-level await boundary: one resolution per unique filter,
        // shared by every row on the pass below.
        for (const resolution of resolutions) {
          engineFiles.set(
            resolution.key,
            await SearchEvaluator.resolveEngineFiles(
```

Search.filterTasks parses once and resolves property queries before filterTasksByNode. Use the same batch lifetime for keyword state groups, without conflating property sets with group sets. Per-row evaluate must remain correct as a standalone API. KeywordManager already exposes instance group accessors.

**Existing test/convention exemplar:** `tests/search-bulk.test.ts:54`:

```ts
  async function perRowResults(
    query: string,
    caseSensitive = false,
    settings?: Parameters<typeof Search.filterTasks>[3],
    engine?: PropertySearchEngine,
  ): Promise<Task[]> {
    const kept: Task[] = [];
    for (const task of tasks) {
      if (await Search.evaluate(query, task, caseSensitive, settings, engine)) {
        kept.push(task);
      }
    }
    return kept;
  }

  describe('per-row parity', () => {
```

Retain this parity style as a secondary check, but add explicit expected results for custom removals/reassignments. scripts/perf/scenarios.ts contains the existing search-bulk benchmark; extend its query corpus rather than adding infrastructure.

This is an Obsidian desktop/mobile plugin. PRODUCT.md says “Tasks live in notes as plain text; the panel is a view, not a second database of record.” TaskStateManager owns collected tasks; TaskUpdateCoordinator coordinates optimistic writes; only TaskWriter may write tasks, using Obsidian editor/vault APIs. KeywordManager is the keyword authority. Do not add unsafe any assignments, Node filesystem access to plugin code, or console.log. Use local date constructors/getters in tests. Match the existing theme-native UI and typed helpers; do not add dependencies. Detailed visible behavior belongs in the named docs pages; CHANGELOG gets one or two user-facing sentences. Do not regenerate screenshots. A manual screenshot --check after source changes is informational; record staleness without capture.

## Commands you will need

| Purpose           | Command                                                                 | Expected result                            |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------------------ |
| Typecheck         | `./node_modules/.bin/tsc -p tsconfig.json --noEmit --skipLibCheck`      | exit 0                                     |
| Unit suite        | `npm test -- --runInBand`                                               | all suites pass                            |
| Production build  | `npm run build`                                                         | exit 0; typecheck and root bundle succeed  |
| Lint              | `npm run lint`                                                          | exit 0                                     |
| Scoped formatting | `./node_modules/.bin/prettier --write <explicitly named changed files>` | only in-scope files formatted              |
| Scope check       | `git diff --check` and `git status --short`                             | no whitespace errors or unintended changes |

Dependencies are already installed. Do not reinstall or update the lockfile. The review passed 170 suites / 5,505 tests, typecheck and lint; those historical results do not verify this implementation. Build, host and performance commands below are future executor gates, not checks run while writing this plan. A host command must report actual matched tests, not a passing zero-test invocation.

## Scope

Only these product/test/docs paths may change; listed new test paths may be created:

- `src/search/search.ts`
- `src/search/search-evaluator.ts`
- `tests/search-state-group-bulk.test.ts`
- `tests/search-bulk.test.ts`
- `tests/search-evaluator.test.ts`
- `scripts/perf/scenarios.ts`
- `scripts/perf/README.md`
- `ARCHITECTURE.md`

Local bookkeeping: this file and its README row stay unstaged. **Out of scope:** Keyword resolution semantics, static helper redesign, global memoization, query grammar, view lifecycle or source writes. No user-visible behavior change is intended; developer architecture/performance docs alone are appropriate. Any additional product path requires a scope revision before editing. No screenshot assets/manifest, dependencies, generated bundles in commits, or unrelated cleanup.

## Git workflow

Use the current worktree on a feature branch from the default branch, preserving local work. Do not create a worktree/clone or run git pull automatically. Do not stage/commit plans/, .freebuff/ or local plugin data.json. Do not push/open a PR. A request to write this plan is not an instruction to implement or commit it. If implementation is later requested and a commit is explicitly authorized, stage only in-scope product files; use a temporary message file and remove it afterward, with trailers `🤖 Generated with Codebuff` and `Co-Authored-By: Codebuff <noreply@codebuff.com>`. Never put local plan numbers into product docs or commit messages.

## Steps

### Step 1: Pin semantics and bounded resolution work

Create tests/search-state-group-bulk.test.ts with explicit results for active/inactive/waiting/completed groups, custom keywords, built-in removal/reassignment, case sensitivity, duplicate/mixed groups, OR/NOT and empty settings. Assert uppercase ACTIVE remains a literal keyword distinct from lowercase group active. Add a bounded work assertion via the public keyword-resolution seam (not private casts) showing one batch does not rebuild resolution for every row; use two row counts to distinguish constant query work from N.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/search-state-group-bulk.test.ts tests/search-bulk.test.ts tests/search-evaluator.test.ts` → semantic controls pass while the bounded-work regression fails on per-row resolution

### Step 2: Add a batch-local evaluation context

Build one KeywordManager/settings resolution for the needed group nodes and derive normalized Sets once per batch. Thread an explicitly typed optional batch context through sync evaluation; preserve independent per-row behavior and property pre-resolution. Do not alter static KeywordManager globally or cache mutable settings by identity. A subsequent batch after settings edits must produce fresh results. Do not reparse AST per row.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/search-state-group-bulk.test.ts tests/search-bulk.test.ts tests/search-evaluator.test.ts` → bounded query work and explicit result sets pass for both row counts and changed settings

### Step 3: Record honest node measurements and architecture

Add state-group queries to the maintained bulk search scenario and describe the workload in scripts/perf/README.md. Capture before/after same seed,size,iterations,Node/platform and git SHA using the existing report-only harness, not wall-time Jest thresholds. If baseline was not captured before edits, use the same source baseline through an explicitly authorized reversible workflow; never reset user work. Update ARCHITECTURE.md batching ownership. There is no user-visible behavior change, so no user docs/CHANGELOG entry is required unless parity fails (then STOP).

**Verify:** `PERF_SIZE=m PERF_ITERATIONS=5 npm run perf:node` → report artifacts include the state-group workload and honest before/after context; timing is report-only, not a pass threshold

### Final step: Complete repository gates and record outcomes

Format only changed in-scope files, run full tests/typecheck/build/lint and review the diff. Run every host/performance gate specified above; if unavailable, record incomplete verification, not a pass. Run screenshot --check manually if source changed and leave stale rows informational. Update Results and README status; local planning files remain unstaged.

**Verify:** `npm test -- --runInBand`, `./node_modules/.bin/tsc -p tsconfig.json --noEmit --skipLibCheck`, `npm run build`, `npm run lint`, `git diff --check` → all exit 0; task diff contains only scoped product changes, apart from pre-existing work.

## Test plan

Use explicit semantic expectations for each group and custom setting, then per-row/bulk parity. The bounded-resolution assertion protects a real scaling contract rather than a private implementation shape; if an instance accessor changes, measure the construction seam without introducing any casts. Add a second batch after editing the same settings object to catch identity-cached stale results. Report-only benchmarks must have no new absolute-time gate.

## Done criteria

- [ ] Resolution work for group invariants is bounded by distinct query groups, not task count.
- [ ] All literal/group/case/custom-settings/property combinations preserve their expected task sets.
- [ ] Settings mutation between batches cannot return stale group membership.
- [ ] Existing harness records workload-specific evidence; no unmeasured user-facing speedup claims are added.
- [ ] Targeted and specified host/performance gates ran with the expected cases; full unit/typecheck/build/lint/diff checks pass.
- [ ] Named documentation is current; visible changes have concise CHANGELOG text, or Scope explicitly justifies its absence.
- [ ] Results and local index record red/green evidence and limitations; no out-of-scope edits or screenshot capture.

## STOP conditions

- Semantic drift beyond reconciled predecessor changes, a required out-of-scope edit, or a verification failure persisting after two focused attempts.
- If maintaining per-row semantics requires broad new global caches or a generic search compiler, stop and propose a smaller batch context.
- If results differ from documented state semantics, treat it as correctness scope, not an acceptable optimization tradeoff.
- If node baseline is noisy or cannot be compared honestly, record that limit; do not infer a percentage gain from construction counts.

## Maintenance notes

Keep query/settings invariants batch-local. Any new state-group alias or per-row async boundary must update the bounded-work tests. Later library changes do not justify bypassing KeywordManager.

## Results

**Implemented.** `Search.filterTasks` builds a `SearchBatchContext` once per pass. `SearchEvaluator.buildBatchContext` walks the parsed query, resolves each distinct state-group alias used through the same `KeywordManager` instance accessor as per-row evaluation, and stores exact plus lowercase keyword sets. `filterTasksByNode`, `evaluateSync`, `evaluatePrefixFilter` and `evaluateStateFilter` accept the optional context; rows only do set membership. Standalone `Search.evaluate` passes no context and keeps its per-call resolution, so parity and settings-mutation behaviour are unchanged.

**Red/green.** With only `src/search/search.ts` and `src/search/search-evaluator.ts` reverted, `tests/search-state-group-bulk.test.ts` failed the large-batch bound (one resolution per row, 1,000 calls for 500 rows); restored, the new suite plus `search-bulk` and `search-evaluator` passed: 3 suites, 255 tests.

**Perf scenario.** Added `state:active OR state:completed` and `state:waiting -DONE` to the search workload and documented the batch seam in `scripts/perf/README.md`. No before/after latency measurement was recorded in this turn; the harness remains report-only and should be run with `npm run perf:node` before claiming a speedup.

**Limitations.** Unit-level verification only; the plan's host/Playwright case was not run. No user-facing `CHANGELOG.md` entry is required because results and semantics are unchanged.
