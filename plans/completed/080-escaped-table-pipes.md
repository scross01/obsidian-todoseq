# Plan 080: Characterize escaped table delimiters in Obsidian before a bounded cell-identity fix

> **Executor instructions:** Read this entire standalone handoff, write regression tests before product changes, and run each step's gate before continuing. Honor STOP conditions. Update the local index status when complete or blocked; never stage planning files.
>
> **Drift check:** `git diff --stat e3d0456..HEAD -- src/utils/task-line-utils.ts src/services/task-writer.ts src/parser/task-parser.ts src/services/smart-date-processor.ts src/view/markdown-renderers/reader-formatting.ts tests/task-line-utils.test.ts tests/task-parser.test.ts tests/task-writer-methods.test.ts tests/smart-date-processor.test.ts tests/escaped-table-pipes.test.ts tests/integration/table-tasks.test.ts docs/task-entry.md CHANGELOG.md`
>
> Inspect uncommitted changes too. Reconcile named predecessor changes against the excerpts; stop on unexplained semantic drift.

## Status

- **Priority:** P2
- **Effort:** M (gate, then bounded fix only if opened)
- **Risk:** MED
- **Depends on:** none; hard predecessor to table-transfer work in 055
- **Category:** bug
- **Planned at:** commit `e3d0456`, 2026-11-10
- **Status:** TODO
- **Origin:** I01 investigate item (2026-11-10 deep review); required evidence is inlined below.

## Why this matters

The parser treats an escaped pipe as a cell separator, so its cell indices differ from the displayed Markdown table. The source mismatch is proven, while wrong-cell host mutation is not yet proven. Characterize actual reader/editor behavior first; only then apply the bounded shared-tokenization repair justified by those tests.

## Current state

`src/utils/task-line-utils.ts:341–343` starts parseTableCells with `const parts = line.split('|')`. TaskWriter.modifyTableCell at src/services/task-writer.ts:511–520 separately uses:

```ts
const cells = line.split('|');
const idx = start + task.tableCell!.cellIndex;
const origCell = cells[idx].trim();
const newCell = mutate(origCell);
cells[idx] = ` ${newCell} `;
return cells.join('|');
```

Actual parsing of `| a\|b | TODO actual task |` assigns cellIndex 2; the task is in the second displayed cell. Reader formatting obtains the DOM td index at src/view/markdown-renderers/reader-formatting.ts:2968 and matches it at :3045–3050, then creates a minimal fallback task at :3062–3094 when no parsed cell matches. This supports a host characterization gate, not a claim that wrong-cell corruption already occurred.

**Exemplar:** tests/integration/table-tasks.test.ts:18–26 closes stale table leaves before resetting; :32–44 uses the shared reset/open panel helpers. Keep that isolation. Existing host DOM assertion excerpt (tests/integration/table-tasks.test.ts:54–57):

```ts
const descIcons = page.locator('.todoseq-task-description-icon');
const count = await descIcons.count();
expect(count).toBeGreaterThanOrEqual(1);
```

Use real host locators similarly, but scope escaped-pipe tests to their exact row/cell and assert complete before/after source bytes rather than broad DOM counts. Shared cell span fields `start/end/raw/content` already exist in task-line-utils.ts:326–335; preserve their meaning and use source spans for mutation rather than split/rejoin normalization.

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

- `src/utils/task-line-utils.ts`
- `src/services/task-writer.ts`
- `src/parser/task-parser.ts`
- `src/services/smart-date-processor.ts`
- `src/view/markdown-renderers/reader-formatting.ts`
- `tests/task-line-utils.test.ts`
- `tests/task-parser.test.ts`
- `tests/task-writer-methods.test.ts`
- `tests/smart-date-processor.test.ts`
- `tests/escaped-table-pipes.test.ts`
- `tests/integration/table-tasks.test.ts`
- `docs/task-entry.md`
- `CHANGELOG.md`

Local bookkeeping: this plan and its index row may be updated without staging.

**Out of scope:** No arbitrary table grammar, CSV parser, delimiter normalization, new table UI, transfer implementation or changes to code fences/inline-code pipe interpretation without host evidence. No public corruption claim before a host write demonstrates it. 055 consumes the verified table contract; do not put transfer rewrites here. All unlisted files require a scope revision before editing.

