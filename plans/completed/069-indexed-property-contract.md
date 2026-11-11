# Plan 069: Unify indexed and fallback property matching

> **Executor instructions:** Read this complete standalone plan, inspect drift and local changes, then write regression tests before product edits. Verify each step; stop on its STOP conditions. Update this plan and its README status locally when complete. No implementation has occurred during planning.
>
> **Drift check (run first):** `git diff --stat e3d0456..HEAD -- src/services/property-search-engine.ts src/search/search-evaluator.ts src/search/search-parser.ts src/search/search-tokenizer.ts src/search/search-types.ts src/utils/property-evaluator.ts tests/property-search-contract.test.ts tests/property-search-engine.test.ts tests/property-search-date-comparison.test.ts tests/property-evaluator.test.ts tests/property-search.test.ts tests/search-bulk.test.ts tests/integration/property-search.test.ts docs/search.md CHANGELOG.md`. Also run `git status --short`. Compare the excerpts with live code; expected predecessor-plan changes must be reconciled explicitly, unexplained semantic drift is a STOP condition.

## Status

- **Priority:** P2
- **Effort:** M–L, including tests and documentation
- **Risk:** MED
- **Depends on:** none; run after 067 for evaluator conflict avoidance and before 059; sequence with 071 parser changes
- **Category:** bug
- **Planned at:** commit `e3d0456`, 2026-11-10
- **Status:** DONE (2026-11-11)
- **Origin:** Deep project review N07; the required context is inlined below.

## Why this matters

The fast property index performs exact/first-spelling lookup even though documented unquoted values are partial and normally case-insensitive. Key existence misses empty arrays; null and exact empty-string intent are lost; whitespace before a quoted value changes exactness. Correct matching must remain indexed and batch-oriented rather than falling back to metadata reads for every task.

## Current state

`src/services/property-search-engine.ts:457`:

```ts
  private findValueInCache(
    cache: Map<unknown, Set<string>>,
    searchValue: string,
    caseSensitive: boolean,
  ): Set<string> | undefined {
    // First try exact match
    const exactResult = cache.get(searchValue);
    if (exactResult) {
      return exactResult;
    }

    // If case-insensitive, search for matching string keys
    if (!caseSensitive) {
      const lowerSearch = searchValue.toLowerCase();
      const cacheEntries = Array.from(cache.entries());
      for (const [cacheKey, fileSet] of cacheEntries) {
        if (
          typeof cacheKey === 'string' &&
          cacheKey.toLowerCase() === lowerSearch
        ) {
          return fileSet;
        }
      }
    }

```

`src/search/search-evaluator.ts:995`:

```ts
      propertyValue = value.slice(colonIndex + 1);

      // Handle empty value case [type:]
      if (propertyValue === '') {
        propertyValue = null;
      }
    } else {
      // Key-only case like [type]
      propertyKey = value;
      propertyValue = null;
    }

    // Build the engine query string. The engine receives the same shape the
    // inline path always used: [key:value] or [key].
    const query =
      propertyValue !== null
        ? `[${propertyKey}:${propertyValue}]`
        : `[${propertyKey}]`;
    return { query, propertyKey, propertyValue };
```

`src/search/search-parser.ts:456`:

```ts
      const originalColonIndex = original.indexOf(':');
      if (originalColonIndex !== -1) {
        const originalValue = original.slice(originalColonIndex + 1, -1); // -1 to exclude closing bracket

        // Check if the original value was quoted
        if (originalValue.startsWith('"') && originalValue.endsWith('"')) {
          exact = true;
        }

```

The cache is Map<property key, Map<unknown value, Set<file path>>>. Array flattening at property-search-engine.ts:201 leaves no value entry for an empty array. getPropertyCacheForKey:310 returns only the first matching key spelling. docs/search.md:545 says `[type:ject]` matches Project; quoted exact values force case sensitivity. Existing date/numeric helpers live in PropertyEvaluator.

**Existing test/convention exemplar:** `tests/property-search-engine.test.ts:11`:

```ts
  const file = new TFile(path, path.split('/').pop() || path, 'md');
  Object.assign(file, {
    basename: path.replace('.md', ''),
    stat: { size: 1024, mtime: Date.now() },
    isTFile: true,
  });
  return file;
};
```

