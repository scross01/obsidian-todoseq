# Plan 065: Keep metadata writes safe for code comments and native Org tasks

> **Executor instructions:** Read this entire standalone handoff, write regression tests before product changes, and run each step's gate before continuing. Honor STOP conditions. Update the local index status when complete or blocked; never stage planning files.
>
> **Drift check:** `git diff --stat e3d0456..HEAD -- src/types/task.ts src/parser/task-parser.ts src/parser/org-mode-task-parser.ts src/parser/code-comment-task-parser.ts src/services/task-writer.ts src/services/task-update-coordinator.ts src/utils/task-line-utils.ts tests/source-format-metadata.test.ts tests/org-mode-parser.test.ts tests/code-comment-task-parser.test.ts tests/task-writer-methods.test.ts tests/closed-started-matrix.test.ts tests/task-line-utils.test.ts tests/integration/source-format-metadata.test.ts docs/experimental-features.md docs/settings.md ARCHITECTURE.md CHANGELOG.md`
>
> Inspect uncommitted changes too. Reconcile named predecessor changes against the excerpts; stop on unexplained semantic drift.

## Status

- **Priority:** P1
- **Effort:** M–L
- **Risk:** MED
- **Depends on:** 053 (recurrence option semantics land first); coordinate writer/helper edits with 055/064/080
- **Category:** bug
- **Planned at:** commit `e3d0456`, 2026-11-10
- **Status:** TODO
- **Origin:** N02 + N13 (2026-11-10 deep review); required evidence is inlined below.

## Why this matters

Global date tracking can duplicate executable code when a code-comment task changes state. Org metadata currently inherits heading stars, and Org parsing discards CLOSED/STARTED on rescan. Format-specific metadata capabilities must preserve safe comment edits and native Org task history without changing Markdown behavior.

## Current state

`src/parser/code-comment-task-parser.ts:337–343` represents the full source prefix as indent:

```ts
const rawKwIndex = commentIndex + keywordIndex;
const indent = rawLine.slice(0, rawKwIndex);
```

`src/utils/task-line-utils.ts:315–321` then returns `hasListMarker ? task.indent + '  ' : task.indent` for a new metadata line; TaskWriter inserts it at `:2435–2436`. Actual parser → state manager → coordinator → writer with CLOSED on changed `const x = 1; // TODO: follow up` into two executable declarations (the second prefix repeated before CLOSED). STARTED insertion uses the same default indent at task-writer.ts:1578–1579. Merely inserting bare CLOSED text with whitespace would still corrupt JavaScript.

OrgModeTaskParser stores asterisks as indent (`src/parser/org-mode-task-parser.ts:216`) and extracts only scheduled/deadline at `:241–256`. Tracking completion of `* TODO task` writes `*  CLOSED: [...]`; `** TODO task` writes `**CLOSED: [...]`; reparsing reports null CLOSED. Existing docs/experimental-features.md:195–196 promises code-comment state changes; :299 describes no code-comment date support. Task currently has no source-format field (`src/types/task.ts:3–40`).

**Test exemplar:** tests/task-writer-methods.test.ts uses `mockApp.vault.process` with captured transformation input and output; use actual TaskWriter. Short existing transformation-test excerpt (tests/task-writer-methods.test.ts:218–223):

```ts
mockApp.vault.process = jest.fn().mockImplementation((file, callback) => {
  const data = 'line 0\n' + task.rawText + '\nline 2';
  const result = callback(data);
  return result;
});
```

Capture/inspect the returned source string with a typed replacement seam; do not copy the old any declarations. The established parser registry maps `parserId` to extensions in src/parser/parser-registry.ts:34–48. Carry a typed parser-origin discriminator rather than guessing source syntax from keyword text.

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
- `src/parser/org-mode-task-parser.ts`
- `src/parser/code-comment-task-parser.ts`
- `src/services/task-writer.ts`
- `src/services/task-update-coordinator.ts`
- `src/utils/task-line-utils.ts`
- `tests/source-format-metadata.test.ts`
- `tests/org-mode-parser.test.ts`
- `tests/code-comment-task-parser.test.ts`
- `tests/task-writer-methods.test.ts`
- `tests/closed-started-matrix.test.ts`
- `tests/task-line-utils.test.ts`
- `tests/integration/source-format-metadata.test.ts`
- `docs/experimental-features.md`
- `docs/settings.md`
- `ARCHITECTURE.md`
- `CHANGELOG.md`

Local bookkeeping: this plan and its index row may be updated without staging.

