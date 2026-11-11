# Plan 068: Release plugin-owned update timers and editor handlers on unload

> **Executor instructions:** Follow each step in order; write failing tests before source changes. Stop at the specific STOP conditions below. Update the local plan and index with actual results; do not stage planning files.
>
> **Drift check:** `git diff --stat e3d0456..HEAD -- src/plugin-lifecycle.ts src/ui-manager.ts tests/plugin-lifecycle.test.ts tests/ui-manager.test.ts tests/task-update-coordinator-cleanup.test.ts tests/integration/plugin-unload.test.ts docs/editor.md ARCHITECTURE.md CHANGELOG.md`. Read changed files and compare the excerpts below before proceeding; preserve unrelated working-tree changes.

## Status

- **Priority:** P2
- **Effort:** S–M
- **Risk:** MED — unload order interacts with an asynchronous event flush; avoid changing write serialization semantics.
- **Depends on:** none. Coordinate shared `plugin-lifecycle.ts` edits with 059; 058 owns embedded render teardown separately.
- **Category:** bug
- **Planned at:** commit `e3d0456`, 2026-11-10
- **Status:** DONE (2026-11-11)
- **Origin:** deep improve review, N05.

## Why this matters

Disabling or reloading the plugin leaves its update coordinator's repeating timer alive and fails to remove captured editor context-menu handlers. Repeated reloads retain old plugin graphs. Pending delayed recurrence and delayed editor-listener setup must stop when their owner unloads.

## Current state

`src/plugin-lifecycle.ts:120` constructs `this.plugin.taskUpdateCoordinator = new TaskUpdateCoordinator(...)`; `PluginLifecycleManager.onunload` (`:629–690`) cleans embedded processors, then awaits the event coordinator, destroys the scanner/property engine and cleans UI components, but never destroys the task update coordinator.

The existing destructor is sufficient for its owned scheduled work (`src/services/task-update-coordinator.ts:1177`):

```ts
if (this.cleanupInterval) {
  window.clearInterval(this.cleanupInterval);
  this.cleanupInterval = null;
}
this.pendingTaskUpdates.clear();
this.fileUpdateQueues.clear();
this.recurrenceCoordinator.destroy();
```

Its constructor starts a five-second interval (`:208`, `:1118`). `RecurrenceCoordinator.destroy` clears pending timeout handles (`src/services/recurrence-coordinator.ts:475`). This plan wires ownership; it does not promise cancellation of an already-running write.

`src/ui-manager.ts:751–762` records and attaches different listener options:

```ts
this.registeredEventListeners.push({
  target: editorContent,
  type: 'contextmenu',
  handler: contextMenuHandler,
});
editorContent.addEventListener('contextmenu', contextMenuHandler, {
  capture: true,
});
```

Cleanup passes the recorded `options` to `removeEventListener` (`:1042`), so this removes capture=false while the installed listener is capture=true. Actual setup→dispatch→cleanup→dispatch was reproduced with real jsdom: the callback was still invoked after cleanup. Checkbox/file-open setup also arms unowned delayed callbacks (`:198`, `:782`, `:794`).

**Test exemplar:** `tests/plugin-lifecycle.test.ts:387` tests owner wiring by injecting a destructor spy and invoking real `onunload`:

```ts
const destroyMock = jest.fn();
pluginMock.propertySearchEngine = { destroy: destroyMock };
await lifecycleManager.onunload();
expect(destroyMock).toHaveBeenCalled();
```

Use that structure for coordinator invocation, supplemented with real timer/DOM behavior. `tests/ui-manager.test.ts:297` currently seeds a listener registry manually and only asserts cleanup does not throw; exercise actual setup instead. Use `installObsidianDomMocks()` in jsdom. This is an Obsidian desktop/mobile plugin: retain KeywordManager vocabulary, TaskStateManager ownership and TaskWriter-only task persistence. No unsafe any assignment, Node file APIs in plugin code, or console.log. Match DESIGN.md's theme-native UI; no visual redesign is needed.