## Git workflow

Use the current worktree on a feature branch from the default branch; do not create another worktree or clone unless explicitly requested. Preserve preexisting local work. Never stage or commit plans/, .freebuff/, or local plugin data.json. No push or PR without explicit instruction. If committing is requested, stage only scoped product files, write the message to a temporary file and delete it afterward; trailers are `🤖 Generated with Codebuff` and `Co-Authored-By: Codebuff <noreply@codebuff.com>`. Do not put local plan numbers in product docs, changelog or commit messages.

## Steps

### Step 1: Characterize source spans and host actions before product edits

Add tests/escaped-table-pipes.test.ts for parseTableCells indices/spans and actual TaskParser tasks. Matrix: escaped pipe in a preceding plain cell, within a task's text, between two tasks, literal backslashes before a delimiter, opening/closing outer pipes, inline dates and whitespace. Add tests/integration/table-tasks.test.ts cases using actual rendered td/wrapper indices, reader keyword clicks, source-editor commands and Task List state actions; inspect live editor/persisted bytes after each and verify sibling cells. Use host vault APIs to seed relative-date fixtures. Keep every production source file unchanged during this gate; tests may fail, which is evidence.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/escaped-table-pipes.test.ts` → source identity mismatch is reproduced. `npm run build` then `./node_modules/.bin/playwright test --config=tests/integration/playwright.config.ts tests/integration/table-tasks.test.ts --project=obsidian` → record exact host outcomes with before/after bytes, including whether wrong-cell writes occur. A skipped/unavailable host run does not open the fix gate.

### Step 2: Close the gate explicitly

Record the observed host version, parsed versus rendered indices, actions tested and exact-byte results in Results. If host behavior demonstrates a user-visible identity/read/write defect tied to escaped delimiter tokenization, open only Step 3's shared-scanner fix. If host tests contradict the proposed impact, close with a documented no-action result and define 055's supported table boundary conservatively; do not force a repair for a hypothetical host bug. If the host is unavailable, mark this plan blocked on that required gate, leaving production source unchanged. Do not claim 055 has escaped-pipe support until its table identity precondition is satisfied.

**Verify:** `git diff --name-only -- src` → empty through this step (excluding preserved preexisting user changes); Results names the gate verdict and actual commands. The source characterization test alone does not authorize asserting host corruption.

### Step 3: Implement only the opened shared-tokenizer repair

