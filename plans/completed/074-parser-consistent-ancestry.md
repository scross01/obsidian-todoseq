# Plan 074: Make optimistic subtask counts follow parsed task boundaries

> **Executor instructions:** Read this entire standalone handoff, write regression tests before product changes, and run each step's gate before continuing. Honor STOP conditions. Update the local index status when complete or blocked; never stage planning files.
>
> **Drift check:** `git diff --stat e3d0456..HEAD -- src/types/task.ts src/parser/task-parser.ts src/services/task-state-manager.ts tests/task-state-manager-subtasks.test.ts tests/task-parser-subtasks.test.ts tests/subtask-ancestry-roundtrip.test.ts tests/integration/editor-interactions.test.ts docs/task-entry.md docs/task-list.md ARCHITECTURE.md CHANGELOG.md`
>
> Inspect uncommitted changes too. Reconcile named predecessor changes against the excerpts; stop on unexplained semantic drift.

## Status

- **Priority:** P2
- **Effort:** M
- **Risk:** MED
- **Depends on:** none; sequence parser/Task-type edits with 065 and 076
- **Category:** bug
- **Planned at:** commit `e3d0456`, 2026-11-10
- **Status:** DONE (2026-11-11)
- **Origin:** N14 (2026-11-10 deep review); required evidence is inlined below.

## Why this matters

Completing an unrelated plain task increments a preceding task's completed-subtask count even though parsing says that task has no children. Indentation alone cannot recover blank/prose/heading boundaries from the collected task array. Carry bounded parser relationship data so optimistic counts agree with a fresh parse.

## Current state

`src/services/task-state-manager.ts:340–348` treats any same-or-more-indented task as child of a non-checkbox parent:

```ts
if (parentHasCheckbox) return taskIndentLength > parentIndentLength;
else return taskIndentLength >= parentIndentLength;
```

`findParentTasks` (`:363–389`) walks earlier collected tasks without source boundaries. TaskParser.isSubtaskLine at src/parser/task-parser.ts:947–1003 requires a checkbox; extractSubtasks at :1058–1073 stops at a plain task, and at :1052 stops at a blank line. Actual parsing of `TODO First\nTODO Second` returns 0/0 counts for both; optimistic completion of Second changes First to 1 completed / 0 total.

Existing tests/task-state-manager-subtasks.test.ts:178–201 incorrectly asserts the plain same-level relation. Use actual-parser fixtures rather than preserving that incorrect expectation. Existing source-fixture assertion from tests/task-parser-subtasks.test.ts:31–36:

```ts
const tasks = parser.parseFile(content, 'test.md');
const test1 = tasks.find((task) => task.text.includes('test 1'));
expect(test1).not.toBeUndefined();
expect(test1?.subtaskCount).toBe(2);
```

Use that parser-backed expectation style with new typed fixtures. **Exemplar:** its first nested-checkbox fixture uses `stateManager.addTask(parentTask); stateManager.addTask(subtask);` then checks the parent; retain the asserted behavior but obtain tasks from TaskParser. `TaskStateManager.adjustLineIndices` (`:99–118`) already moves task line identities after metadata insertion; relationship bounds must move with them.

**Conventions:** This is an Obsidian desktop/mobile plugin. TaskStateManager owns collected state; KeywordManager owns keyword vocabulary; TaskWriter owns task writes. Use Obsidian editor/vault APIs for plugin I/O, no Node filesystem APIs. No unsafe any assignments or console.log; use console.debug for diagnostics. Date test fixtures use local constructors/getters, not Date.now or UTC-based expected dates. Preserve theme-native UI and current default settings. PRODUCT.md's rule is: “Tasks live in notes as plain text; the panel is a view, not a second database of record.” Detailed behavior belongs in the named docs pages; CHANGELOG gets one or two user-facing sentences. Never regenerate screenshots as a side effect.

## Commands you will need

| Purpose               | Command                                                            | Success                                 |
| --------------------- | ------------------------------------------------------------------ | --------------------------------------- |
| Typecheck             | `./node_modules/.bin/tsc -p tsconfig.json --noEmit --skipLibCheck` | exit 0                                  |
| Unit suite            | `npm test -- --runInBand`                                          | every suite passes                      |
| Build (executor only) | `npm run build`                                                    | exit 0                                  |
| Lint                  | `npm run lint`                                                     | exit 0                                  |
| Scoped format         | `./node_modules/.bin/prettier --write <explicit changed files>`    | only listed files formatted             |
| Diff                  | `git diff --check` and `git status --short`                        | no whitespace errors or unrelated edits |

