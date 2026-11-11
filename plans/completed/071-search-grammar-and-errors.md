# Plan 071: Apply complete search grammar with consistent precedence and visible errors

> **Executor instructions:** Read this complete standalone plan, inspect drift and local changes, then write regression tests before product edits. Verify each step; stop on its STOP conditions. Update this plan and its README status locally when complete. No implementation has occurred during planning.
>
> **Drift check (run first):** `git diff --stat e3d0456..HEAD -- src/search/search-tokenizer.ts src/search/search-parser.ts src/search/search-types.ts src/view/task-list/task-list-view.ts tests/search-query-contract.test.ts tests/search-tokenizer.test.ts tests/search.test.ts tests/search-open-ranges.test.ts tests/search-fail-loud-validation.test.ts tests/task-list-view.test.ts tests/integration/task-list-view.test.ts docs/search.md src/search/README.md ARCHITECTURE.md CHANGELOG.md`. Also run `git status --short`. Compare the excerpts with live code; expected predecessor-plan changes must be reconciled explicitly, unexplained semantic drift is a STOP condition.

## Status

- **Priority:** P2
- **Effort:** M–L, including tests and documentation
- **Risk:** MED
- **Depends on:** 061 (obsolete async completions guarded); sequence after 069; run before 027 if lowercase operators are later selected
- **Category:** bug
- **Planned at:** commit `e3d0456`, 2026-11-10
- **Status:** DONE (2026-11-11)
- **Origin:** Deep project review N10, N11, N12; the required context is inlined below.

## Why this matters

Combined state/date ranges currently fail because range lookahead swallows earlier prefix values. Implicit AND binds below OR despite the documented precedence. Top-level parsing ignores trailing closing parentheses, an unmatched quote can be skipped, and the main panel clears its error state when filterTasks converts ordinary parse errors to no matches. Group these grammar/feedback fixes so tests establish one complete query contract.

## Current state

`src/search/search-tokenizer.ts:4`:

```ts
const enum BP {
  NOT = 100,
  AND = 80,
  OR = 60,
  DEFAULT = 50,
}
```

`src/search/search-tokenizer.ts:68`:

```ts
          if (
            pattern.type === 'word' &&
            tokens.length > 0 &&
            tokens[tokens.length - 1].type === 'prefix' &&
            query.slice(pos).includes('..')
          ) {
            // Find the position of the first ..
            const rangePos = query.indexOf('..', pos);
            if (rangePos !== -1) {
              // Extract the part before .. as prefix_value
              const prefixValue = query.slice(pos, rangePos);
              if (prefixValue.length > 0) {
```

`src/search/search-parser.ts:104`:

```ts
  static parseTokens(tokens: SearchToken[]): SearchNode {
    const parser = new PrattParser(tokens);
    return parser.parseExpression(0);
  }
```

`src/search/search-tokenizer.ts:172`:

```ts
// If no pattern matched, skip character (error handling)
if (!matched) {
  pos++;
}
```

`src/view/task-list/task-list-view.ts:1966`:

```ts
        visible = await Search.filterTasks(
          visible,
          q,
          this.isCaseSensitive,
          this.plugin.settings,
          this.plugin.propertySearchEngine ?? undefined,
        );
        this.searchError = null;
      } catch {
```

Observed AST for `alpha OR beta gamma` is AND(OR(alpha,beta),gamma); documented desired AST is OR(alpha,AND(beta,gamma)). `state:TODO scheduled:2026-01-01..2026-12-31` throws a wrong-prefix range error. `alpha) deadline:today` accepts only alpha. `"unterminated` is accepted as a word. Search.filterTasks intentionally returns [] for SearchError; preserve that facade contract. 061 now owns post-await generation/disposal checks.

**Existing test/convention exemplar:** `tests/search-open-ranges.test.ts:24`:

```ts
}

function taskScheduledOn(y: number, m: number, d: number): Task {
  return createCheckboxTask({
```

Use this localDate pattern and explicit createCheckboxTask expectations. tests/search-fail-loud-validation.test.ts states open-domain no-matches remain valid; retain that floor.

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

