# Plan 027: Accept lowercase `or`/`and` as search operators (Obsidian-parity grammar)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a2f33e9..HEAD -- src/search/search-tokenizer.ts src/search/search-parser.ts docs/search.md ARCHITECTURE.md tests/search-tokenizer.test.ts tests/search.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S–M
- **Risk**: MED (grammar change — see "Risk notes" before executing)
- **Depends on**: 071 (complete precedence/validation contract first); 026 is already completed, so update its current SearchTokenizer/SearchParser wording rather than treating it as pending
- **Status:** DONE (2026-11-11)
- **Category**: bug (a real user query form silently does the wrong thing)
- **Planned at**: commit `a2f33e9`, 2026-09-30

## 2026-11-10 reconciliation

Reviewed at `e3d0456`. New 071 fixes independent range lookahead, implicit-AND precedence, full-query consumption and panel validation feedback while retaining the currently shipped uppercase operator spelling. Execute this spelling change afterward and reconcile the expected tokenizer drift; a predecessor change is not itself a reason to abandon the plan. Rerun `npm test -- --runInBand --coverage=false --runTestsByPath tests/search-query-contract.test.ts tests/search-tokenizer.test.ts tests/search.test.ts tests/search-bulk.test.ts tests/dashboard-aggregation.test.ts` → all pass, including independent mixed-operator truth tables in both lower/mixed/uppercase forms. Quoted operator words remain literal and property-value OR policy remains unchanged. Do not suppress the 071 regressions to obtain the old one-flag diff. The two fixes are distinct behavior changes; document both accurately. Existing screenshot policy is manual/informational.

## Why this matters

Obsidian's own search accepts lowercase `or` (and this plugin's users type
it). Today a query like `state:active or state:inactive` — taken verbatim
from a real vault note — tokenizes `or` as an ordinary search word, so the
whole query silently means "tasks whose text contains the word `or`, that
are in an active state, AND in an inactive state" — i.e. almost always zero
results with no error. The failure is invisible: the search input accepts
it, the parser accepts it, the result is just an empty list. Two precedent
failures of the same "silently wrong" class were already fixed this
cycle (`f634cf8` docs, `dd79d8a` parser validation); this is one
remaining grammar decision, and fixing it requires a deliberate grammar
decision, which is why it is a plan rather than a drive-by.

## Current state

All excerpts verified at commit `a2f33e9`.

### The tokenizer matches operators case-sensitively

`src/search/search-tokenizer.ts:13-14` (inside `PATTERNS`, order matters):

```ts
{ type: 'or' as const, regex: /\bOR\b/y },
{ type: 'and' as const, regex: /\bAND\b/y },
```

`processTokenValue` lowercases the captured value (`case 'or': case 'and':
return token.toLowerCase();` at ~line 235), so the AST's operator value is
already lowercase — only the _matching_ is case-sensitive.

### The current behavior is pinned as correct by a test

`tests/search-tokenizer.test.ts:86-91`:

```ts
it('does not match lowercase or/and as operators', () => {
  const tokens = tokenize('hello or world');
  expect(tokens).toHaveLength(3);
  expect(tokens[1].type).toBe('word');
  expect(tokens[1].value).toBe('or');
});
```

This plan _replaces_ this pin — the test's intent ("lowercase is not an
operator") flips from bug-guard to regression target. Do not simply delete
it; rewrite it to assert the new grammar (see Test plan).

### Docs state the current contract

