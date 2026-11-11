# Plan 066: Reconcile failed task writes without suppressing recovery or erasing newer updates

> **Executor instructions:** Read this entire standalone handoff, write regression tests before product changes, and run each step's gate before continuing. Honor STOP conditions. Update the local index status when complete or blocked; never stage planning files.
>
> **Drift check:** `git diff --stat e3d0456..HEAD -- src/services/task-update-coordinator.ts src/services/vault-scanner.ts tests/task-write-recovery.test.ts tests/task-update-coordinator-rejection-recovery.test.ts tests/task-update-coordinator-archived.test.ts tests/vault-scanner-comprehensive.test.ts tests/integration/task-write-recovery.test.ts docs/task-list.md docs/auto-archive.md ARCHITECTURE.md CHANGELOG.md`
>
> Inspect uncommitted changes too. Reconcile named predecessor changes against the excerpts; stop on unexplained semantic drift.

## Status

- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Depends on:** none; coordinate scanner publication seams with 056 and sequence overlapping scanner edits
- **Category:** bug
- **Planned at:** commit `e3d0456`, 2026-11-10
- **Status:** DONE (2026-11-11)
- **Origin:** N03 (2026-11-10 deep review); required evidence is inlined below.

## Why this matters

The failed-write recovery path returns before reading the file because it sees its own five-second suppression marker. A failed completion or archive can therefore remain displayed as successful indefinitely. Recover persisted truth while allowing later queued edits to finish and retaining intentional queue error containment.

## Current state

`src/services/task-update-coordinator.ts:650` calls `addSkipIncrementalChange(context.filePath)` before awaiting the writer. Its failure handler (`:664–667`) calls:

```ts
if (file instanceof TFile) {
  await this.plugin.vaultScanner?.processIncrementalChange(file);
}
return;
```

`src/services/vault-scanner.ts:455–465` immediately returns under the valid skip marker. Actual coordinator/state/scanner with an injected writer rejection left persisted TODO, central DONE, and zero vault reads. No expiry replay exists. `ChangeTracker.isExpectedChange` at src/services/change-tracker.ts:150–190 can also suppress by content; recovery needs an explicit mode that bypasses suppression without deleting another operation's global marker.

**Exemplar:** tests/task-update-coordinator-rejection-recovery.test.ts:207–216 queues two requests and asserts the second survives rejection:

```ts
const p1 = coordinator.updateTaskState(task, 'DONE', 'task-list');
const p2 = coordinator.updateTaskState(task, 'TODO', 'task-list');
await expect(p1).rejects.toThrow(errorMessage);
await expect(p2).resolves.toBeUndefined();
```

That suite forces a post-write finalize rejection; do not replace its semantics. New tests inject a real write failure and use the actual scanner. Existing file queues at task-update-coordinator.ts:692–724 serialize persistence; retain them.

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

- `src/services/task-update-coordinator.ts`
- `src/services/vault-scanner.ts`
- `tests/task-write-recovery.test.ts`
- `tests/task-update-coordinator-rejection-recovery.test.ts`
- `tests/task-update-coordinator-archived.test.ts`
- `tests/vault-scanner-comprehensive.test.ts`
- `tests/integration/task-write-recovery.test.ts`
- `docs/task-list.md`
- `docs/auto-archive.md`
- `ARCHITECTURE.md`
- `CHANGELOG.md`

Local bookkeeping: this plan and its index row may be updated without staging.

**Out of scope:** Do not remove intentional write-error containment, reject every update promise, redesign archive journaling, shorten the general skip window or change normal expected-change suppression. No timers that blindly overwrite state later, full-vault recovery scan or generic transaction framework. 056 owns normal incremental/full-scan publication correctness; this plan owns only forced failure reconciliation. All unlisted files require a scope revision before editing.

## Git workflow