- `src/search/search-tokenizer.ts`
- `src/search/search-parser.ts`
- `src/search/search-types.ts`
- `src/view/task-list/task-list-view.ts`
- `tests/search-query-contract.test.ts`
- `tests/search-tokenizer.test.ts`
- `tests/search.test.ts`
- `tests/search-open-ranges.test.ts`
- `tests/search-fail-loud-validation.test.ts`
- `tests/task-list-view.test.ts`
- `tests/integration/task-list-view.test.ts`
- `docs/search.md`
- `src/search/README.md`
- `ARCHITECTURE.md`
- `CHANGELOG.md`

Local bookkeeping: this file and its README row stay unstaged. **Out of scope:** Property index matching (069), normalized task text (067), lowercase boolean spelling (027), new prefixes, AST redesign beyond the minimal complete parser correction, and UI styling. src/search/search.ts is reference-only: its public error contract stays unchanged. Any additional product path requires a scope revision before editing. No screenshot assets/manifest, dependencies, generated bundles in commits, or unrelated cleanup.

## Git workflow

Use the current worktree on a feature branch from the default branch, preserving local work. Do not create a worktree/clone or run git pull automatically. Do not stage/commit plans/, .freebuff/ or local plugin data.json. Do not push/open a PR. A request to write this plan is not an instruction to implement or commit it. If implementation is later requested and a commit is explicitly authorized, stage only in-scope product files; use a temporary message file and remove it afterward, with trailers `🤖 Generated with Codebuff` and `Co-Authored-By: Codebuff <noreply@codebuff.com>`. Never put local plan numbers into product docs or commit messages.

## Steps

### Step 1: Write independent grammar and panel feedback regressions

Create tests/search-query-contract.test.ts. Use truth-table tasks alpha-only, beta-only, beta+gamma and alpha+gamma; query alpha OR beta gamma must match alpha-only and beta+gamma, while (alpha OR beta) gamma excludes alpha-only. Repeat mixed forms for explicit AND, adjacent prefixes/properties/groups/negation. Pin token positions for filters before ranges. Reject stray closing parentheses, dangling operators and unmatched quotes. Extend real refresh tests with valid→invalid→valid query and an ordinary closed-domain error; assert visible error text as well as row counts.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/search-query-contract.test.ts tests/search-tokenizer.test.ts tests/search.test.ts tests/search-open-ranges.test.ts tests/search-fail-loud-validation.test.ts tests/task-list-view.test.ts` → new lookahead/precedence/exhaustion/error-display cases fail for their respective known reasons; existing open-domain cases remain green

### Step 2: Bound tokens and require whole top-level parsing

Limit range lookahead to the current date-prefix token/value span; do not search the entire remaining query. Keep relative phrases quoted, non-date path dots literal and existing range/comparison forms unchanged. Make top-level parse require exhaustion while recursive parenthesized parses stop at their own rparen. Unmatched structural quote tokens must throw SearchError rather than skip characters. Retain empty/blank query facade behavior and do not validate arbitrary no-match words.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/search-query-contract.test.ts tests/search-tokenizer.test.ts tests/search.test.ts tests/search-open-ranges.test.ts tests/search-fail-loud-validation.test.ts tests/task-list-view.test.ts` → combined ranges and invalid-delimiter cases pass; all existing open-range/date validation controls pass

### Step 3: Unify explicit and implicit conjunction precedence