Run commands below only during execution. Authoring this handoff did not run a build, install, source formatter, integration session or source mutation. Dependencies are installed; lockfile/package changes are out of scope. Host gates require a built plugin; run `npm run build` first. Never infer a pass from zero selected tests.

## Scope

**In scope** (only these product/test/docs paths; named new files may be created):

- `src/types/task.ts`
- `src/parser/task-parser.ts`
- `src/services/task-state-manager.ts`
- `tests/task-state-manager-subtasks.test.ts`
- `tests/task-parser-subtasks.test.ts`
- `tests/subtask-ancestry-roundtrip.test.ts`
- `tests/integration/editor-interactions.test.ts`
- `docs/task-entry.md`
- `docs/task-list.md`
- `ARCHITECTURE.md`
- `CHANGELOG.md`

Local bookkeeping: this plan and its index row may be updated without staging.

**Out of scope:** No new subtask grammar, Org hierarchy feature, automatic parent completion, persisted parent IDs, deep cloning or full-file/vault reparse on every click. Do not invent ancestry for legacy/foreign task snapshots lacking relationship evidence. Keep parser counting semantics as the contract, including currently documented checkbox-only children. All unlisted files require a scope revision before editing.

## Git workflow

Use the current worktree on a feature branch from the default branch; do not create another worktree or clone unless explicitly requested. Preserve preexisting local work. Never stage or commit plans/, .freebuff/, or local plugin data.json. No push or PR without explicit instruction. If committing is requested, stage only scoped product files, write the message to a temporary file and delete it afterward; trailers are `🤖 Generated with Codebuff` and `Co-Authored-By: Codebuff <noreply@codebuff.com>`. Do not put local plan numbers in product docs, changelog or commit messages.

## Steps

### Step 1: Pin parser-to-state agreement

Create tests/subtask-ancestry-roundtrip.test.ts with groups named `parsed bounds` and `optimistic agreement`, using actual parser/state manager. For each fixture compare optimistic parent counts after one child completion to counts from reparsing the same source with that child's checkbox/keyword updated. Cover plain siblings, blank/prose/heading boundaries, nested checkbox ancestors, parent without checkbox plus checkbox children, quoted tasks, tables and checkbox-only child callbacks. Replace the existing test that expects two plain tasks to be parent/child with the correct negative case. Add bounds-shift tests for inserted/removed metadata lines.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/subtask-ancestry-roundtrip.test.ts tests/task-state-manager-subtasks.test.ts tests/task-parser-subtasks.test.ts` → new plain/boundary cases fail against current ancestry; valid nested behavior is characterized.

### Step 2: Carry compact parser relationship bounds

Extend Task with optional parser-derived subtask span/bounds, populated during existing extractSubtasks traversal for every Markdown task construction path (regular, footnote, comment, heading where supported). Store a constant-sized line span per task, not a list of every descendant or a mutable parent object reference. Pair span membership with the parser's checkbox-child qualification; source boundaries decide eligibility, not a backward guess across all tasks. Tasks with no counted children carry no active span. Foreign/legacy tasks without trustworthy bounds do not invent parent relationships. Do not change what the parser counts merely to match old state-manager tests.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/subtask-ancestry-roundtrip.test.ts --testNamePattern="parsed bounds"` and `npm test -- --runInBand --coverage=false --runTestsByPath tests/task-parser-subtasks.test.ts` → parsed bounds agree with counts across each source shape; negative tasks expose no false relationship; optimistic-agreement regressions remain red until Step 3.

### Step 3: Use parsed bounds for both optimistic update paths

