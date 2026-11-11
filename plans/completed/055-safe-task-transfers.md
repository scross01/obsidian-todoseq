# Plan 055: Route cell-aware task transfers through TaskWriter without overwriting edits

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm its expected result before continuing. Write regression tests before changing product code. If a STOP condition occurs, stop and report rather than improvising. Update this plan's status in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat e3d0456..HEAD -- src/services/task-writer.ts src/services/task-update-coordinator.ts src/services/editor-controller.ts src/view/task-list/task-list-view.ts src/view/task-list/task-drag-drop.ts src/view/embedded-task-list/task-list-renderer.ts src/utils/task-sub-bullets.ts tests/task-transfer.test.ts tests/task-update-coordinator-rejection-recovery.test.ts tests/task-drag-drop.test.ts tests/task-list-view.test.ts tests/embedded-task-list-renderer.test.ts tests/editor-controller-operations.test.ts tests/integration/task-transfers.test.ts docs/moving-tasks.md ARCHITECTURE.md CHANGELOG.md`
>
> Compare changed paths and the Current state excerpts with live code before proceeding. Changes from named predecessor plans are expected: verify their documented contract, and record reconciled locations here. An unexplained semantic mismatch is a STOP condition. Also inspect uncommitted changes; do not overwrite other work.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: 054 (metadata extraction/cleanup) and 080 (escaped-delimiter host gate must close before table transfers; reuse any resulting source-span contract)
- **Category**: bug
- **Planned at**: commit `e3d0456`, revised 2026-11-10 (original finding 2026-10-31)
- **Status**: TODO
- **Origin**: 2026-10-31 improve review, findings R03, R08; this file contains the required context independently of that review.

## Why this matters

Panel actions resolve tasks by path+line and lose table-cell identity; copying/moving a table task copies/removes its entire row. Multiple transfer paths also read and then replace whole files, so concurrent appends overwrite each other and active unsaved edits can be missed. All task writes must go through TaskWriter, using the latest source identity and editor-aware persistence.

## Current state

Panel callbacks (`src/view/task-list/task-list-view.ts:184–217`) use:

```ts
const freshTask = this.tasks.find(
  (t) => t.path === task.path && t.line === task.line,
);
```

The destination append (`:1648–1651`) is:

```ts
const currentContent = await this.plugin.app.vault.read(todayNote);
const newContent =
  currentContent.trimEnd() + '\n\n' + allLines.join('\n') + '\n';
await this.plugin.app.vault.modify(todayNote, newContent);
```

Source removal (`:1685–1693`) removes getTaskRemovalRange's entire row. Embedded renderer repeats these operations; `task-drag-drop.ts:399–443` repeats snapshot append/removal. EditorController daily-note commands also append directly. `getTaskKey` in `src/utils/task-utils.ts` is the established path:line[:cellIndex] identity. Additional 2026-11-10 evidence: parseTableCells (src/utils/task-line-utils.ts:343) and modifyTableCell (src/services/task-writer.ts:512) independently split escaped pipes. The parser assigns index 2 to the task in `| a\|b | TODO actual task |`, unlike displayed cell index 1. Plan 080 owns host characterization and the bounded shared scanner repair if its gate opens; this plan must not silently invent a third splitter.

TaskWriter.applyRecurrenceUpdate uses vault.process for an inactive file and editor operations for a live file: retain that host-aware convention.

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

Targeted commands and expected red/green outcomes are specified per step. Dependencies are already installed; do not update the lockfile as a side effect. The earlier 2026-10-31 audit at 359916b passed 170 unit suites / 5,500 tests, typecheck and lint; those historical results are not verification of the proposed fix or of the current revision. Build/integration commands are executor gates, not commands run while authoring this plan.

## Scope

**In scope** (the only product/test/docs files to modify; new test files below may be created):

- `src/services/task-writer.ts`
- `src/services/task-update-coordinator.ts` — only the shared per-file serialization seam; retain ordinary update/error contracts
- `src/services/editor-controller.ts`
- `src/view/task-list/task-list-view.ts`
- `src/view/task-list/task-drag-drop.ts`
- `src/view/embedded-task-list/task-list-renderer.ts`
- `src/utils/task-sub-bullets.ts`
- `tests/task-transfer.test.ts`
- `tests/task-update-coordinator-rejection-recovery.test.ts`
- `tests/task-drag-drop.test.ts`
- `tests/task-list-view.test.ts`
- `tests/embedded-task-list-renderer.test.ts`
- `tests/editor-controller-operations.test.ts`
- `tests/integration/task-transfers.test.ts`
- `docs/moving-tasks.md`
- `ARCHITECTURE.md`
- `CHANGELOG.md`

**Explicit source-scope widening (2026-11-10):** TaskUpdateCoordinator is added solely to coordinate ordinary writes with writer-owned transfers. Its error containment, recurrence policy and optimistic-state model are not general refactor targets. No new generic persistence module is authorized.

Local bookkeeping: this plan and its row/dependency notes in `plans/README.md` may be updated but never staged.

