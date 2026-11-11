# Plan 060: Honor the daily-note availability boolean consistently across commands and transfers

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm its expected result before continuing. Write regression tests before changing product code. If a STOP condition occurs, stop and report rather than improvising. Update this plan's status in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 359916b..HEAD -- src/utils/daily-note-utils.ts tests/daily-note-utils.test.ts tests/integration/daily-note-availability.test.ts docs/moving-tasks.md docs/command-palette.md CHANGELOG.md`
>
> Compare changed paths and the Current state excerpts with live code before proceeding. Changes from named predecessor plans are expected: verify their documented contract, and record reconciled locations here. An unexplained semantic mismatch is a STOP condition. Also inspect uncommitted changes; do not overwrite other work.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `359916b`, 2026-10-31
- **Status**: TODO
- **Origin**: 2026-10-31 improve review, findings R11; this file contains the required context independently of that review.

## Why this matters

The daily-note predicate returns boolean, but TODOseq interprets false as available because it tests only for undefined. Tests mock an object/undefined contract and miss the disabled case. Sync and async availability also use different sources, making command availability and actual transfer behavior disagree.

## Current state

`src/utils/daily-note-utils.ts:71–74` contains:
```ts
const settings = appHasDailyNotesPluginLoaded();
const isEnabled = settings !== undefined;
dailyNotesPluginEnabledCache = isEnabled;
return isEnabled;
```
The catch fallback at `:130–132` repeats it. Async detection otherwise reads core-plugins.json as a boolean map (`:97–110`), omitting Periodic Notes support and sharing an indefinite module cache. `tests/daily-note-utils.test.ts:325–334` mocks {} and undefined. The installed library (`node_modules/obsidian-daily-notes-interface/dist/index.mjs:513`) returns true for enabled core Daily Notes, otherwise the boolean of Periodic Notes daily.enabled. The current library reference was verified through Context7 at https://github.com/liamcain/obsidian-daily-notes-interface/blob/main/_autodocs/api-reference/index.md.

**Project conventions to retain:** This is an Obsidian desktop/mobile plugin. PRODUCT.md's principle is “Tasks live in notes as plain text; the panel is a view, not a second database of record.” TaskStateManager owns collected state; KeywordManager owns task-state vocabulary; TaskWriter owns task writes. Use Obsidian editor/vault APIs inside TaskWriter, no Node filesystem APIs. No unsafe any assignments or console.log. Use console.debug for diagnostics. New date fixtures use local constructor components/getters. Put detailed user-visible behavior in the named docs pages. Limit CHANGELOG entries to one or two user-facing sentences.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Typecheck | `./node_modules/.bin/tsc -p tsconfig.json --noEmit --skipLibCheck` | exit 0, no errors |
| Unit suite | `npm test -- --runInBand` | all suites pass |
| Build | `npm run build` | typecheck and plugin bundle complete |
| Lint | `npm run lint` | exit 0 |
| Format scoped files | `./node_modules/.bin/prettier --write <changed in-scope files>` | only explicitly named files formatted |
| Scope review | `git diff --name-only` and `git status --short` | no unintended changes; existing local files preserved |

Targeted commands and expected red/green outcomes are specified per step. Dependencies are already installed; do not update the lockfile as a side effect. The original audit at this SHA passed 170 unit suites / 5,500 tests, typecheck and lint; those historical results are not verification of the proposed fix. Build/integration commands are executor gates, not commands run while authoring this plan.

## Scope

**In scope** (the only product/test/docs files to modify; new test files below may be created):

- `src/utils/daily-note-utils.ts`
- `tests/daily-note-utils.test.ts`
- `tests/integration/daily-note-availability.test.ts`
- `docs/moving-tasks.md`
- `docs/command-palette.md`
- `CHANGELOG.md`

Local bookkeeping: this plan and its row/dependency notes in `plans/README.md` may be updated but never staged.

**Out of scope:** No task transfer redesign, core-plugin settings mutation outside isolated tests, new date library, new daily-note settings or moment locale changes. All files not explicitly listed above require a scope revision before editing. Never regenerate `docs/assets/` or the screenshot manifest as a side effect.

## Git workflow

Use the current worktree and a feature branch from the default branch (suggested: `advisor/060-daily-note-availability`); preserve existing local work. Do not create a separate worktree/clone unless explicitly requested. Do not stage/commit `plans/`, `.freebuff/`, or local plugin `data.json`. Do not push or open a PR without instruction. If committing is requested, stage only in-scope product files, use a temporary commit-message file, and delete it afterward. Include the project trailers `🤖 Generated with Codebuff` and `Co-Authored-By: Codebuff <noreply@codebuff.com>`. Describe behavior in commit/changelog text, never local plan numbers.

## Steps

### Step 1: Replace inaccurate mocks with boolean contract tests

Update `tests/daily-note-utils.test.ts` to cover true, false and thrown exceptions for both wrappers. Add enable→disable→enable checks without calling a cache-reset function, and ensure getTodayDailyNote aborts without calling note creation when unavailable. Pin that Promise and sync callers agree regardless of invocation order.