Use actual TFile instances and metadataCache/vault seams like this fixture, but use deterministic local date components and no Date.now. Instantiate real TaskStateManager/PropertySearchEngine/Search rather than mocking searchProperties.

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

- `src/services/property-search-engine.ts`
- `src/search/search-evaluator.ts`
- `src/search/search-parser.ts`
- `src/search/search-tokenizer.ts`
- `src/search/search-types.ts`
- `src/utils/property-evaluator.ts`
- `tests/property-search-contract.test.ts`
- `tests/property-search-engine.test.ts`
- `tests/property-search-date-comparison.test.ts`
- `tests/property-evaluator.test.ts`
- `tests/property-search.test.ts`
- `tests/search-bulk.test.ts`
- `tests/integration/property-search.test.ts`
- `docs/search.md`
- `CHANGELOG.md`

Local bookkeeping: this file and its README row stay unstaged. **Out of scope:** View notification fan-out (059), task source writes, generic query precedence/error UI (071), settings migrations, new search features or dependency upgrades. No new source module is necessary; if one becomes necessary, revise this allowlist first. Any additional product path requires a scope revision before editing. No screenshot assets/manifest, dependencies, generated bundles in commits, or unrelated cleanup.

## Git workflow

Use the current worktree on a feature branch from the default branch, preserving local work. Do not create a worktree/clone or run git pull automatically. Do not stage/commit plans/, .freebuff/ or local plugin data.json. Do not push/open a PR. A request to write this plan is not an instruction to implement or commit it. If implementation is later requested and a commit is explicitly authorized, stage only in-scope product files; use a temporary message file and remove it afterward, with trailers `🤖 Generated with Codebuff` and `Co-Authored-By: Codebuff <noreply@codebuff.com>`. Never put local plan numbers into product docs or commit messages.

## Steps

### Step 1: Write a concrete property matching matrix

Create tests/property-search-contract.test.ts with tasks in a.md type=Project, b.md type=project, c.md type=Project backlog, d.md type=null, e.md type=[], f.md type="", g.md Type=Project, plus no-key and numeric/boolean/date/array controls. Explicit expectations: [type:ject] → a,b,c,g; [type:Project] → a,b,c,g with match-case off; [type] and [type:] include d/e/f/g but exclude no-key; [type:null] → d; [type:""] → f; [type:"Project"] and [type: "Project"] agree (a with the existing exact/case-sensitive key contract). Pin quoted keys and comparison/OR behavior independently. Run real index, no-engine fallback and engine-error fallback against the same expected sets.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/property-search-contract.test.ts tests/property-search-engine.test.ts tests/property-search-date-comparison.test.ts tests/property-evaluator.test.ts tests/property-search.test.ts tests/search-bulk.test.ts` → partial, mixed-case union, null, empty-array existence and exact-empty cases fail before changes; existing comparison controls document compatibility

### Step 2: Carry property intent without lossy string reconstruction

In SearchNode/search-types and the property parser, retain presence vs null vs quoted empty-string and exactness. Use a small typed descriptor shared with PropertyEvaluator; do not serialize a quoted empty value as key-only. Trim surrounding syntax whitespace without discarding quoted content. Preserve ordinary Search.parse/filterTasks signatures. Preserve direct searchProperties(string, caseSensitive) callers/tests with an adapter if adding a typed internal engine method. Do not treat quotes as a blanket change to date/numeric/boolean semantics: retain pinned behavior unless documented exact-string intent already resolves it.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/property-search-contract.test.ts tests/property-search-engine.test.ts tests/property-search-date-comparison.test.ts tests/property-evaluator.test.ts tests/property-search.test.ts tests/search-bulk.test.ts` → parser descriptors distinguish existence/null/empty and both fallback paths satisfy the matrix

### Step 3: Match distinct indexed values and union every matching spelling

Represent property existence separately from flattened values (including empty arrays); update initialize, pending incremental batches, removal/rename and rebuild paths consistently. Apply shared matching to distinct cached values and union all key/value spellings when case-insensitive. Return safe result sets without mutating index-owned sets. Hoist query interpretation outside row loops and preserve one engine resolution per unique filter/batch. Add create/update/remove/rename/rebuild acceptance to the contract suite.

**Verify:** `npm test -- --runInBand --coverage=false --runTestsByPath tests/property-search-contract.test.ts tests/property-search-engine.test.ts tests/property-search-date-comparison.test.ts tests/property-evaluator.test.ts tests/property-search.test.ts tests/search-bulk.test.ts` → all matrix and index lifecycle tests pass; engine-backed bulk search does not call getFileCache once per task