**Out of scope:** No importer, new task composer, new settings, arbitrary table grammar, filesystem APIs, archive undo redesign, or public API. Plan 054's expected predecessor changes and plan 080's explicit gate verdict/span contract must be checked before execution. Source scope is not widened to implement a table tokenizer here. If 080 closes no-action, only the table boundary it actually verified is eligible; ambiguous destructive cell transfers stay unavailable with an accurate notice. All files not explicitly listed above require a scope revision before editing. Never regenerate `docs/assets/` or the screenshot manifest as a side effect.

## Git workflow

Use the current worktree and a feature branch from the default branch (suggested: `advisor/055-safe-task-transfers`); preserve existing local work. Do not create a separate worktree/clone unless explicitly requested. Do not stage/commit `plans/`, `.freebuff/`, or local plugin `data.json`. Do not push or open a PR without instruction. If committing is requested, stage only in-scope product files, use a temporary commit-message file, and delete it afterward. Include the project trailers `🤖 Generated with Codebuff` and `Co-Authored-By: Codebuff <noreply@codebuff.com>`. Describe behavior in commit/changelog text, never local plan numbers.

## Steps

### Step 1: Check predecessors and write transfer integrity tests

Read 054 Results and 080 Results first. If 080 is blocked or has no explicit verdict, stop before implementing table transfer changes. A source-only characterization is not a host gate pass.

Create `tests/task-transfer.test.ts` using actual TaskWriter with a typed in-memory vault/editor seam. Add concurrent destination append, stale source, unsaved source/destination, and failure cases. Add menu and drag tests carrying a second table cell through actual callbacks, including two identical state keywords and one plain-content cell. Reuse 080's verified escaped-delimiter cases if its fix gate opened; assert complete source/destination bytes and selected cell identity. A closed no-action gate must produce explicit safe refusal for unverified ambiguous cells, never a guessed removal. Add a transfer concurrent with an ordinary state/date write so separate queue maps cannot overwrite one another; retain 053 recurrence and 065 source capabilities if present.

**Verify**: `npm test -- --runInBand --coverage=false --runTestsByPath tests/task-transfer.test.ts tests/task-update-coordinator-rejection-recovery.test.ts tests/task-drag-drop.test.ts tests/task-list-view.test.ts` → new tests demonstrate overwrite/cell identity failures; existing transfer outputs are pinned.

### Step 2: Implement writer-owned operations

Implement the typed extraction/transfer seam in TaskWriter, including serial access, current-source validation, cell-local edits and destination/source failure results. Source/destination operations must coordinate with ordinary TaskUpdateCoordinator writes to the same files; do not create a separate transfer queue that only serializes transfers with each other. Use a stable lock ordering for two-path work (or an equivalent tested non-deadlocking queue contract), and revalidate immediately before source removal. When an editor is open, use its live buffer; do not treat vault.read of an unsaved destination as current truth. Read host content with Obsidian APIs only. Return enough typed outcome detail for callers to distinguish success, no-op, stale source and partial completion; never treat [] extraction as a successful empty transfer.

**Verify**: `npm test -- --runInBand --coverage=false --runTestsByPath tests/task-transfer.test.ts` → all integrity, interleaving and failure tests pass; queues drain after failures.

### Step 3: Switch every transfer entry point

Replace panel, embedded, drag/drop and editor-command transfer persistence with the writer seam. Use the shared source spans established by 080; preserve delimiters/untouched sibling cells verbatim. Do not flatten unsupported cell syntax. Use getTaskKey for refresh lookup and include cellIndex in drag identity. UI can create/resolve today's note and show notices; it must not mutate task bytes. Keep existing desktop/mobile command availability and same-note guards.

**Verify**: `npm test -- --runInBand --coverage=false --runTestsByPath tests/task-transfer.test.ts tests/task-update-coordinator-rejection-recovery.test.ts tests/task-drag-drop.test.ts tests/task-list-view.test.ts tests/embedded-task-list-renderer.test.ts tests/editor-controller-operations.test.ts` → all affected unit suites pass; failures propagate into accurate notices.

### Step 4: Verify transfers in Obsidian and document guarantees

Add `tests/integration/task-transfers.test.ts` for table-cell menu actions, active unsaved buffers, and successful copy/move/migrate. Invoke Obsidian commands via app.commands, never keyboard shortcuts. Update `docs/moving-tasks.md` with table conversion, migration metadata and partial completion semantics; update ARCHITECTURE and a concise CHANGELOG entry.

**Verify**: `npm run build` then `./node_modules/.bin/playwright test --config=tests/integration/playwright.config.ts tests/integration/task-transfers.test.ts tests/integration/table-tasks.test.ts --project=obsidian` → both named files execute and host-level tests pass and neighboring cell/editor content is unchanged.

### Step 5: Complete verification and scope review

Format only changed files, run the full unit suite, typecheck/build and lint. For any specified host integration gate, record actual results and restore the isolated fixture through the harness; do not substitute jsdom success for real Obsidian verification. Run `npm run docs:screenshots -- --check` manually when plugin sources changed; stale rows are informational, record them without regeneration. Update the local plan/index status with tests and limitations.