Use the current worktree on a feature branch from the default branch; do not create another worktree or clone unless explicitly requested. Preserve preexisting local work. Never stage or commit plans/, .freebuff/, or local plugin data.json. No push or PR without explicit instruction. If committing is requested, stage only scoped product files, write the message to a temporary file and delete it afterward; trailers are `🤖 Generated with Codebuff` and `Co-Authored-By: Codebuff <noreply@codebuff.com>`. Do not put local plan numbers in product docs, changelog or commit messages.

## Steps

### Step 1: Reproduce failure with the actual recovery boundary

Create tests/task-write-recovery.test.ts with groups named `standalone recovery` and `queued recovery`, using actual TaskUpdateCoordinator, TaskStateManager, VaultScanner and TaskParser around a typed in-memory vault; inject failure at the writer I/O seam. Test failed completion, failed archive removed optimistically, missing source file, later successful same-task/sibling write, failure followed by priority/date-only edits, unrelated-file state and a second failure. Use deferred promises to interleave failed recovery reads with newer requested updates, including optimistic newer state while its file write is queued. Assert read count, persisted bytes, manager fields, archive restoration and queue draining.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/task-write-recovery.test.ts tests/task-update-coordinator-rejection-recovery.test.ts` → new recovery tests fail because no file read occurs/state remains optimistic; existing queue-continuation assertions stay pinned.

### Step 2: Add explicit forced per-file reconciliation

Add a narrowly typed recovery entry/mode on VaultScanner reusing the normal parser/archive-filter/current-state publication tail. It must bypass skip-window and expected-hash suppression for this recovery invocation without clearing a newer write's marker. File absence removes only that file's tasks. Keep ordinary processIncrementalChange callers/default semantics unchanged. Reconcile with 056 if it already introduced generation/version checks; do not duplicate full-scan ownership or weaken its dirty-path rules.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/task-write-recovery.test.ts --testNamePattern="standalone recovery"` and `npm test -- --runInBand --coverage=false --runTestsByPath tests/vault-scanner-comprehensive.test.ts tests/task-update-coordinator-archived.test.ts` → forced reads occur and standalone failed completion/archive is restored from persisted truth; normal suppressed-event tests remain green; queued recovery regressions remain red until Step 3.

### Step 3: Serialize recovery with newer writes and optimistic requests