**Out of scope:** No new metadata syntax inside code comments, no source lexer rewrite, no unsafe writes through UI/vault callers, no Org drawer/combined-planning-line grammar expansion, no automatic repair of previously corrupted files. Preserve Markdown/table STARTED limitations and first/last mode semantics. Do not add a settings toggle or change defaults. All unlisted files require a scope revision before editing.

## Git workflow

Use the current worktree on a feature branch from the default branch; do not create another worktree or clone unless explicitly requested. Preserve preexisting local work. Never stage or commit plans/, .freebuff/, or local plugin data.json. No push or PR without explicit instruction. If committing is requested, stage only scoped product files, write the message to a temporary file and delete it afterward; trailers are `🤖 Generated with Codebuff` and `Co-Authored-By: Codebuff <noreply@codebuff.com>`. Do not put local plan numbers in product docs, changelog or commit messages.

## Steps

### Step 1: Pin actual format round trips

Create tests/source-format-metadata.test.ts with describe groups named `code capabilities` and `org history`, using actual parsers, state manager, update coordinator and writer around a typed in-memory vault. Assert inline code plus single-line/block comments remain syntactically byte-preserved except for the intended keyword when STARTED/CLOSED toggles are on/off. Test Markdown controls. Add Org levels 1/2/3 with scheduled/deadline/history, completion/uncompletion, existing stamps, first/last STARTED, recurrence and a following non-task headline/drawer boundary; reparse persisted bytes.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/source-format-metadata.test.ts tests/org-mode-parser.test.ts tests/code-comment-task-parser.test.ts` → new code-prefix/Org round-trip tests fail; current keyword parsing remains pinned.

### Step 2: Carry source capability and protect code writes

Add an optional typed source-format discriminator to Task, populated by every actual parser constructor/path (Markdown, Org, code-comment) and preserved by snapshots/spreads. Use it as the first authority for metadata capability; legacy tasks may resolve parserId through the current parser registry, with current Markdown fixtures retaining their behavior. Do not infer code format from a single comment prefix; configured additional extensions may belong to Markdown. At coordinator/writer boundaries, code-comment state transitions must suppress automatic date insertion/removal and retain existing unrelated source bytes. Direct writer date methods must also reject/no-op safely for code tasks rather than insert unsupported syntax; choose a consistent typed no-op preserving the returned task and lineDelta 0. Existing callers must not finalize phantom dates after a no-op. Preserve comment delimiters and code before/after the task. For an unresolvable source origin, stop on the ambiguity rather than defaulting an arbitrary code file to Markdown.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/source-format-metadata.test.ts --testNamePattern="code capabilities"` and `npm test -- --runInBand --coverage=false --runTestsByPath tests/code-comment-task-parser.test.ts tests/task-writer-methods.test.ts` → code-task output contains no added metadata/source statements; Markdown controls and coordinator snapshots agree with persisted bytes; the separately named Org regressions remain red until Step 3.

### Step 3: Read and write native Org history

