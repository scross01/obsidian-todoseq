# Plan 064: Preserve every other metadata line when smart dates update a task

> **Executor instructions:** Read this entire standalone handoff, write regression tests before product changes, and run each step's gate before continuing. Honor STOP conditions. Update the local index status when complete or blocked; never stage planning files.
>
> **Drift check:** `git diff --stat e3d0456..HEAD -- src/services/smart-date-processor.ts src/services/task-writer.ts src/utils/task-line-utils.ts tests/smart-date-processor.test.ts tests/task-writer-smart-date.test.ts tests/smart-date-metadata.test.ts tests/integration/smart-date.test.ts docs/editor.md CHANGELOG.md`
>
> Inspect uncommitted changes too. Reconcile named predecessor changes against the excerpts; stop on unexplained semantic drift.

## Status

- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Depends on:** none; coordinate pure metadata classification with 054 if already executed, without making it mandatory; sequence shared TaskWriter edits with 053/065/055 (not hard dependencies)
- **Category:** bug
- **Planned at:** commit `e3d0456`, 2026-11-10
- **Status:** TODO
- **Origin:** N01 (2026-11-10 deep review); required evidence is inlined below.

## Why this matters

Updating a deadline can silently delete an existing scheduled date. Date discovery also stops at STARTED or DESCRIPTION, so editing an already dated task can insert duplicate dates. Keep date editing one editor transaction while preserving unrelated bytes, nesting and natural cursor behavior.

## Current state

`src/services/smart-date-processor.ts:423–426` chooses an existing line:

```ts
const sameTypeDate = existingDateLines.find((d) => d.type === dateType);
const replaceLineNumber =
  (sameTypeDate != null ? sameTypeDate.lineNumber : null) ??
  existingDateLines[0]?.lineNumber;
```

At `:529` it constructs only `[updatedTaskLine, dateLine].join('\n')`; `:538–542` dispatches:

```ts
changes: { from: taskLine.from, to: existingDateLine.to, insert: newContent }
```

The debounce branch has the same broad range at `:549–554`. Actual TaskParser + SmartDateProcessor + CodeMirror EditorState reproduced deletion: `TODO report due tomorrow` / SCHEDULED / DEADLINE becomes task / new DEADLINE only. `findExistingDateLines` (`:378–388`) accepts only SCHEDULED/DEADLINE and otherwise breaks, missing dates below STARTED/DESCRIPTION. AGENTS.md requires task persistence through TaskWriter. SmartDateProcessor currently dispatches these writes directly; this plan moves non-table natural and inline structured conversions behind a narrow synchronous writer seam rather than preserving that bypass. Existing single-date fallback retags the first existing date when no same-type line exists; retain this behavior pending a separate product decision.

**Test exemplar:** `tests/smart-date-processor.test.ts:103–110` installs a controlled RAF:

```ts
const mockRaf = jest.fn((cb: FrameRequestCallback) => {
  cb(0);
  return 0;
});
window.requestAnimationFrame = mockRaf;
```

TaskWriter's current editor-aware path at src/services/task-writer.ts:302 uses `editor.replaceRange(newLine, from, to)`; its purpose is preserving active editor state. This new writer entry uses the existing CM view instead, synchronously, to retain one transaction and mapped selection. Existing writer-test exemplar from tests/task-writer-methods.test.ts:218–223:

```ts
mockApp.vault.process = jest.fn().mockImplementation((file, callback) => {
  const data = 'line 0\n' + task.rawText + '\nline 2';
  const result = callback(data);
  return result;
});
```

Follow the stateful host-transformation style, using actual EditorState instead of a mocked writer/dispatch-only spy. Use that timing control, but use actual EditorState transactions for byte/selection assertions instead of the existing dispatch-only fake. Build a typed stateful view seam whose dispatch applies `state.update(spec).state`; no native EditorView instance is needed for unit transactions.

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

- `src/services/smart-date-processor.ts`
- `src/services/task-writer.ts` — narrowly scoped synchronous smart-date transaction seam
- `src/utils/task-line-utils.ts`
- `tests/smart-date-processor.test.ts`
- `tests/task-writer-smart-date.test.ts`
- `tests/smart-date-metadata.test.ts`
- `tests/integration/smart-date.test.ts`
- `docs/editor.md`
- `CHANGELOG.md`