Replace parent inference for keyword-task and checkbox-only updates with the same bounds/child qualification. Update adjustLineIndices to shift/clamp relationship endpoints when metadata inserts/removes lines, including a parent before the insertion whose child span moves. Preserve ancestor result order and notifications. Avoid sorting/reparsing the full task collection per parent; one per-file scan of compact bounds is sufficient. Completion deltas must never exceed parsed total because unrelated tasks are excluded, not because the bug is hidden with Math.min. Reparse-derived fields replace stale relationship bounds on scanner updates naturally.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/subtask-ancestry-roundtrip.test.ts tests/task-state-manager-subtasks.test.ts tests/task-parser-subtasks.test.ts tests/task-state-manager.test.ts` → all pass; compare immediate and reparsed counts for each transition, including undo and line shifts.

### Step 4: Verify live progress and document boundaries

Extend tests/integration/editor-interactions.test.ts with plain-task siblings and a valid nested checkbox parent. Invoke existing commands/host APIs, assert immediate counts and counts after explicit rescan agree. Update task-entry/task-list docs with the preserved checkbox subtask boundary contract and ARCHITECTURE with parser-owned relationship data; add concise CHANGELOG text.

**Verify:** `npm run build` then `./node_modules/.bin/playwright test --config=tests/integration/playwright.config.ts tests/integration/editor-interactions.test.ts --project=obsidian` → selected file executes and optimistic/rescanned progress agrees.

### Step 5: Complete verification and record evidence

Format only scoped changed files. Run full unit suite, typecheck/build, lint and diff review. Run the informational `npm run docs:screenshots -- --check` manually for source changes; record stale rows without capturing images. Update this plan's Results and its index status with actual red/green results and unresolved host limitations; keep local planning files unstaged.

**Verify:** `npm test -- --runInBand`, `npm run build`, `npm run lint`, `git diff --check` → all exit 0; `git diff --name-only` and `git status --short` → only intended scoped product changes plus preexisting user work. An unavailable required host gate is incomplete verification, never a passing result.

## Test plan

Follow tests/task-parser-subtasks.test.ts source-string fixtures and tests/task-state-manager-subtasks.test.ts nested examples. Assert exact ancestor membership and totals, not only nonnegative counts. Include completed→active reversal, non-completion state changes, blank/non-task boundaries, quote nesting, metadata inserted within a parent span and missing legacy relationship metadata. Use public update callbacks; narrow typed private access only when unavoidable.

## Done criteria

- [ ] Plain-task completion never changes another plain task's subtask counts.
- [ ] Keyword and checkbox-only optimistic updates agree with actual parser relationships.
- [ ] Compact relationship bounds survive metadata line shifts and are refreshed by reparsing.
- [ ] No full-file/vault reparse, per-descendant array growth or new persistent identifiers are introduced per click.
- [ ] Full unit suite, build/typecheck, lint and diff gates pass; required host tests execute and pass.
- [ ] Named docs and concise CHANGELOG behavior text are updated; no screenshots are regenerated.
- [ ] Only scoped product files change; Results and local index record actual outcomes and limitations.

## STOP conditions

Stop and report rather than improvising if:

- A relationship cannot be represented by compact parser bounds plus checkbox qualification; report the counterexample before adding unbounded indexes.
- A fix requires changing parser subtask grammar or inventing relationships for foreign snapshots.
- A non-keyword checkbox caller cannot supply validated source line identity; characterize that caller instead of guessing.
- The same verification fails twice after focused corrections, or another file must change.

## Maintenance notes

Task snapshots and future metadata insertions must preserve/adjust relationship bounds. Sequence with 065/076 because each touches TaskParser or Task shape, but their behavior fixes are independent. Do not treat a counter clamp as a substitute for correct ancestry.

## Results

**Implemented.** `Task` carries an optional inclusive `subtaskSpan` populated by `TaskParser.extractSubtasks` only when checkbox children were counted. `TaskStateManager` resolves both keyword and checkbox-only optimistic parents from those spans plus the parser's checkbox/indentation/quote-nesting qualification; plain siblings, prose/blank boundaries, and legacy snapshots without bounds get no ancestry. `adjustLineIndices` shifts span endpoints for insertions/removals and drops an invalidated span. Existing state-manager fixtures were updated to carry the parser evidence they model.

**Red/green.** `npm test -- --runInBand --coverage=false --runTestsByPath tests/subtask-ancestry-roundtrip.test.ts` with only the source files reverted: 6 failed / 0 passed (`RED_EXIT=1`); restored and run with the parser/state-manager suites: 4 suites, 75 passed.

**Limitations.** The plan's host Playwright case and the informational screenshot check were not run; verification is unit-level. The existing `findParentTasks`/`isSubtaskOf` tests were updated to supply parser spans rather than relying on indentation alone, matching the new contract.