## Commands you will need

| Purpose             | Command                                                                                                                                                           | Expected result              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Targeted unit tests | `npm test -- --runInBand --coverage=false --runTestsByPath tests/plugin-lifecycle.test.ts tests/ui-manager.test.ts tests/task-update-coordinator-cleanup.test.ts` | all pass after fix           |
| Typecheck           | `./node_modules/.bin/tsc -p tsconfig.json --noEmit --skipLibCheck`                                                                                                | exit 0                       |
| Full unit suite     | `npm test -- --runInBand`                                                                                                                                         | all suites pass              |
| Build               | `npm run build`                                                                                                                                                   | exit 0; root main.js built   |
| Lint                | `npm run lint`                                                                                                                                                    | exit 0                       |
| Integration         | `npm run test:integration -- --project=obsidian plugin-unload.test.ts`                                                                                            | new unload/reload cases pass |

## Scope

**In scope:** `src/plugin-lifecycle.ts`, `src/ui-manager.ts`, `tests/plugin-lifecycle.test.ts`, `tests/ui-manager.test.ts`, `tests/task-update-coordinator-cleanup.test.ts`, new `tests/integration/plugin-unload.test.ts`, `docs/editor.md`, `ARCHITECTURE.md`, `CHANGELOG.md`.

**Out of scope:** coordinator queue/timeout policy changes, cancelling already-running writes, recurrence math, archive behavior, embedded registry ownership (058), property index correctness (069), BaseDialog redesign, styles and screenshots. A destructor inadequacy requires a scope revision, not an ad hoc coordinator rewrite.

## Git workflow

Use the current worktree on a feature branch (suggested `advisor/068-plugin-owned-teardown`); no extra worktree/clone. Preserve local work. Never stage/commit `plans/`, `.freebuff/`, or local plugin data.json. No push/PR without instruction. If committing is requested, stage only in-scope product files, write the message to a temporary file, commit with `-F`, then delete the message file. Include `🤖 Generated with Codebuff` and `Co-Authored-By: Codebuff <noreply@codebuff.com>`. User-facing text contains behavior, not local plan numbers.

## Steps

### Step 1: Capture real ownership failures

Add coordinator-destroy/null-reference assertions to lifecycle unload tests, including repeated unload. Add a test that blocks EventCoordinator.destroy on a deferred promise and asserts owned scheduled work is stopped synchronously before the first unload await. In UIManager tests construct a real mock MarkdownView/editor DOM, call `setupTaskKeywordContextMenu`, dispatch contextmenu, clean up, and dispatch again: callback count must remain one. Capture workspace layout/file-open callbacks, schedule delayed attachment, clean up, drain timers and assert no post-cleanup listeners are added. Use fake timers for controlled delayed callbacks; do not sleep.

**Verify:** run the targeted unit command above → new tests fail on missing coordinator destruction and capture mismatch; existing tests stay green.

### Step 2: Complete ownership cleanup

Destroy/null the owned coordinator and prevent delayed UI setup before the first asynchronous teardown boundary. Preserve event-flush behavior: do not move unrelated write operations or silently drop a flush. Store capture:true in the actual listener registration record. Make UI setup timeout handles owned, clear them in cleanup and make callbacks harmless after disposal; preserve any supported same-instance reinitialization by explicitly defining/resetting lifetime state at setup. Keep cleanup idempotent. Do not claim that cancelling pending timers aborts a promise already executing.

**Verify:** targeted unit command → all pass, including deferred-unload ordering and cleanup→timer-drain→dispatch. Typecheck command → exit 0.

### Step 3: Verify disable/re-enable in the isolated host

Create `tests/integration/plugin-unload.test.ts` using session/reset helpers and existing `tests/integration/smoke.test.ts` as the loading pattern. Add test names `plugin unload cancels owned scheduled work` and `plugin reload keeps one editor keyword handler`. In the isolated test instance, capture old plugin/coordinator references, disable the plugin, assert old owned handles are cleared, re-enable and exercise editor keyword contextmenu once. Repeat three times; the new handler must work once each time and old registries must stay empty. Restore the plugin in finally so later suites retain their baseline. Use Obsidian plugin APIs and DOM events, never keyboard shortcuts; verify current host API using Context7 before introducing host-specific calls.