### Step 4: Verify host results and document the exact contract

Extend tests/integration/property-search.test.ts with scoped temporary fixture properties covering partial values, mixed case, empty/null and quoted whitespace, cleaning them afterward. Verify real panel result membership through fresh queries; 059 separately owns automatic invalidation. Update docs/search.md to state distinct existence/null/empty behavior and CHANGELOG concisely.

**Verify:** `./node_modules/.bin/playwright test --config=tests/integration/playwright.config.ts --project=obsidian property-search.test.ts` → after npm run build, exact property contract cases run and pass with the real index

### Final step: Complete repository gates and record outcomes

Format only changed in-scope files, run full tests/typecheck/build/lint and review the diff. Run every host/performance gate specified above; if unavailable, record incomplete verification, not a pass. Run screenshot --check manually if source changed and leave stale rows informational. Update Results and README status; local planning files remain unstaged.

**Verify:** `npm test -- --runInBand`, `./node_modules/.bin/tsc -p tsconfig.json --noEmit --skipLibCheck`, `npm run build`, `npm run lint`, `git diff --check` → all exit 0; task diff contains only scoped product changes, apart from pre-existing work.

## Test plan

Use the actual engine with small typed host seams. Assert expected file sets independently, then compare indexed/fallback/bulk paths. Array values match any element under the pinned scalar contract; empty arrays count as existing keys. Include identical keys/values in different casing across files and in one frontmatter object. Protect numeric/date comparison suites, OR-in-property parsing, negative filters, read-only index-set ownership, rebuild/removal, and no-key results. Test a quoted literal null distinctly only if supported by the documented exact-string contract; do not invent undocumented coercions.

## Done criteria

- [ ] The seven-file matrix passes against actual indexed and fallback paths, including exact quoted-empty and whitespace equivalence.
- [ ] Incremental removal/rebuild cannot leave the separate existence index stale.
- [ ] A bulk property query resolves each distinct predicate once and performs no per-task metadata scan.
- [ ] Date/numeric/boolean/array contracts have explicit preserved expectations, not only implementation parity.
- [ ] Targeted and specified host/performance gates ran with the expected cases; full unit/typecheck/build/lint/diff checks pass.
- [ ] Named documentation is current; visible changes have concise CHANGELOG text, or Scope explicitly justifies its absence.
- [ ] Results and local index record red/green evidence and limitations; no out-of-scope edits or screenshot capture.

## STOP conditions

- Semantic drift beyond reconciled predecessor changes, a required out-of-scope edit, or a verification failure persisting after two focused attempts.
- If key quoting vs value quoting requires a product semantic change beyond the documented exact-match rule, record the conflict before implementing that part.
- If maintaining direct searchProperties callers needs an out-of-scope migration, revise scope before changing callers.
- Do not add a full frontmatter copy per task or bypass the index to obtain passing results.

## Maintenance notes

Keep a single matching contract authoritative for indexed and fallback paths. Any future property mode must preserve absence, null and empty separately. 059 must run these acceptance tests while adding index notifications; 071 must retain this property parser contract.

## Results

**Implemented.** Property filters now carry a typed descriptor (`existence`, `null`, or `string` value, quoted exactness and quoted-key exactness) through the parser and evaluator. `PropertyEvaluator.matchesPropertyFilter` is the single matching contract used by both the metadata fallback and the index. The index keeps a separate key-presence map so null values and empty arrays exist, unions every matching key spelling, matches unquoted string values partially and case-insensitively, keeps numbers and booleans typed, and returns fresh result sets. Incremental updates and removals maintain the presence map, and direct `searchProperties(string)` callers keep their existing adapter.

**Red/green.** `npm test -- --runInBand --coverage=false --runTestsByPath tests/property-search-contract.test.ts` with only the source files reverted: 6 failed / 0 passed (`RED_EXIT=1`); restored: 6 passed / 6. The affected property/search suites then passed together: 7 suites, 296 tests.

**Limitations.** The plan's isolated-host Playwright property scenario and the informational screenshot check were not run, so behavior is verified at unit level only. The contract suite seeds the real engine through its initialization path but uses a small typed metadata-cache mock rather than a live Obsidian vault.