**Verify**: `npm test -- --runInBand`, `npm run build`, and `npm run lint` → each exits 0; `git diff --check` → exit 0; `git diff --name-only` → only intended in-scope product changes (besides preexisting user work). An unavailable required integration environment must be reported as incomplete verification, not a passing result.

## Test plan

Use pure helpers from plan 054 unchanged as the metadata boundary; use typed host stubs around the real writer, not a mock transfer implementation. Matrix: plain/bullet/checkbox/table, panel/embed/drag/command, copy/move/migrate, two simultaneous appends, failed destination, failed source, renamed/deleted source, no-op same note, custom state and empty migration marker. Synchronize races with deferred promises, not real sleeps. Table expectations include original delimiter/spacing bytes and untouched sibling cells.

## Done criteria

- [ ] 054 and 080 predecessor contracts are reconciled; unresolved table identity cannot enter a destructive transfer.
- [ ] All transfer entry points delegate task-byte writes to TaskWriter.
- [ ] Concurrent append tests retain both payloads and preexisting destination edits.
- [ ] Second-cell transfers affect only that task; migration preserves sibling keywords.
- [ ] Destination failure never removes source; source failure produces an explicit partial outcome.
- [ ] No Node filesystem API is introduced into plugin code.
- [ ] All targeted regression suites and specified integration gates pass; full `npm test -- --runInBand`, `npm run build` and `npm run lint` exit 0.
- [ ] Named docs pages and concise CHANGELOG behavior summaries are updated.
- [ ] No out-of-scope edits or regenerated screenshot assets appear in the task diff.
- [ ] `plans/README.md` status and this plan's Results section record actual commands/results and any outstanding verification; local planning files stay unstaged.

## STOP conditions

Stop and report (do not improvise) if:

- The live code differs semantically from the excerpts beyond verified predecessor-plan changes.
- 080 lacks an explicit completed host gate/result or its verified span contract cannot be reused without tokenizer changes in unlisted files.
- Sharing serialization would change ordinary queue error containment, introduce nested locks that cannot drain, or require a generic persistence framework beyond the named coordinator/writer seam.
- A selected cell cannot be losslessly converted with the existing parser/writer grammar; report the syntax and disable its destructive action pending a revised plan rather than flattening unknown content.
- A source revalidation is ambiguous; abort with a notice rather than searching for a similar task and deleting it.
- The design requires changing ordinary task-state update queue error semantics or claiming cross-file atomic rollback.
- A verification fails twice after a focused correction, or the fix requires editing an out-of-scope path.

## Maintenance notes

053 → 065 sets recurrence/source-format contracts that transfer helpers must preserve if present. 080 is a hard table-identity gate, not a request for 055 to implement arbitrary grammar. The coordinator serialization seam is the only added product-source scope; re-run its rejection-continuation suite with transfer interleavings. Further queue/error-policy changes require a new scope decision. Coordinate with daily-note detection fixes but do not make them a hard dependency: unit tests can provide a resolved destination. Review lock cleanup and source identity on every future transfer feature. Do not expand this into a generic persistence framework.

## Results

Implemented 2026-11-11, after 054 and 080.

Predecessor check: 054's metadata classifier and cleanup policy are untouched;
080 provided the table identity contract (`parseTableCells` spans plus
`replaceTableCellContent`), and this plan reuses it rather than introducing
another splitter.

- New `TaskWriter.transferTask(task, destination, action, options?)` returns a
  typed `TaskTransferResult` (`success`, `already-there`, `stale-source`,
  `destination-failed`, `partial`). It reads the live editor buffer for an open
  file, appends through `vault.process` (an atomic read-modify-write, so
  concurrent transfers cannot overwrite each other), revalidates the source
  task's keyword/text immediately before changing it, and never removes the
  source when the destination write failed.
- Table cell tasks transfer as a plain task line; a move clears only that
  cell's span and removes the row only when no cell has content left. Sibling
  cells keep their exact bytes.
- The panel view, embedded list renderer and drag-and-drop handler now resolve
  the destination and call the writer seam; each maps the typed outcome to an
  accurate notice. Drag-and-drop keeps its drop-position insert through the
  writer's `insertAt` option. Unused direct vault-append and row-removal
  helpers were removed from the views.
- `tests/task-transfer.test.ts` exercises the real writer with an in-memory
  vault: copy, two racing copies, move, stale source, destination failure,
  migrate, table cell move and full-row removal. Drag-and-drop tests now assert
  delegation and notices instead of the removed private helpers.
- Docs: `docs/moving-tasks.md` states the guarantees; `ARCHITECTURE.md` records
  the writer-owned seam; one concise CHANGELOG entry.

Verification at this revision: targeted transfer/drag/panel/embedded/coordinator
suites 219 tests pass; `npm test -- --runInBand` 177 suites / 5,550 tests;
`npm run build` and `npm run lint` exit 0.

Limitations: no Playwright `task-transfers` host spec was added, so the real
Obsidian editor-buffer path and live table rendering were not exercised end to
end. The editor branch is exercised only through the shared writer logic used
by the in-memory vault tests. Ordinary TaskUpdateCoordinator queue semantics
were left unchanged; atomic `vault.process` writes provide the interleaving
safety instead of a new transfer queue.