Document in `docs/editor.md` that disabling the plugin releases its editor interactions and pending delayed task actions; avoid promising rollback/cancellation of already-running file writes. Update architecture ownership and add one concise user-facing CHANGELOG sentence.

**Verify:** integration command above → both named cases pass; unavailable Obsidian is incomplete verification, not success.

### Step 4: Finish gates

Format only named changed files with `./node_modules/.bin/prettier --write <explicit paths>`. Run full unit suite, build and lint. Run `npm run docs:screenshots -- --check` manually after plugin source changes; record drift without recapturing. Review `git diff --check` and `git diff --name-only` against scope and pre-existing work.

**Verify:** full unit/build/lint and `git diff --check` exit 0; only authorized files changed. Record actual results locally.

## Test plan

Prove owner invocation, idempotent unload, cleanup before a deferred async teardown, cancellation of pending recurrence through the existing real coordinator destructor, actual capture-phase listener removal and delayed setup draining. Never replace these with “does not throw” or mocked add/remove call counts alone. Timer assertions track the coordinator/UI's owned handles, not an assumption that the entire Obsidian app has zero timers.

## Done criteria

- [ ] Owner-level tests observe coordinator destruction and cleared plugin reference before awaiting asynchronous teardown.
- [ ] Actual editor contextmenu dispatch after cleanup cannot invoke the old callback.
- [ ] Pending delayed UI setup cannot reattach after cleanup; repeated cleanup is harmless.
- [ ] Both named host tests pass across three reloads; existing editor interactions still work.
- [ ] Full unit suite, typecheck/build, lint and diff checks pass; docs/architecture/changelog updated.
- [ ] No screenshot regeneration or out-of-scope source edits; local plan/index record actual results and stay unstaged.

## STOP conditions

- EventCoordinator's flush requires a live update coordinator or can create fresh delayed work after destruction: report the exact callback dependency before changing flush order.
- A failing test requires cancelling an already-running writer promise, changing timeout/queue policy, or touching an out-of-scope module.
- Host disable/re-enable cannot safely restore the shared test baseline: stop and diagnose rather than testing against the user's normal vault.
- Two focused attempts fail a verification; preserve evidence and report.

## Maintenance notes

Every service that starts a timer needs an owning lifecycle call, even when its destructor is unit tested. Match add/remove listener capture options exactly. Future delayed editor initialization belongs to the same cleanup registry. Keep this plan independent from 058's per-Markdown-render ownership.

## Results

**Implemented.** `PluginLifecycleManager.onunload` destroys and nulls `plugin.taskUpdateCoordinator` synchronously before awaiting `EventCoordinator.destroy`; repeated unload is harmless. `UIManager` stores `{ capture: true }` in the listener record and installs through one helper, so cleanup removes the exact capture-phase contextmenu handler. Delayed layout/file-open setup now uses owned timer handles cleared by `cleanup`, with a disposal flag that prevents post-cleanup reattachment and is reset by the next setup.

**Red/green.** `npm test -- --runInBand --coverage=false --runTestsByPath tests/plugin-lifecycle.test.ts tests/ui-manager.test.ts` on the reverted source files: 2 suites failed, 4 tests failed / 49 passed (`RED_EXIT=1`); with the implementation restored: 2 suites passed, 53 passed / 53. New coverage: destroy-and-clear before a deferred event teardown resolves, single destroy across repeated unloads, real capture-phase dispatch surviving cleanup, and a drained delayed file-open callback that does not reattach.

**Limitations.** The plan's isolated-host Playwright cases (`tests/integration/plugin-unload.test.ts`, three disable/re-enable cycles) were not added or run, so teardown is verified at unit level only. No live Obsidian session was used. `npm run docs:screenshots -- --check` was not run; no images were regenerated.