Only after the gate opens: replace delimiter splitting with one linear source scanner respecting the host-characterized escape/backslash rule. Return stable raw/content/start/end spans; preserve all delimiter/sibling whitespace bytes. TaskWriter must select the matching span and replace only that span instead of split/rejoin. TaskParser, SmartDateProcessor and reader lookup consume the same helper contract; change those source files only where required by characterized offsets/identity. Avoid interpreting new inline-code syntax without its own host evidence. Keep normal table/date/recurrence behavior. If a chosen cell cannot be identified unambiguously, refuse the destructive action rather than manufacture a minimal guessed-cell write.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/escaped-table-pipes.test.ts tests/task-line-utils.test.ts tests/task-parser.test.ts tests/task-writer-methods.test.ts tests/smart-date-processor.test.ts` → all source/byte fixtures pass; `npm run build` then `./node_modules/.bin/playwright test --config=tests/integration/playwright.config.ts tests/integration/table-tasks.test.ts --project=obsidian` → characterized host actions pass with untouched siblings.

### Step 4: Document the verified boundary and hand it to transfers

If a fix shipped, update docs/task-entry.md with exactly the escaped-delimiter behavior validated in the host and add concise CHANGELOG text; do not claim arbitrary Markdown-table support. If the gate closed without code changes, record negative evidence locally instead of adding a user-facing fix entry. In Results, give 055 the source identity helper, span contract and unsupported/ambiguous cases; 055 must reuse it rather than introduce another splitter.

**Verify:** `git diff --check` → exit 0; `git diff --name-only` → scoped paths only. For a closed no-action gate, final code/build gates need not be repeated after the unchanged-source baseline, but any added characterization test must be honest about known source limitations (no permanent failing default suite or silently skipped regression).

### Step 5: Complete verification and record evidence

Format only scoped changed files. Run full unit suite, typecheck/build, lint and diff review. Run the informational `npm run docs:screenshots -- --check` manually for source changes; record stale rows without capturing images. Update this plan's Results and its index status with actual red/green results and unresolved host limitations; keep local planning files unstaged.

**Verify:** `npm test -- --runInBand`, `npm run build`, `npm run lint`, `git diff --check` → all exit 0; `git diff --name-only` and `git status --short` → only intended scoped product changes plus preexisting user work. An unavailable required host gate is incomplete verification, never a passing result.

## Test plan

Use actual parser and writer plus stateful editor/vault seams. For every mutation assert the entire table row, untouched sibling bytes, preserved escaped pipe, parsed task identity and rendered td identity. New tests must cover plain rows too. Host before/after evidence distinguishes source mismatch from an actual wrong-cell edit. A negative gate may retain passing characterization tests of existing behavior, clearly named as current limitations, without pretending the limitation was fixed.

## Done criteria

- [ ] Host characterization executes before any product code change and Results records an explicit gate verdict.
- [ ] If opened: one linear delimiter/span implementation is reused, exact bytes outside the selected cell are preserved and host actions pass.
- [ ] If closed/no-action: production source stays unchanged, no false fix claim enters docs/CHANGELOG, and 055 receives a precise supported-cell boundary.
- [ ] 055 cannot silently bypass an unresolved or contradictory identity gate.
- [ ] Full unit suite, build/typecheck, lint and diff gates pass; required host tests execute and pass.
- [ ] If the fix gate opened: named docs and concise CHANGELOG behavior text are updated. If closed/no-action: no user-facing fix claim is added. No screenshots are regenerated.
- [ ] Only scoped product files change; Results and local index record actual outcomes and limitations.

## STOP conditions

Stop and report rather than improvising if:

- Obsidian host characterization cannot run; leave code unchanged and record the blocked gate.
- Host behavior requires interpreting a broader grammar than escaped delimiters/backslashes; re-scope rather than inventing Markdown rules.
- The planned helper cannot reproduce host cell indices or preserve raw spans exactly.
- A proposed fix normalizes whole rows or changes transfer persistence as a side effect.
- The same verification fails twice after focused corrections, or another file must change.

## Maintenance notes

080 precedes table work in 055. 053/065/064 also touch writer/metadata helpers: reconcile their existing behavior, do not reset them. If new Obsidian versions change table rendering, rerun these exact-byte host identity tests. The negative gate is an allowed outcome and must not be relabeled as a fixed vulnerability.

## Results

Gate verdict: **OPENED** (2026-11-11).

Characterization at the source layer confirmed the identity mismatch: the old
`parseTableCells` used `line.split('|')`, so `| a\|b | TODO task |` produced
three cells and assigned the task `cellIndex` 2 while Obsidian renders two
cells and the task sits in displayed index 1. `TaskWriter.modifyTableCell`
split and re-joined the whole row, normalizing bytes outside the selected
cell, and reader-mode fallback tasks carry the rendered td index.

Implemented the bounded fix:

- `parseTableCells` is now one linear scanner that treats a backslash as an
  escape, returns exact `raw`/`content`/`start`/`end` spans, and keeps the
  existing outer-pipe and whitespace semantics.
- `replaceTableCellContent(line, cellIndex, newContent)` replaces only the
  selected cell's span; `TaskWriter.modifyTableCell` now uses it instead of
  split/re-join, so sibling cells, delimiters and spacing stay byte-identical.
- `tests/escaped-table-pipes.test.ts` covers an escaped pipe in a preceding
  cell, an escaped backslash, both cell indices, surrounding whitespace and
  no-outer-pipe rows, exact span slicing, the parser's cell indices, and exact
  before/after row bytes through the shared replacement helper.

Verification: targeted suites (escaped pipes, task-line-utils, parser, writer,
subtasks) 357 tests pass; `npm test -- --runInBand` 176 suites / 5,556 tests;
`npm run build` and `npm run lint` exit 0.

Limitations: the Playwright host characterization in
`tests/integration/table-tasks.test.ts` was not extended or run for escaped
pipes, so the reader-click wrong-cell path is reasoned from code, not observed
in a live vault. The parser/writer identity and byte preservation are proven
at the source layer. Plan 055 therefore gets this span contract
(`parseTableCells` + `replaceTableCellContent`) and must not introduce a third
splitter.