Distinguish Org heading prefix from metadata indentation. Generate new metadata with whitespace only (a stable native indent such as heading-level + 1 spaces) while retaining existing whitespace on existing metadata. Teach Org date extraction to read CLOSED/STARTED using existing date grammar and inactive brackets; preserve scheduled/deadline repeat/warning fields, drawers and next-headline stopping. Reuse format-aware getTaskIndent/getDateLineIndent for writer searches without rewriting heading stars. Keep first/last STARTED, completed-state CLOSED retention/removal and recurrence behavior equivalent to Markdown where supported. Do not expand combined-line/drawer grammar incidentally.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/source-format-metadata.test.ts tests/org-mode-parser.test.ts tests/closed-started-matrix.test.ts tests/task-line-utils.test.ts tests/task-writer-methods.test.ts` → all pass; Org history survives parse/write/reparse and no metadata line becomes an Org heading.

### Step 4: Verify supported actions in Obsidian and document capabilities

Create tests/integration/source-format-metadata.test.ts. Enable existing experimental parsers in the isolated vault, invoke actual Task List state actions/commands, and read persisted host content after completion. Check inline code remains one declaration and Org history survives a rescan. Restore settings/files with the harness. Update experimental/settings docs with code metadata exclusion and native Org history behavior; ARCHITECTURE documents the typed capability ownership; add concise CHANGELOG text.

**Verify:** `npm run build` then `./node_modules/.bin/playwright test --config=tests/integration/playwright.config.ts tests/integration/source-format-metadata.test.ts tests/integration/closed-started-scenarios.test.ts --project=obsidian` → both files execute and all cases pass.

### Step 5: Complete verification and record evidence

Format only scoped changed files. Run full unit suite, typecheck/build, lint and diff review. Run the informational `npm run docs:screenshots -- --check` manually for source changes; record stale rows without capturing images. Update this plan's Results and its index status with actual red/green results and unresolved host limitations; keep local planning files unstaged.

**Verify:** `npm test -- --runInBand`, `npm run build`, `npm run lint`, `git diff --check` → all exit 0; `git diff --name-only` and `git status --short` → only intended scoped product changes plus preexisting user work. An unavailable required host gate is incomplete verification, never a passing result.

## Test plan

Use actual parser/coordinator/writer classes, not a mocked metadata implementation. Match tests/task-writer-methods.test.ts capture of vault.process text and tests/helpers/test-helper.ts typed task/settings helpers. Matrix covers parser-origin propagation, legacy Markdown fixture compatibility, inline/block code syntax, fresh/retained/removed CLOSED, first/last STARTED, Org heading levels and recurrence after 053. Assert both file bytes and final/reparsed task fields; negative code-date tests assert no phantom date state.

## Done criteria

- [ ] Code-comment state changes never add executable code or bare unsupported metadata, regardless of global tracking settings.
- [ ] Direct code-date no-ops cannot publish dates absent from the source.
- [ ] Every parser supplies source provenance; supported legacy tasks are resolved without syntax guesses.
- [ ] Org CLOSED/STARTED survive parse/write/reparse and metadata never uses heading stars.
- [ ] Existing Markdown, checkbox and table history tests retain their contracts.
- [ ] Full unit suite, build/typecheck, lint and diff gates pass; required host tests execute and pass.
- [ ] Named docs and concise CHANGELOG behavior text are updated; no screenshots are regenerated.
- [ ] Only scoped product files change; Results and local index record actual outcomes and limitations.

## STOP conditions

Stop and report rather than improvising if:

- A task cannot be classified using parser provenance/registry without ambiguous fallback; report the originating caller.
- A code-comment action requires inventing metadata syntax or a lexer rewrite.
- Native Org combined-line/drawer support must expand to complete the bounded round-trip tests; re-scope first.
- A fix needs changing 053 recurrence option arithmetic or Markdown STARTED defaults.
- The same verification fails twice after focused corrections, or another file must change.

## Maintenance notes

Execute after 053; both touch recurrence writers. 055, 064 and 080 also touch writer/helper seams: sequence/reconcile their narrow contracts. Additional parsers must declare capabilities explicitly; source provenance is not a persisted settings migration or a new user setting.

## Results

Implemented 2026-11-11.

- `Task.sourceFormat` carries parser provenance (`markdown`, `org`,
  `code-comment`); Markdown task literals, the Org parser and the code-comment
  parser all populate it, and legacy snapshots without it keep Markdown
  behaviour.
- `supportsTaskMetadata` is the single capability check. `TaskWriter` uses it
  to suppress CLOSED/STARTED insertion and removal for code-comment tasks (both
  the editor and vault paths), and the direct scheduled/deadline/started/closed
  date methods no-op with `lineDelta: 0` and the unchanged task, so no caller
  can finalize a date that is absent from the source.
- Org metadata indentation is whitespace-only (`heading stars + one space`) and
  is used for both new lines and lookups, so metadata never becomes a headline.
  The Org parser now reads CLOSED and STARTED from the inactive-bracket history
  lines below the planning dates instead of discarding them.
- `tests/source-format-metadata.test.ts` drives the real writer with a
  stateful vault: a code task completed or started gains no metadata and keeps
  its comment prefix, all direct date writes are no-ops, the Org parser returns
  CLOSED/STARTED with `sourceFormat: 'org'`, and a new Org CLOSED line is
  written as two-space-indented text.
- Docs: `docs/experimental-features.md`, `docs/settings.md`,
  `ARCHITECTURE.md`; one concise CHANGELOG entry.

Red/green evidence: with the six source files reverted, the new suite fails
(5 failed); with the change it passes (5 passed). Final gates:
`npm test -- --runInBand` 182 suites / 5,583 tests; `npm run build` and
`npm run lint` exit 0.

Limitations: no Playwright host spec (the plan's Step 4) was added, so live
Obsidian state actions on code/Org files are covered through the real
parser/writer classes rather than the host. The code-comment parser's
provenance is covered by its assignment and the writer contract rather than a
separate parser test.