Local bookkeeping: this plan and its index row may be updated without staging.

**Out of scope:** No natural-language grammar/fraction heuristic changes, date-type fallback redesign, table parsing, keyword defaults, generic TaskWriter refactor, async queue in the CM callback or CodeMirror dependency update. The existing table-only conversion path remains outside this bounded change; do not add new direct non-table task persistence in SmartDateProcessor. A shared helper in task-line-utils must remain pure; do not import editor/CodeMirror logic into it or expand 054's scope. All unlisted files require a scope revision before editing.

## Git workflow

Use the current worktree on a feature branch from the default branch; do not create another worktree or clone unless explicitly requested. Preserve preexisting local work. Never stage or commit plans/, .freebuff/, or local plugin data.json. No push or PR without explicit instruction. If committing is requested, stage only scoped product files, write the message to a temporary file and delete it afterward; trailers are `🤖 Generated with Codebuff` and `Co-Authored-By: Codebuff <noreply@codebuff.com>`. Do not put local plan numbers in product docs, changelog or commit messages.

## Steps

### Step 1: Write stateful metadata regressions

Create tests/task-writer-smart-date.test.ts for the actual synchronous writer entry and tests/smart-date-metadata.test.ts using actual TaskParser, SmartDateProcessor and EditorState. Pin both trigger sources. Cover target second in SCHEDULED/DEADLINE, reversed date order, STARTED/DESCRIPTION before/between dates, quoted/nested tasks, EOF, unchanged date, keyword-removal on/off and existing single-date retagging. Include a neighboring task/prose boundary and a selection after preserved metadata.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/smart-date-metadata.test.ts tests/task-writer-smart-date.test.ts tests/smart-date-processor.test.ts` → new deletion/duplicate tests fail for the demonstrated reasons; existing conversion behavior remains pinned.

### Step 2: Dispatch disjoint edits and bound metadata discovery

Add a narrow synchronous TaskWriter entry accepting a typed smart-date edit request and the current CM view: task/source-line identity, updated task text, insert versus replace date lines, trigger source and expected original content. The writer validates current source/view identity, computes original-document ranges, performs one disjoint CM transaction, and returns a boolean/result synchronously. SmartDateProcessor continues recognition/date formatting and delegates both non-table natural conversion and existing inline structured conversion to this writer entry; it must not dispatch those task writes itself. Keep the actual source-facing change inside TaskWriter; do not reduce it to a generic arbitrary-dispatch wrapper. Do not await a file queue, persist via vault or add another transaction inside RAF. Type-only CodeMirror imports or a precise structural view interface may be used without dependency changes.

Compute task-line and selected-date replacements against one original document and dispatch them as disjoint changes in that writer-owned transaction. Preserve all intervening text. For insertion retain existing indent rules. Map existing selection through the change set for cursorLeave; for debounce place the cursor at the end of the inserted/replaced date after mapping original positions. Retain stale-line checks before RAF dispatch. Discover dates through supported metadata with the same quote/nesting boundaries as parser helpers; do not cross another task or unrelated prose. Keep existing blank-line behavior characterized rather than making unreviewed grammar changes.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/smart-date-metadata.test.ts tests/task-writer-smart-date.test.ts tests/smart-date-processor.test.ts tests/task-line-utils.test.ts` → all pass; transaction output preserves every untargeted metadata line and selection mapping is asserted.

### Step 3: Verify the host and document preservation

Extend tests/integration/smart-date.test.ts using host editor APIs/commands with a task carrying both dates plus STARTED. Assert the live editor buffer after the actual cursor-leave trigger, not just dispatch payload. Update docs/editor.md to state targeted-date updates preserve other metadata and explain retained one-date retagging; add concise CHANGELOG text.

**Verify:** `npm run build` then `./node_modules/.bin/playwright test --config=tests/integration/playwright.config.ts tests/integration/smart-date.test.ts --project=obsidian` → selected file executes, all cases pass and no duplicate dates appear.

### Step 4: Complete verification and record evidence

Format only scoped changed files. Run full unit suite, typecheck/build, lint and diff review. Run the informational `npm run docs:screenshots -- --check` manually for source changes; record stale rows without capturing images. Update this plan's Results and its index status with actual red/green results and unresolved host limitations; keep local planning files unstaged.