**Verify**: `npm test -- --runInBand --coverage=false --runTestsByPath tests/daily-note-utils.test.ts` → false-result and live-toggle cases fail under the old implementation.

### Step 2: Use one cheap availability path

Refactor both wrappers to consume the actual boolean, removing disk-shape assumptions and persistent stale cache. Preserve public helper signatures; replace tests asserting adapter reads/cache counts with behavior assertions. Do not catch note creation failures as successful availability.

**Verify**: `npm test -- --runInBand --coverage=false --runTestsByPath tests/daily-note-utils.test.ts` → all wrapper/getTodayDailyNote tests pass with faithful predicate behavior.

### Step 3: Verify command availability and document providers

Add `tests/integration/daily-note-availability.test.ts` for disabled/enabled core Daily Notes command checks and actual destination resolution, restoring plugin settings after the test. Do not install Periodic Notes in the harness; cover that provider contract using a faithful predicate fixture. Update `docs/moving-tasks.md` and `docs/command-palette.md` to name supported daily-note providers and disabled behavior; add concise CHANGELOG text.

**Verify**: `npm run test:integration -- --grep 'daily note availability'` → commands and actual note creation agree in the real host.

### Step 4: Complete verification and scope review

Format only changed files, run the full unit suite, typecheck/build and lint. For any specified host integration gate, record actual results and restore the isolated fixture through the harness; do not substitute jsdom success for real Obsidian verification. Run `npm run docs:screenshots -- --check` manually when plugin sources changed; stale rows are informational, record them without regeneration. Update the local plan/index status with tests and limitations.

**Verify**: `npm test -- --runInBand`, `npm run build`, and `npm run lint` → each exits 0; `git diff --check` → exit 0; `git diff --name-only` → only intended in-scope product changes (besides preexisting user work). An unavailable required integration environment must be reported as incomplete verification, not a passing result.

## Test plan

Follow daily-note-utils.test.ts existing beforeEach reset and library jest.mock setup, but type the mocked predicate as () => boolean and never return {}. Test disabled wrappers cannot poison subsequent enabled checks and vice versa; preserve existing note lookup/creation error tests. In integration use app.commands callbacks, not keyboard shortcuts, and assert no extra file is created when disabled.

## Done criteria

- [ ] A false library predicate returns false from both wrappers.
- [ ] Changing provider availability takes effect without restart or explicit cache reset.
- [ ] Disabled daily notes never reach createDailyNote.
- [ ] No availability check reads core-plugins.json or treats false as a non-undefined success.
- [ ] All targeted regression suites and specified integration gates pass; full `npm test -- --runInBand`, `npm run build` and `npm run lint` exit 0.
- [ ] Named docs pages and concise CHANGELOG behavior summaries are updated.
- [ ] No out-of-scope edits or regenerated screenshot assets appear in the task diff.
- [ ] `plans/README.md` status and this plan's Results section record actual commands/results and any outstanding verification; local planning files stay unstaged.

## STOP conditions

Stop and report (do not improvise) if:

- The live code differs semantically from the excerpts beyond verified predecessor-plan changes.
- The resolved installed library contract is no longer boolean or does not support core/Periodic Notes as stated; re-verify with Context7 before changing the caller.
- A solution requires changing command IDs, installing a new plugin, or altering daily-note filename/folder configuration.
- A verification fails twice after a focused correction, or the fix requires editing an out-of-scope path.

## Maintenance notes

Keep mocks faithful to library return types. Removing the cache is intentional because detection reads current in-memory plugin state; do not reintroduce a persistent cache without an invalidation contract.

## Results

Implemented 2026-11-11.

- Both availability wrappers now return the interface's real boolean
  (`appHasDailyNotesPluginLoaded() === true`), so a disabled provider is
  reported unavailable instead of "defined". The stale module cache, the
  `core-plugins.json` adapter read and the cached fallback were removed;
  `refreshDailyNotesPluginStatus` is kept as a no-op for callers.
- `getTodayDailyNote` therefore aborts before `createDailyNote` when no
  provider is enabled, and command availability and destination resolution
  agree in either invocation order.
- `tests/daily-note-utils.test.ts` now types the predicate as a boolean and
  covers true / false / throwing, enable→disable→enable without a cache reset,
  sync/async agreement and the guarantee that no adapter read happens. The
  `getTodayDailyNote` fixtures drive availability through the predicate and
  assert no note is created while disabled.
- Docs: `docs/moving-tasks.md` and `docs/command-palette.md` name the supported
  providers (Daily Notes or Periodic Notes' daily note) and the disabled
  behaviour; one concise CHANGELOG entry added.

Verification at this revision (shared with the date-autocomplete change):

- `npm test -- --runInBand` -> 172 suites / 5,531 tests passed.
- `npm run build` -> exit 0; `npm run lint` -> exit 0.

Limitations: a real-Obsidian spec that toggles core Daily Notes settings was
not added; provider behaviour is pinned by faithful predicate fixtures, and
the plan's Periodic Notes contract is covered the same way rather than by
installing the plugin in the harness.