- `docs/search.md` line 51 (added by `dd79d8a`'s docs commit): "A lowercase
  `or`/`and` is an ordinary search word, not an operator — quoting it
  ("or") matches tasks containing the word itself."
- `docs/search.md` "### OR Logic" section (~line 41) uses uppercase
  `meeting OR call`.
- `ARCHITECTURE.md` SearchTokenizer/SearchParser blocks will carry
  "uppercase-only" bullets if plan 026 has landed.

### Consumers of the grammar (no changes expected — verified)

- The Pratt parser (`src/search/search-parser.ts`) switches on token
  `type: 'or' | 'and'` — value casing never reaches it.
- `SearchEvaluator.evaluateOr/evaluateAnd` operate on AST nodes.
- The dashboard aggregator composes filter strings with **uppercase** `OR`
  (`src/view/embedded-dashboard/aggregation.ts`, `composeFilterQuery`,
  `WINDOW_BUCKET_FILTERS`) — those strings keep parsing identically.
- The embedded-list `mightAffectCodeBlock` heuristic greps for `file:`/
  `path:` substrings only — unaffected.
- Suggestion dropdowns never emit operators.

### The quoting escape hatch already exists

`processTokenValue` strips quotes from phrases and
`evaluatePhrase`/`evaluateTerm` match the literal word: `"or"` (quoted)
matches tasks containing the word `or` as text. That behavior must survive
this change unchanged — it becomes the _only_ way to search the literal
word `or`/`and`, so it must be explicitly tested.

## Risk notes (read before executing)

- **"and" is a common English word.** After this change, the bare query
  `coffee and wifi` means an OR-logic query ("coffee" AND-operator …) instead
  of three ANDed terms — wait, carefully: `coffee and wifi` parses as
  `coffee AND wifi` under the new grammar (same result set as today's
  implicit AND of three terms where `or`/`and` match almost no task text —
  but NOT identical: today the literal word `and` in task text participates).
  The practical delta is tiny but real: a task containing the literal word
  "and" matches today and may not after. This is an accepted trade-off of
  the grammar change; document it, don't fight it.
- Every existing saved query, dashboard-composed filter, and example in the
  repo uses uppercase operators — none change meaning.
- The change is one regex alteration; the risk lives in the _behavioral_
  delta for lowercase-word queries, which is exactly what the new tests must
  pin.

## Commands you will need

| Purpose                 | Command                                                        | Expected on success                                     |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| Tokenizer tests         | `npx jest tests/search-tokenizer.test.ts`                      | all pass                                                |
| Parser/evaluator suites | `npx jest tests/search.test.ts tests/search-evaluator.test.ts` | all pass                                                |
| Full unit suite         | `npm test`                                                     | all pass                                                |
| Docs build              | `npm run docs:build`                                           | exit 0                                                  |
| Lint                    | `npm run lint`                                                 | exit 0                                                  |
| Example guard           | `npx jest tests/example-query-guard.test.ts`                   | all pass (validates every shipped example still parses) |

## Scope

**In scope** (the only files you should modify):

- `src/search/search-tokenizer.ts` (the grammar change: 2 regexes)
- `tests/search-tokenizer.test.ts` (replace the case-sensitivity pin)
- `tests/search.test.ts` (add end-to-end grammar tests)
- `docs/search.md` (OR/AND sections + the line-51 contract sentence)
- `ARCHITECTURE.md` (tokenizer/parser blocks: drop "uppercase-only", add
  the new case rule + quoting escape hatch)
- `CHANGELOG.md` (one Unreleased bullet)
- `plans/README.md` status row (per policy: never committed)

**Out of scope** (do NOT touch, even though they look related):

- `src/search/search-parser.ts`, `src/search/search-evaluator.ts` — they
  key on token _type_, not casing; no change needed or permitted.
- `src/view/embedded-dashboard/aggregation.ts` — its composed filters use
  uppercase `OR` already and are covered by their own tests; leave alone.
- `src/search/search-suggestions.ts` — suggestions never emit operators.
- Any locale/i18n layer — operator words are grammar, not UI strings.
- The `improve`-style lowercase handling in property bracket values
  (`[status:Draft or Active]` splits on literal `OR` only — that
  behavior is separate and unchanged; do not "fix" it here).

## Git workflow

- Branch: `advisor/027-lowercase-operators` from the current development
  branch.
- Commit per step; message style: plain-sentence subject, no plan numbers
  (repo policy rule 6). Example from `git log`: "Fail loud on search values
  the evaluator can never match".
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make the operator regexes case-insensitive

In `src/search/search-tokenizer.ts`, change the two operator patterns to:

```ts
{ type: 'or' as const, regex: /\bOR\b/iy },
{ type: 'and' as const, regex: /\bAND\b/iy },
```

(the `i` flag only — keep sticky `y` and word boundaries; they anchor the
match at `pos` and prevent matching inside words like "panda" or "orbit").
`processTokenValue` already lowercases the captured operator value, so the
AST is unchanged for uppercase input.

**Verify**: `npx jest tests/search-tokenizer.test.ts` → the old
"does not match lowercase or/and as operators" test FAILS (expected — it is
the pin you replace in Step 2). All other tokenizer tests pass.

### Step 2: Replace the case-sensitivity pin with the new grammar pins

In `tests/search-tokenizer.test.ts`, replace the test quoted in "Current
state" with:

```ts
it('matches lowercase and uppercase or/and as operators', () => {
  const lower = tokenize('hello or world');
  expect(lower[1].type).toBe('or');
  expect(lower[1].value).toBe('or');

  const upper = tokenize('hello OR world');
  expect(upper[1].type).toBe('or');
  expect(upper[1].value).toBe('or');

  const mixed = tokenize('todo and done AND cancelled');
  expect(mixed[1].type).toBe('and');
  expect(mixed[3].type).toBe('and');
});

it('word boundaries prevent matching inside words', () => {
  // "panda" contains "and"; "orbit" contains "or" — neither is an operator.
  const tokens = tokenize('panda orbit');
  expect(tokens).toHaveLength(2);
  expect(tokens.every((t) => t.type === 'word')).toBe(true);
});
```

Also add a quoting escape-hatch pin (same file):

```ts
it('a quoted "or" is a phrase, never an operator', () => {
  const tokens = tokenize('"or"');
  expect(tokens).toHaveLength(1);
  expect(tokens[0].type).toBe('phrase');
  expect(tokens[0].value).toBe('or');
});
```

**Verify**: `npx jest tests/search-tokenizer.test.ts` → all pass.

### Step 3: Pin the end-to-end semantic change and the quoting escape hatch

In `tests/search.test.ts` (inside the describe covering evaluation — match
the file's existing structure), add:

```ts
it('lowercase or behaves as the OR operator', async () => {
  const a = createBaseTask({ path: 'a.md', text: 'alpha task' });
  const b = createBaseTask({ path: 'b.md', text: 'beta task' });
  const evalA = await Search.evaluate('alpha or beta', a, false);
  const evalB = await Search.evaluate('alpha or beta', b, false);
  expect(evalA).toBe(true); // matches the alpha side
  expect(evalB).toBe(true); // matches the beta side
});

it('a task containing the literal word "or" is found by the quoted form', async () => {
  const task = createBaseTask({ path: 'c.md', text: 'this or that' });
  expect(await Search.evaluate('"or"', task, false)).toBe(true);
  expect(await Search.evaluate('this "or" that', task, false)).toBe(true);
});
```

**Verify**: `npx jest tests/search.test.ts` → all pass. If the first test
fails because `createBaseTask`'s default fields place the text elsewhere,
read `tests/helpers/test-helper.ts` and adapt the task construction — but
if the _assertion_ semantics need changing, STOP (that means the grammar
did not change the way this plan specifies).

### Step 4: Update docs

`docs/search.md`:

1. "### OR Logic" (~line 41): change "Use `OR` (uppercase) to match either
   term:" to "Use `OR` or `or` to match either term (case doesn't matter):"
   and keep the example.
2. "### AND Logic (Implicit)" section: add after its example: "An explicit
   `AND` or `and` works identically: `meeting AND work`."
3. Line 51's contract sentence ("A lowercase `or`/`and` is an ordinary
   search word…") must be REPLACED with: "To search for the literal word
   `or` or `and` in task text, quote it (`\"or\"`) — unquoted it is treated
   as an operator."

`ARCHITECTURE.md`: in the SearchTokenizer block, replace any
"uppercase-only"/case bullet with:
`- **Case**: operator tokens (`OR`/`AND`) match case-insensitively (Obsidian-parity grammar, word-boundary anchored); the quoted forms "or"/"and" are the escape hatch for searching the literal words.`
In the SearchParser block's Validation contract bullet (if plan 026
landed), no change is needed — validation is operator-independent.

`CHANGELOG.md`: add one bullet to `## Unreleased`:
`- Search operators `OR`/`AND` now also match in lowercase (`or`/`and`), matching Obsidian's search grammar; quote them ("or") to search the literal word.`

**Verify**: `grep -c "case doesn't matter" docs/search.md` → 1;
`grep -c "ordinary search word" docs/search.md` → 0;
`npm run docs:build` → exit 0.

### Step 5: Prove every shipped example and filter still parses

The grammar change must not alter any shipped query's meaning.

**Verify**: `npx jest tests/example-query-guard.test.ts` → all pass (every
`examples/` + `docs/` block still parses through the real parsers);
`npx jest tests/dashboard-aggregation.test.ts` → all pass (composed filters
with uppercase `OR` unchanged); `npm test` → full suite green.

## Test plan

- Rewritten pin: "matches lowercase and uppercase or/and as operators"
  (was: "does not match lowercase or/and as operators") in
  `tests/search-tokenizer.test.ts`.
- New boundary pins: "word boundaries prevent matching inside words"
  (`panda`, `orbit`), and "a quoted \"or\" is a phrase, never an operator".
- New end-to-end pins in `tests/search.test.ts`: lowercase-`or` OR-semantics
  against two real tasks, and the quoted escape hatch finding the literal
  word.
- Existing guards that must keep passing: the example/docs block guard
  (`tests/example-query-guard.test.ts`), the dashboard aggregation property
  tests (composed-filter semantics), and the full search suites.
- Verification: `npm test` → all suites green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx jest tests/search-tokenizer.test.ts` exits 0; the old
      lowercase-is-not-an-operator test no longer exists; the three new
      tokenizer pins exist and pass
- [ ] `npx jest tests/search.test.ts` exits 0 including the two new
      end-to-end tests
- [ ] `grep -c 'regex: /\\bOR\\b/iy' src/search/search-tokenizer.ts` → 1
      (same for AND)
- [ ] `grep -c "ordinary search word" docs/search.md` → 0
- [ ] `npx jest tests/example-query-guard.test.ts` exits 0
- [ ] `npm test` exits 0 (full suite, no regressions)
- [ ] `npm run docs:build` and `npm run lint` exit 0
- [ ] `CHANGELOG.md` Unreleased section contains the lowercase-operators
      bullet
- [ ] `git status` shows no changes outside the in-scope list
- [ ] `plans/README.md` status row updated (not committed)

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1's one-flag change breaks tokenizer tests OTHER than the
  case-sensitivity pin — that means some behavior depended on case
  sensitivity beyond the documented contract (e.g. a pattern-ordering
  interaction with the prefix or phrase patterns). Do not chase it.
- The end-to-end test in Step 3 shows `alpha or beta` evaluating FALSE for
  the beta task — the parser consumed `or` differently than tokenized
  (parser/tokenizer contract drift; report the actual AST).
- Any dashboard aggregation composed-filter test fails — the uppercase-only
  assumption in `aggregation.ts` was wrong somewhere; that file is out of
  scope and the failure changes the plan's risk assessment.
- You find existing tests that search for the literal words "or"/"and"
  unquoted in task text (they would now behave differently) — report the
  files; do not rewrite those tests yourself.
- `npm test` fails in suites outside the search layer (grammar change
  leaked somewhere the plan says it cannot).

## Maintenance notes

- The grammar is now "operators are case-insensitive; quote the word to
  search it literally". Any future operator added to `PATTERNS` (e.g. a
  `NOT` keyword) should follow the same case rule and get the same pin
  trio (upper/lower/mixed, boundary, quoted escape).
- Plan 026's ARCHITECTURE.md Step-3 bullets say "uppercase-only" — this
  plan supersedes them; if 026 lands first, its wording is the thing to
  update (already in scope above).
- The `[status:Draft or Active]` property-value `OR` split remains
  case-sensitive by separate decision — a reviewer should confirm nobody
  "fixed" it here.
- Docs screenshots may become stale in wording. Run the manual informational check when appropriate; record drift without capture or manifest changes. Regeneration is a separate deliberate task requiring image review.


## Results

**Implemented.** The tokenizer's `OR` and `AND` patterns now use the sticky `iy` flags, so lowercase, uppercase and mixed-case operators all produce the same lowercased operator token. Word boundaries still prevent matches inside `panda`/`orbit`; quoted `"or"`/`"and"` remain literal phrases. No parser or evaluator change was needed.

**Red/green.** Before the regex change, the new tokenizer/evaluator cases failed 3 assertions (106 passed across the two suites). After the change: 6 targeted suites / 189 tests passed. The real-Obsidian State-group search and Task List specs passed 7/7, including the new lowercase `state:active or state:completed` case.

**Gate results.** Full units: 188 suites / 5,633 tests. `npm run build`, `npm run lint` and `npm run docs:build` all passed. Shipped examples still parse through `tests/example-query-guard.test.ts`, and dashboard composed filters still pass.

**Limitations.** Unquoted lowercase `or`/`and` now act as operators, so a query that intended the literal word must quote it; this is the documented trade-off. No screenshots were recaptured.