**Verify:** `npm test -- --runInBand`, `npm run build`, `npm run lint`, `git diff --check` → all exit 0; `git diff --name-only` and `git status --short` → only intended scoped product changes plus preexisting user work. An unavailable required host gate is incomplete verification, never a passing result.

## Test plan

Follow the existing controlled RAF setup and helpers from tests/helpers/test-helper.ts. Use local date constructors. Assert full resulting strings, metadata multiplicities, sibling bytes and post-transaction selection, not merely dispatch counts. The required regression fixture has the replacement target after another date. Inline structured-date recognition remains a distinct path, but its synchronous source edit also delegates to TaskWriter; run existing output tests unchanged and add a delegation assertion. Table-only conversion remains out of scope.

## Done criteria

- [ ] Replacing either date preserves the other date and all STARTED/CLOSED/DESCRIPTION bytes.
- [ ] Recognized existing dates below supported metadata are updated without duplicates.
- [ ] Both trigger sources retain intended cursor behavior, each edit uses one synchronous TaskWriter-owned transaction and non-table processor paths delegate their source edits.
- [ ] Full unit suite, build/typecheck, lint and diff gates pass; required host tests execute and pass.
- [ ] Named docs and concise CHANGELOG behavior text are updated; no screenshots are regenerated.
- [ ] Only scoped product files change; Results and local index record actual outcomes and limitations.

## STOP conditions

Stop and report rather than improvising if:

- The accepted date-type fallback or blank-line policy must change to implement preservation; stop for that product decision.
- A helper would require parsing the whole vault or constructing a TaskParser per metadata line.
- The fix requires modifying table-cell conversion; leave that to its own bounded work.
- The writer seam would await a queue/file operation during the active CM callback, create a second transaction or expose a generic arbitrary-dispatch API.
- The same verification fails twice after focused corrections, or another file must change.

## Maintenance notes

064 shares TaskWriter with 053/065/055: sequence those edits and re-run their regression contracts without creating a hard dependency. The synchronous smart-date entry must never await the ordinary async file queue. 064 and 054 may share only an established pure metadata classifier; each remains independently executable. Keep exact-byte and mapped-selection tests whenever metadata ordering changes. Coordinate with 065's format-aware indent helpers if it lands first.

## Results

Implemented 2026-11-11.

- `TaskWriter.applySmartDateEdit` is a narrow synchronous entry that validates
  the active file, task-line text and bounds, then dispatches one transaction
  of disjoint changes: the task line and the date line are written separately,
  so every metadata line between them (SCHEDULED, DEADLINE, STARTED, CLOSED,
  DESCRIPTION) is preserved byte-for-byte. A null replacement inserts below the
  task; a debounce trigger resolves the cursor in the post-change document.
- `SmartDateProcessor` no longer dispatches these writes itself: natural and
  inline conversions build a typed request and delegate to the writer. Date
  discovery walks past STARTED, CLOSED and DESCRIPTION and stops at the next
  task or unrelated prose, so a date below those lines is updated rather than
  duplicated. The existing first-date retagging fallback is retained.
- `tests/smart-date-metadata.test.ts` (real processor + writer over
  `EditorState`, controlled RAF) covers a replaced DEADLINE keeping
  SCHEDULED/STARTED, a date below STARTED updated without a duplicate, and
  inline dates moved below the task. `tests/task-writer-smart-date.test.ts`
  pins disjoint changes, insertion, list-marker indent, the mapped debounce
  cursor and stale-line rejection. Older processor tests now assert the
  delegated request instead of the removed direct dispatch.
- Docs: `docs/editor.md`; one concise CHANGELOG entry.

Red/green evidence: with `task-writer.ts` and `smart-date-processor.ts`
reverted, the new suites fail (7 failed / 1 passed); with the change they pass
(8 passed). Final gates: `npm test -- --runInBand` 181 suites / 5,578 tests;
`npm run build` and `npm run lint` exit 0.

Limitations: no Playwright host spec was added, so cursor-leave behaviour in
real Obsidian is covered through `EditorState` transactions rather than the
host. The inline-path test asserts the resulting document; delegation is
covered by the writer suite rather than a dispatch spy.