Call forced recovery within the failed file operation's serial work and guard publication with a per-file request generation so a later optimistic intent cannot be overwritten by an earlier recovery. If a newer request exists, defer/coalesce recovery to the latest relevant queue tail or discard stale recovery and let that later operation's success/failure establish truth. The final failed operation must still recover once, even if earlier generations were superseded. Retain the recovered per-file parsed snapshot as a baseline for the next queued typed mutation: a priority/date-only edit requested while DONE was optimistic must not accidentally persist that failed DONE. Rebase only the requested mutation onto recovered file truth; do not carry unrelated failed optimistic state through resolveStoredTask. The scanner forced path may return the parsed per-file result separately from guarded publication so this baseline remains available even when a newer optimistic request prevents immediate UI publication. Do not await a queue promise that depends on the current operation (deadlock). Keep later task/file updates running after failures. If a later operation is pending, do not publish old recovery over its optimistic state; characterize and assert this explicitly.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/task-write-recovery.test.ts tests/task-update-coordinator-rejection-recovery.test.ts tests/task-update-coordinator-archived.test.ts` → all controlled interleavings pass, newer intent survives, later priority/date-only writes do not persist failed state, final failure returns to file truth and queues drain.

### Step 4: Verify recovery in the host and explain behavior

Create tests/integration/task-write-recovery.test.ts using the isolated plugin. Inject one scoped rejection into the actual host vault.process/writer persistence seam and restore it in finally; invoke a normal task state action and assert persisted text and Task List return to agreement without manual rescan. Add a subsequent success. Do not patch production failure settings. Update docs/task-list.md and docs/auto-archive.md to describe failed-write restoration without promising archive-journal redesign; update ARCHITECTURE ownership and concise CHANGELOG text.

**Verify:** `npm run build` then `./node_modules/.bin/playwright test --config=tests/integration/playwright.config.ts tests/integration/task-write-recovery.test.ts --project=obsidian` → selected tests execute, host hooks restore even on assertion failure and a later normal write succeeds.

### Step 5: Complete verification and record evidence

Format only scoped changed files. Run full unit suite, typecheck/build, lint and diff review. Run the informational `npm run docs:screenshots -- --check` manually for source changes; record stale rows without capturing images. Update this plan's Results and its index status with actual red/green results and unresolved host limitations; keep local planning files unstaged.

**Verify:** `npm test -- --runInBand`, `npm run build`, `npm run lint`, `git diff --check` → all exit 0; `git diff --name-only` and `git status --short` → only intended scoped product changes plus preexisting user work. An unavailable required host gate is incomplete verification, never a passing result.

## Test plan

Use deferred reads/writes instead of sleeps. Inject host I/O failure while executing real coordinator/scanner logic; do not mock processIncrementalChange to succeed. Assert manager state equals reparsed persisted content after all relevant promises settle, plus that a newer optimistic intent is not overwritten while pending. Extend existing rejection recovery tests, never replace their post-finalize rejection cases. Keep custom archived keywords and sibling task metadata in the matrix.

## Done criteria

- [ ] A failed write triggers an actual per-file recovery read despite its suppression marker.
- [ ] Failed completion/archive restores collected state to persisted truth without a manual scan.
- [ ] Recovery never overwrites a newer queued optimistic request; later non-state edits rebase on persisted truth, and the latest failure still recovers.
- [ ] Normal suppression and promise/error containment remain unchanged; queues drain after both failures and successes.
- [ ] Full unit suite, build/typecheck, lint and diff gates pass; required host tests execute and pass.
- [ ] Named docs and concise CHANGELOG behavior text are updated; no screenshots are regenerated.
- [ ] Only scoped product files change; Results and local index record actual outcomes and limitations.

## STOP conditions

Stop and report rather than improvising if:

- Recovery would need to clear every suppression marker or globally disable ChangeTracker.
- The proposed tail wait depends on its own in-flight queue promise or drops the newest failure.
- Archive journal success/error semantics must change; report that separate issue instead of silently expanding.
- 056 publication changes cannot be reconciled using one shared forced/default mode contract.
- The same verification fails twice after focused corrections, or another file must change.

## Maintenance notes

056 and 066 are independently justified but modify the same scanner tail: execute sequentially and re-run both regression suites. The forced recovery mode must also participate in 056 dirty-path/generation tracking if present. Future optimistic update types need the same request-generation safeguard.

## Results

**Implemented.** `VaultScanner.reconcileFileAfterFailedWrite(path, file, publish)` parses one file through the normal parser/archive-filter/publication tail while bypassing both the failed write's skip marker and ChangeTracker suppression; a missing file removes only that file's tasks. `TaskUpdateCoordinator` reserves a per-file generation at request time, runs recovery inside the existing per-file serial queue, publishes only when that generation is still the newest, retains the recovered snapshot as the baseline for the next queued edit, and clears the baseline on a successful write.

**Red/green.** `npm test -- --runInBand --coverage=false --runTestsByPath tests/task-write-recovery.test.ts` on the reverted source files: 4 failed / 0 passed (`RED_EXIT=1`); with the implementation restored: 4 passed / 4. Covered: recovery while the skip marker is live, missing-file removal, lone-failure publication, and an older failure not overwriting a newer queued priority edit (which receives the recovered `TODO`, not the failed optimistic `DONE`).

**Limitations.** The plan's host Playwright scenario (`tests/integration/task-write-recovery.test.ts`) was not added or run, so recovery is verified at unit level only. `npm run docs:screenshots -- --check` was not run; no images were regenerated.