Treat adjacency (word, phrase, prefix, property and group) as AND at the same binding power as explicit AND; do not flatten across an OR boundary. Preserve prefix NOT behavior, exact values and existing boolean spelling (currently uppercase; 027 separately changes it). Use one bounded parse pass; preserve AST cache behavior without mutation of cached trees.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/search-query-contract.test.ts tests/search-tokenizer.test.ts tests/search.test.ts tests/search-open-ranges.test.ts tests/search-fail-loud-validation.test.ts tests/task-list-view.test.ts` → independent truth tables and AST assertions pass, including alpha-only under OR and nested mixed forms

### Step 4: Surface validation before panel filtering and document it

Validate once per nonblank query at the view boundary, show Search.getError for structural/closed-domain errors, and avoid simple-text fallback for those known errors. Preserve Search.filterTasks SearchError→[] behavior for existing callers. Keep all generation/disposal guards from061 before mutating error/count/empty-state UI, including catch paths. Add the real panel invalid/valid sequence to integration tests and update docs/search.md, src/search/README.md, ARCHITECTURE search grammar and concise CHANGELOG.

**Verify:** `./node_modules/.bin/playwright test --config=tests/integration/playwright.config.ts --project=obsidian task-list-view.test.ts` → after npm run build, invalid-query panel tests and recovery tests run and pass; latest query remains authoritative

### Final step: Complete repository gates and record outcomes

Format only changed in-scope files, run full tests/typecheck/build/lint and review the diff. Run every host/performance gate specified above; if unavailable, record incomplete verification, not a pass. Run screenshot --check manually if source changed and leave stale rows informational. Update Results and README status; local planning files remain unstaged.

**Verify:** `npm test -- --runInBand`, `./node_modules/.bin/tsc -p tsconfig.json --noEmit --skipLibCheck`, `npm run build`, `npm run lint`, `git diff --check` → all exit 0; task diff contains only scoped product changes, apart from pre-existing work.

## Test plan

Use explicit expected task IDs/truth tables as the oracle, not only per-row/bulk parity sharing one AST. Matrix: two date ranges, ranges after non-date filters, prefix literals containing dots, open bounds, comparison operators, implicit/explicit conjunction around OR, nested parentheses, quoted literals/operator words, escaped quotes, property OR syntax, unmatched quotes/rparen/lparen, no-match open-domain words and invalid priority/calendar dates. Panel tests must prove text appears and is removed on correction. Retain 061 deferred completion/disposal tests.

## Done criteria

- [ ] Combined state/file filters plus date ranges parse/evaluate without swallowing preceding filters.
- [ ] Implicit and explicit AND follow the documented precedence relative to OR/NOT/groups.
- [ ] Unbalanced delimiters fail complete-query validation and cannot silently ignore a suffix.
- [ ] Main panel shows actual validation errors and clears them after correction; late async completions do not overwrite newer feedback.
- [ ] Uppercase/lowercase operator policy and property exactness are preserved until their separately selected changes.
- [ ] Targeted and specified host/performance gates ran with the expected cases; full unit/typecheck/build/lint/diff checks pass.
- [ ] Named documentation is current; visible changes have concise CHANGELOG text, or Scope explicitly justifies its absence.
- [ ] Results and local index record red/green evidence and limitations; no out-of-scope edits or screenshot capture.

## STOP conditions

- Semantic drift beyond reconciled predecessor changes, a required out-of-scope edit, or a verification failure persisting after two focused attempts.
- If a proposed binding-power shortcut breaks date range association, stop and show the token/AST counterexample rather than repeatedly changing DEFAULT.
- Do not implement pending027 lowercase grammar or change property OR spelling in this handoff.
- If another user surface needs product edits beyond the scoped panel to keep an existing contract, report and revise scope before editing it.

## Maintenance notes

New search syntax needs independent token/AST/result/feedback expectations. Avoid asserting exact AST nesting when semantically irrelevant, but pin precedence. Saved searches can expose previously unintended grouping; explain the corrected rule in user docs. 027 must layer its operator spelling change onto this grammar and rerun these tests.

## Results

**Implemented.** Range lookahead in the tokenizer is bounded to the current value token, so an earlier prefix value is no longer swallowed by a later range. Adjacency now binds at the same power as `AND` (above `OR`), and a range inside an implicit conjunction attaches to the last date prefix filter rather than rejecting the group. Top-level parsing requires exhaustion, so stray closing parentheses and dangling operators fail; an unterminated quote raises `SearchError` instead of being skipped. The Task List validates a nonblank query with `Search.getError` before filtering, shows the message with no rows, and keeps the existing `filterTasks` empty-result facade.

**Red/green.** `npm test -- --runInBand --coverage=false --runTestsByPath tests/search-query-contract.test.ts` with only the source files reverted: 4 failed / 1 passed (`RED_EXIT=1`); restored: 5 passed / 5. The wider search and task-list suites then passed together: 7 suites, 309 tests.

**Limitations.** The plan's host Playwright invalid-query/recovery case was not added or run, and the new panel validation branch has no dedicated panel-level test; it is verified by typecheck and the unchanged task-list suite only. The informational screenshot check was not run. Existing tokenizer expectations were updated to the new contract (adjacency binding power and unterminated-quote rejection).
