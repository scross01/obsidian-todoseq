# Completed plans

Archive of completed plans moved out of [`../README.md`](../README.md) so the main plan index stays scannable: 40 of 81 plans are done and live in this folder. Per plan you get the verbatim completion record (formerly the Status cell of the main table) and a link to the plan file, which contains the plan itself plus any execution notes appended to it. README-level execution notes and dependency notes that concern completed plans only are collected at the bottom.

Active implementation plans and everything binding for their execution stay in [`../README.md`](../README.md); investigations and decision-gated plans live in [`../spikes/`](../spikes/), and rejected proposals in [`../rejected/`](../rejected/). Filing rules are in [`../README.md#folder-organization-binding`](../README.md#folder-organization-binding).

## Completion records

### Plan 001

- **Title**: Add CI workflow that runs typecheck, lint, and unit tests on every push and PR (incl. release test gate)
- **Meta**: priority P1 · effort S · depends on —
- **Record**: DONE
- **File**: [001-ci-test-lint-workflow.md](001-ci-test-lint-workflow.md)

### Plan 002

- **Title**: Add internationalization (i18n) system with type-safe translations
- **Meta**: priority P2 · effort M · depends on —
- **Record**: DONE (merged to `main`, commit `ae0f379`)
- **File**: [002-i18n-system.md](002-i18n-system.md)

### Plan 003

- **Title**: Add STARTED timestamp tracking (write + parse + `started:` search + `sortByStarted` + inline styling)
- **Meta**: priority P2 · effort L · depends on —
- **Record**: DONE
- **File**: [003-started-timestamps.md](003-started-timestamps.md)

### Plan 004

- **Title**: Translate remaining UI strings (views, menus, notices, commands)
- **Meta**: priority P2 · effort L · depends on 002
- **Record**: DONE (branch `advisor/004-translate-view-components`, commit `59b3d10`, awaiting merge)
- **File**: [004-translate-view-components.md](004-translate-view-components.md)

### Plan 005

- **Title**: Docs landing page visual update (left-aligned hero, CTA hierarchy, animated demo, shared tokens)
- **Meta**: priority P1 · effort M · depends on —
- **Record**: DONE (branch `advisor/005-docs-landing`)
- **File**: [005-docs-landing.md](005-docs-landing.md)

### Plan 006

- **Title**: Docs chrome & readability tweaks (images, tables, sidebar, long-page scan)
- **Meta**: priority P2 · effort M · depends on 005
- **Record**: DONE (branch `advisor/006-docs-chrome`)
- **File**: [006-docs-theme-readability.md](006-docs-theme-readability.md)

### Plan 007

- **Title**: README.md refresh (user landing + concise developer guide, aligned with docs)
- **Meta**: priority P1 · effort S–M · depends on — (token-echo 005)
- **Record**: DONE (branch `advisor/007-readme`)
- **File**: [007-readme.md](007-readme.md)

### Plan 008

- **Title**: CLOSED date line transition-matrix fix (preserve CLOSED on archive/completed targets, remove on un-complete, setting no longer gates removal)
- **Meta**: priority P1 · effort S–M · depends on —
- **Record**: DONE (merged to `main`: merge commit `08d518b`)
- **File**: [008-closed-date-transition-matrix.md](008-closed-date-transition-matrix.md)

### Plan 009

- **Title**: Table-cell CLOSED date: reuse `resolveClosedDateAction` matrix in `applyTableCellUpdate` (fixes completed→completed overwrite and non-completed→non-completed strip)
- **Meta**: priority P2 · effort S · depends on 008
- **Record**: DONE (merged to `main`: merge commit `489e178`; incl. regression fix `214cd0c`, bracket fix `8393c1c`, integration coverage `14c3fed`)
- **File**: [009-table-cell-closed-date-matrix.md](009-table-cell-closed-date-matrix.md)

### Plan 010

- **Title**: Strip Obsidian 1.14 color-highlight emoji in task list display (`stripMarkdownForDisplay`)
- **Meta**: priority P2 · effort S · depends on —
- **Record**: DONE (commit `ed4994d`; two-pass highlight strip with explicit six-emoji list + U+FE0F, 6 new unit tests incl. non-color-emoji negative case and description delegation; suite 5302/5302, build/lint green)
- **File**: [010-obsidian-114-highlight-colors.md](010-obsidian-114-highlight-colors.md)

### Plan 011

- **Title**: Auto-Archive core service — criteria evaluation, batch apply via update coordinator, session undo journal (TDD)
- **Meta**: priority P1 · effort M · depends on —
- **Record**: DONE (branch `advisor/011-archive-service-core`, commits `8beaf97`→`7676e75`; 32 unit tests incl. 5000-match stress (~14ms apply, ~21ms undo), suite green 4725/4725; post-review: RegexCache for undo pattern, `parseLine` confirmed as plan 012's undo re-parse seam)
- **File**: [011-archive-service-core.md](011-archive-service-core.md)

### Plan 012

- **Title**: Auto-Archive UI — preview-and-confirm modal, settings section (mapping rows), `archive-completed-tasks` + `archive-undo-last-run` commands, theme-native styles
- **Meta**: priority P1 · effort L · depends on 011
- **Record**: DONE (branch `advisor/011-archive-service-core`, commits `11ee379`→`407f74f`; CDP smoke passed: dialog open → preview → apply → file rewrite → undo → restore; 2 smoke-found fixes in `407f74f`; suite green 4736/4736, integration 43/43; see reconciliation note)
- **File**: [012-archive-dialog-settings-ui.md](012-archive-dialog-settings-ui.md)

### Plan 013

- **Title**: Auto-archive on vault scan (opt-in, days-mode only) with undo notice; integration specs validating the whole feature
- **Meta**: priority P2 · effort S · depends on 011, 012
- **Record**: DONE (branch `advisor/011-archive-service-core`, 2026-09-25; 4 gating unit tests + 6 integration specs incl. date-mode exclusion and no-op silence; suite green 4753/4753, integration 50/50; deviations in execution notes below)
- **File**: [013-auto-archive-on-startup.md](013-auto-archive-on-startup.md)

### Plan 014

- **Title**: Redesign archive mapping settings to update dynamically when custom task keywords change (maintainer feedback 2026-09-24; design decisions resolved; mobile layout hook landed with the mobile-UX fix)
- **Meta**: priority P3 · effort M · depends on 011, 012
- **Record**: DONE (branch `advisor/011-archive-service-core`, 2026-09-25; `buildArchiveMappingItems()` render-time derivation + `refreshPreservingEditingState()` wired into the debounced keyword commit; 4 unit tests + `tests/integration/archive-settings.test.ts` 4 specs; suite green 4759/4759, integration 54/54)
- **File**: [014-archive-mapping-settings-redesign.md](014-archive-mapping-settings-redesign.md)

### Plan 015

- **Title**: Archive dialog preview list at scale (10s–100s of tasks) — analysis + future trigger conditions; deferred P2/P3 findings (bulk select, title attr) resolved 2026-09-25
- **Meta**: priority P4 · effort S · depends on 012
- **Record**: DONE (analysis + deferred-item pass, 2026-09-25; virtualization rejected, chunking documented; bulk visible-slice controls + title attr landed — 4 unit + 4 integration tests; undo-hint P3 stays deferred)
- **File**: [015-archive-dialog-preview-at-scale.md](015-archive-dialog-preview-at-scale.md)

### Plan 016

- **Title**: Document Auto-Archive: settings reference, feature page, commands, sidebar/README/CHANGELOG, ARCHITECTURE.md service + graph + patterns
- **Meta**: priority P1 · effort M · depends on 011–015 merged to main (or branch docs from the feature branch)
- **Record**: DONE (branch `advisor/016-auto-archive-docs`, 2026-09-25, commit `089c10b`; 9 doc files — settings section, feature page, sidebar/index/command-palette/README/CHANGELOG/task-entry cross-link, ARCHITECTURE.md entries + graph nodes + patterns 32–34; docs:build + mermaid blocks 0–2 parse-OK + format/lint green, suite green 4768/4768; redo after stash accident destroyed the first pass — `docs/auto-archive.md` survived untracked)
- **File**: [016-auto-archive-documentation.md](016-auto-archive-documentation.md)

### Plan 017

- **Title**: Archive dialog selection keys include table-cell identity (`getMatchKey` = `path:line:cellIndex`) — fixes sibling-cell include/exclude collisions
- **Meta**: priority P1 · effort S · depends on —
- **Record**: DONE (commit `793caf2` on `development/autoarchive`: getMatchKey helper + 7 sites converted; 3 unit tests + sibling-cells integration spec; suite 4771/4771, integration 10/10 incl. new spec)
- **File**: [017-archive-dialog-cell-identity.md](017-archive-dialog-cell-identity.md)

### Plan 018

- **Title**: ArchiveService: per-match apply containment + journal always reflects the run; date-mode note follows live mode; guard dialog `saveSettings` chains; drop dead `computeBulkInclude` param
- **Meta**: priority P2 · effort S–M · depends on 017 (same dialog file; order avoids conflicts)
- **Record**: DONE (commit `94a3599`: per-match apply containment + journal tests, live date-mode note + integration spec, guarded saveSettings chains, dead param removed; suite 4774/4774, lint/build green)
- **File**: [018-archive-apply-journal-and-dialog-runtime.md](018-archive-apply-journal-and-dialog-runtime.md)

### Plan 019

- **Title**: Archive dialog a11y + visual polish: label mapping toggles, "Closed at least" wording, AA-contrast source keyword, phone bottom-sheet fit, hide bulk controls when empty
- **Meta**: priority P2 · effort S–M · depends on 017, 018 (same dialog file + styles)
- **Record**: DONE (commit `2eb4e60` incl. 2 doc-line syncs: aria-labeled toggles, "Closed at least", contrast 6.72/6.78, phone bottom sheet, empty-state bulk hide + scoped CSS rule; suite 4774/4774, integration 22/22, re-audit probes all pass)
- **File**: [019-archive-dialog-a11y-visual-polish.md](019-archive-dialog-a11y-visual-polish.md)

### Plan 020

- **Title**: Implement `todoseq-dashboard` embedded dashboard cards (aggregate counts grouped by state/priority/tag/date buckets; bar, column, donut, tiles, heatmap displays; click-through to Task List with composed query; mobile-responsive; dynamic in-place updates)
- **Meta**: priority P2 · effort L · depends on —
- **Record**: DONE (branch `development/dashboard`, 2026-09-29; commits `16c6dbd`→`0ce4b5b`; build/lint green, unit 142 suites / 4871 tests green incl. 4 new suites (97 tests), new integration specs 4/4; the PRE-EXISTING shared-session integration failures noted below were root-caused 2026-09-30 and fixed (see integration-stability execution notes); advisor re-ran all gates independently)
- **File**: [020-task-dashboard-cards.md](020-task-dashboard-cards.md)

### Plan 021

- **Title**: Open-ended date ranges in search (`scheduled:2026-10-07..` / `..2026-12-31`) — tokenizer, parser, evaluator, suggestions; simplifies 020's "Later" filter when it lands
- **Meta**: priority P3 · effort S–M · depends on — (optional Step 5 applies only if 020 has landed)
- **Record**: DONE (branch `development/dashboard`, 2026-09-30, commits `a8f00fe` + `e1ec34d`; one-sided ranges, value-side `<`/`<=`/`>`/`>=`, partial-date bounds/operators via a shared interval helper in DateUtils; tokenizer needed no changes — recon corrected the plan's Step-2 premise; parser builds one-sided range_filters in two sites; evaluateRangeFilter rewritten to resolved-bound comparison; suggestions offer trailing `..`; dashboard Later filter simplified to the range form; suite 4924/4924, build/lint/docs:build green, dashboard integration 8/8)
- **File**: [021-search-open-ended-date-ranges.md](021-search-open-ended-date-ranges.md)

### Plan 023

- **Title**: Align embedded task list headers with the dashboard cards — chevron _before_ the query chip on no-title headers (currently after), title 1rem bold → 13.5px semibold, chip font size 0.68rem
- **Meta**: priority P3 · effort S · depends on 020 (landed)
- **Record**: DONE (branch `development/dashboard`, 2026-09-30; chevron now leads the no-title header via the shared `renderHeaderContentSpans`; title 13.5px semibold, chips 0.68rem; executor decisions: dropped the `Search:` chip label to mirror dashboards (operator choice), deleted unreachable `renderToggleHeader` + vestigial `renderExpandedContent` params, fixed latent `Sort: undefined` guard; suite 4890/4890, build/lint green, integration 11/11; docs screenshots of embedded headers now stale — regeneration owed; follow-up polish: query chip promoted to `--text-normal` vs muted parameter chips (dashboard query/meta split) and parameter labels lowercased (`limit: 5`))
- **File**: [023-embedded-header-alignment.md](023-embedded-header-alignment.md)

### Plan 024

- **Title**: Docs screenshot capture & recapture pipeline — scenario registry + runner over the integration harness (isolated Obsidian via CDP), staleness manifest, usage scan, recapture of all 20 referenced assets, prune unreferenced (incl. android set)
- **Meta**: priority P2 · effort L · depends on —
- **Record**: DONE 2026-10-01. Built on obsidian-demo-recorder (ODR) after the ODR-first re-spike: `scripts/screenshots/capture.ts` driver + 4 scenario scripts (18 stills), `manifest.ts` (plugin-build + scenario hashes, FRESH/STALE/MISSING/ORPHAN), `usage-scan.ts` (unreferenced-asset scan over git-tracked markdown). 18 assets recaptured against the real plugin; 10 unreferenced pruned. 18 fresh / 2 manual (gif + light still). 5018 unit tests + 12 Dashboard integration tests + docs:build green. Blocked-then-fixed ODR gaps reported upstream and revalidated after the maintainer's fixes: plugin-load gate (ODR now verifies + loads), `wait-for fn` string predicates now invoked, `wait-for timeout` honored, `evaluate` returns surfaced, unknown `command` ids fail fast (this caught a wrong `editor:toggle-preview` id — real id is `markdown:toggle-preview`). Two ODR gaps remain and are worked around in-scenario: no page targeting (settings opens in a separate Electron window on Obsidian 1.13+, so `helpers.ts openSettingsDialog` adopts the window's `.modal` into the recorder page) and `resolveClipBounds` takes the first DOM match with no visibility filter (clip selectors scoped to `.markdown-preview-view`). `--stills-scale 2` still falls back to 1× on this Obsidian build (documented).
- **File**: [024-screenshot-capture-pipeline.md](024-screenshot-capture-pipeline.md)

### Plan 025

- **Title**: Feature-specific docs screenshots where they add real value — dashboard display forms, auto-archive dialog, collapse states, date autocomplete, warning arrows; binding value bar + explicit rejected-candidates list to prevent bloat
- **Meta**: priority P3 · effort M · depends on 024
- **Record**: DONE 2026-10-02 (branch `development/dashboard`). All six candidates resolved: S1 dashboards re-scoped to one card per documented example (5 assets, no image in Display Forms), S2 auto-archive dialog (1 asset, secondary settings crop skipped — already legible), S4 date autocomplete already satisfied by 024, S5 warning arrows (1 asset embedded in both pages that document them; the hand-typed example block was replaced), S6 task context menu (1 asset, previously mis-recorded as rejected), S3 collapse states (2 assets, one block captured collapsed then expanded after a chevron click — the planned two-block design would have shown a plain block, not the toggle). Every asset captured in both Obsidian base themes and swapped by the docs appearance toggle. 3 new scenarios + 3 new seed sets in the 024 harness; suite 5237/5237, lint/docs:build green; `docs/assets` 3.7M against a ~8 MB budget. Recorded, not fixed: a seed edit in `helpers.ts` re-invalidates every scenario's manifest row.
- **File**: [025-feature-screenshots.md](025-feature-screenshots.md)

### Plan 026

- **Title**: Docs & architecture accuracy for the search layer and embedded-list options (sort list omits `closed`/`started`; no sort examples; ARCHITECTURE.md silent on fail-loud validation; guard test misses saved-search fixtures)
- **Meta**: priority P2 · effort S · depends on —
- **Record**: DONE (branch `development/dashboard`, 2026-09-30, commit `1d69533`; all 5 steps + done criteria; one plan deviation: Jest `expect()` takes no message argument, so per-search attribution uses the assertion-value idiom; suite 4990/4990, lint/docs:build green; negative check verified the new guard catches an injected bad saved search with per-search attribution)
- **File**: [026-docs-search-accuracy.md](026-docs-search-accuracy.md)

### Plan 029

- **Title**: Task List empty state names the filter that hid the tasks — count tasks hidden by `futureTaskSorting` / view mode via the same `classifyTask` + warning-period settings the sort uses, new pure copy module, and fix the "X of Y tasks" denominator to the pre-search count
- **Meta**: priority P2 · effort S–M · depends on —
- **Record**: DONE (branch `advisor/029-empty-state-hidden-filter-notice`, 2026-10-05; commits `670d6ce` `305dda0` `74229b4` from `5ebada9`, replayed onto `main` as `6c4631f` `c1c224a` `418df19` — the originals are not ancestors of `main`; `countHiddenByFilters` reuses the exported `classifyTask` + a shared `getWarningPeriodSettings()`, new pure `empty-state-copy` module, view `filterTasksByViewMode` wrapper deleted; 25 unit tests incl. the 3×4 `shown + hidden === total` invariant; embedded lists and dashboards deliberately out of scope; **executor caught two errors in this plan — the `!== 'showAll'` snippet contradicted the plan's own hide-matrix (sortToEnd keeps completed tasks in a trailing block), and the `scheduledWarningPeriod` premise was backwards (it pushes dates later; only deadline warnings pull earlier) — both plan body corrected, see execution notes; 1 pre-existing unrelated failure: dashboard heatmap test fails every Monday**; re-verified on `main` 2026-10-17: tsc, suite 5381/5381, lint, build, docs:build all green)
- **File**: [029-empty-state-hidden-filter-notice.md](029-empty-state-hidden-filter-notice.md)

### Plan 030

- **Title**: Exclude archived tasks from dashboard cards (filter at processor input gate, matching vault-scanner exclusion; archived state group disappears from state-grouped cards; aggregator archived-group handling kept as defensive pure-engine code)
- **Meta**: priority P2 · effort S · depends on — (020 landed)
- **Record**: DONE (branch `advisor/030-dashboard-exclude-archived`; `filterArchivedTasks` at 2 call sites + 5 new processor tests; suite 5307/5307, build/lint green; plans/README row updated locally — not committed)
- **File**: [030-dashboard-exclude-archived.md](030-dashboard-exclude-archived.md)

### Plan 031

- **Title**: Background-safe event-loop yield — `yieldToEventLoop` switches from `requestAnimationFrame` to a MessageChannel + `setTimeout` fallback so a vault scan yields in a background tab instead of stalling (extract to `src/utils/event-loop.ts`, behavioural test with a never-firing rAF)
- **Meta**: priority P1 · effort S · depends on —
- **Record**: DONE (branch `advisor/031-background-safe-yield`, 2026-10-16; helper extracted to `src/utils/event-loop.ts` — MessageChannel message task with `window.setTimeout(resolve, 0)` fallback, no rAF; scanner keeps its single call site; 3 behavioural tests incl. a never-firing rAF race-guard; CHANGELOG `Unreleased` entry added per convention (later tightened to user-focused wording per new AGENTS.md changelog guideline, commit `34f16a7`; amended into fix commit `d7b4724`), ARCHITECTURE.md needed no edit (it names only `yieldToEventLoop()`); suite 5310/5310 green, project tsc `--skipLibCheck` + lint + build green. Deviations/findings: (1) unclosed MessageChannel ports kept Jest's event loop alive after the suite — applied the plan's cleanup note, both ports closed inside `onmessage`; (2) repo lint rule `obsidianmd/prefer-window-timers` → fallback uses `window.setTimeout`; (3) `npx tsc --noEmit` without `--skipLibCheck` reports 3 pre-existing errors in `node_modules/obsidian.d.ts` (HistoryHandler) — zero project-file errors; (4) `eslint .` chokes on local-only untracked dirs (`demos/`, `output/`, not in eslint ignores) — linted with those two ignored; (5) `npm run format` also reformatted pre-existing drift in `tests/dashboard-renderer.test.ts` — reverted, out of scope, left at HEAD; new test file + helper would fail against the old rAF implementation (verified by re-reading, per plan) — not re-run against the hang)
- **File**: [031-background-safe-event-loop-yield.md](031-background-safe-event-loop-yield.md)

### Plan 032

- **Title**: Org-mode keyword separator — one compose-site rule in `TaskWriter` (`prefix` non-empty and not whitespace-terminated ⇒ single space before `newState`) so `* TODO` survives state cycles; byte-preservation matrix keeps markdown/checkbox/footnote output identical
- **Meta**: priority P2 · effort S · depends on —
- **Record**: DONE (branch `advisor/032-org-keyword-separator` from `34f16a7`, 2026-10-16; D1 rule in the plain compose branch — `prefix = indent + footnoteMarker`, separator `' '` iff no listMarker && prefix non-empty && prefix not whitespace-terminated; TDD red-green recorded: 5 characterisation rows green pre-fix (column-0, whitespace-terminated indent, `- ` marker, parser footnote `[^1]: `, checkbox), 5 rows red pre-fix → green post-fix (org `*`/`**` incl. completed, defensive no-trailing-space footnote marker, double-cycle round-trip); **premise refinement**: the footnote capture `^(\[\^\d+\]:\s+)` includes trailing whitespace, so parser footnotes are already byte-correct — they exercise the whitespace check, not the separator; the no-trailing-space footnote row pins the rule's defensive shape; code-comment tasks (`indent` = everything before keyword) normally end in whitespace so the rule skips them; suite 5320/5320, lint + tsc(skipLibCheck) + build green; CHANGELOG `Unreleased` bullet follows the user-facing entry rule; `tests/dashboard-renderer.test.ts` prettier drift from `npm run format` reverted again, out of scope; same environmental caveats as 031: `eslint .` needs local-only dirs ignored, bare `npx tsc --noEmit` has 3 pre-existing `obsidian.d.ts` errors. **Follow-up 2026-10-16 (same branch, second commit)**: the operator asked whether valid org files could carry the glued form (no — org syntax requires whitespace after the stars, and `org-patterns.test.ts:90` has always asserted the parser rejects `*TODO`); while double-checking, the same glue was found in the keyword-removal branch (`newState === ''`, reachable via `getCycleState('DONE') → ''`), which wrote `*Task text` — unparsable by our own parser, task lost. Same separator rule applied there (indent-keyed; empty-text headings stay bare `*`); 6 tests added (red→green for the 2 org rows), suite 5326/5326, lint/tsc/build green. **Separately flagged, NOT fixed**: the removal branch also drops `footnoteMarker` entirely (`[^1]: TODO x` → `Task text`, dangling `[^1]` references) — pre-existing, different bug class, needs its own decision)
- **File**: [032-org-keyword-separator.md](032-org-keyword-separator.md)

### Plan 033

- **Title**: STARTED edge-case hardening — test-first audit of FEI352's field-tested failure modes against the shipped 003 implementation (E1 stale-snapshot rapid cycling, E2 state-manager snapshot propagation, E3 mixed-case custom keywords, E4 decoration assert); fix only red rows; record E5–E7 rejections
- **Meta**: priority P2 · effort S–M · depends on 003 (shipped)
- **Record**: DONE (branch `advisor/033-started-edge-cases` from `6eaa707` — main already included 031+032 after operator fast-forward; task-writer.ts drifted vs the plan baseline only by 032's separator work, excerpts re-verified, no semantic drift; 2026-10-16, commits `139b06c` audit tests → `53039fb` fix, separable per D2). Rows: **E1 RED→fixed** — stale DOING→DONE returned `startedDate: null` in the snapshot; deeper than D2 predicted: the second transition targets a _completed_ state so `isActiveState` is false and the entire STARTED accounting was skipped (the source path additionally fabricated "now"); fix = parse the retained STARTED line on both write paths (vault + Editor API, new `parseStartedDateFromLine` mirroring the scanner) and key the accounting on setting+snapshot-knowledge instead of target-state activity; **E1b** (coordinator-level rapid stale race) red→green with the same fix; **E2 GREEN** as designed (`finalizeTaskState` 'state' case patches `startedDate`; `optimisticUpdate` only flips state/completed/rawText); **E3 consistent-with-state-matching** (D3, no fix) — `KeywordManager.normalizeKeyword` uppercases configured keywords and `isActive`/parser/panel/sort all see the normalised form, so `In-Progress` config matches `IN-PROGRESS` states; test corrected to the normalised semantics; **E4 GREEN** — 3 decoration assertions (CLOSED mirror, STARTED, callout STARTED) in task-formatting.test.ts. E5/E6 were already in the rejected list below; **E7 added**. Gate: format/lint/tsc(skipLibCheck)/5334-5334/build green (same environmental caveats as 031/032: eslint needs local-only dirs ignored, bare `tsc --noEmit` has the pre-existing obsidian.d.ts errors, dashboard prettier drift reverted again). **Out-of-scope finding reported**: the recurrence path neither inserts STARTED nor patches `startedDate` (applyRecurrenceUpdate is STARTED-unaware; finalize 'recurrence' omits it) — recurring rollovers into active states never stamp STARTED; plan-003 scope, flagged for the operator)
- **File**: [033-started-edge-case-hardening.md](033-started-edge-case-hardening.md)

### Plan 034

- **Title**: `description:` and `heading:` search prefixes (with `parentHeading` task data) — optional `Task.parentHeading` captured in `parseFile`'s existing line loop (cheap `#` gate), two additive prefix wirings (union/tokenizer/evaluator/suggestions), range allowlist untouched; foundation for 035's heading grouping
- **Meta**: priority P2 · effort S–M · depends on —
- **Record**: DONE (branch `advisor/034-search-prefixes` from `eba8f03`, 2026-10-18; drift check: `search-types/tokenizer/task-parser/task.ts` unchanged since `2bafcf6`, evaluator gained `evaluateSync`/`filterTasksByNode` but both route `prefix_filter` through the same `evaluatePrefixFilter` — one wiring point covers async + bulk, no STOP; TDD red→green: 16-failed red, then `parentHeading` capture (leading-`'#'` charCode gate, fence-skip via parseFile's existing block state, heading-task lines carry their own stripped text per D2, assigned at every parseFile push site incl. table cells/footnotes/`%%` blocks; org + code-comment parsers leave it `undefined` automatically), then union/tokenizer/evaluator → 18/18; suggestions: options-dropdown list + `validPrefixes` + no-value-suggestion hide for the two open-domain prefixes; **drive-by (fork parity)**: `started:` was missing from both UI prefix lists and added alongside; **Step 6 resolved**: embedded lists pass `search:` raw into `Search.filterTasks` (no allowlist) — pass-through, pinned by the bulk-facade test; existing `search-options-dropdown-coverage.test.ts` updated (count 10→13; index math now derives from `currentSuggestions.length` instead of stale magic numbers); docs rows+example in `docs/search.md`, ARCHITECTURE parser bullet + open-domain list, CHANGELOG user-facing bullet; gate: format/lint/tsc(`--skipLibCheck`)/5490-5490/build green — same environmental caveats as 031/032/033 (bare `npx tsc --noEmit` has the 3 pre-existing `obsidian.d.ts` errors, zero project-file errors)
- **File**: [034-description-heading-search-prefixes.md](034-description-heading-search-prefixes.md)

### Plan 043

- **Title**: Per-occurrence STARTED — recurrence rollover removes the completed occurrence's STARTED line (idempotent, both write paths, single atomic vault write kept) and inserts a fresh stamp only when the rolled state is active; `finalizeTaskState` 'recurrence' patches `startedDate`; manual transitions keep first-ever-start (regression-pinned R6); docs + CHANGELOG gain the recurrence exception
- **Meta**: priority P2 · effort S–M · depends on 033 (branch must merge to `main` first)
- **Record**: DONE (branch `advisor/043-started-recurrence-rollover` from `53039fb`, 2026-10-16, commit `86f4d3a`; TDD red→green recorded — R1/R2/R5/R7 red pre-fix, R3/R4/R6 green, then 10/10; vault reset inside the single `vault.process` (spy-asserted — one undo entry preserved), editor path reuses a new shared `removeDateLineInEditor` helper (also dedupes `removeTaskClosedDate`'s identical block); `finalizeTaskState` 'recurrence' patches `startedDate` so the next start's insert guard re-arms; full gate green — format / lint / tsc(skipLibCheck) / 5344-5344 (159 suites, +10) / build, dashboard prettier drift reverted again; same environmental caveats as 031–033 (eslint needs local-only dirs ignored, bare `tsc --noEmit` has the pre-existing obsidian.d.ts errors). **Execution findings**: (1) the coordinator completes a recurring task by remapping the keyword to the default-inactive state in the SAME 'state' write (`buildProcessingContext`, originalNewState preserved for recurrence) — recurring completions never stamp CLOSED; the 50 ms recurrence only advances dates, and that is where the STARTED reset fires; (2) the R7 red-after-green was a harness defect, not product code: `findDateLineWithParser` breaks at the first line the parser doesn't classify as a date line, so recurrence-test parser mocks must type STARTED/CLOSED lines like the real parser)
- **File**: [043-started-recurrence-rollover.md](043-started-recurrence-rollover.md)

### Plan 044

- **Title**: STARTED date mode setting — opt-in restart semantics via `startedDateMode` `'first'` / `'last'` (default `'first'`, byte-identical to today); single global setting — no recurring-specific toggle (043 owns the occurrence boundary); settings surface + migration v7 + mode-gated writer branch (fresh active entry overwrites, active→active retains) + docs
- **Meta**: priority P3 · effort S–M · depends on 033, 043 (same task-writer STARTED seams — merge/execute both first)
- **Record**: DONE (branch `advisor/044-started-date-mode` from `86f4d3a`, 2026-10-16; TDD red→green recorded — M2 (vault+source), M8, M9 red pre-fix, M1/M3/M4/M5/M6 green, then 39/39; migration v7 + latest-version pins updated (saved-search-manager ×3, settings-utils ×25 incl. the 'greater than latest' input → 8) with D5 justification + 3 new v7 tests; mode-gated writer branch per D2 — single `startedStampDate` clock (fixes the pre-existing double-`new Date()` file/snapshot micro-drift), `updateOrInsertStartedDateLine`/`updateTaskStartedDate` gain `allowOverwrite` (public return shape unchanged), accounting keyed on write-result per D4; settings dropdown `disabled:` on the shared Control schema typechecks (no fallback needed); docs settings.md 'STARTED Date Records' subsection + task-entry.md cross-ref + CHANGELOG; full gate green — format / lint / tsc(skipLibCheck) / 5359-5359 (159 suites, +15) / build, dashboard prettier drift reverted again; same environmental caveats as 031–043. Rejection entry 'Restart-aware STARTED' annotated superseded)
- **File**: [044-started-date-mode-setting.md](044-started-date-mode-setting.md)

### Plan 045

- **Title**: Date display fast path — memoize `DateUtils.formatDateForDisplay`/`formatDateTooltip` with input-derived keys (diffDays in the key ⇒ midnight-safe by construction), lazy absolute-label Intl; byte-identical strings are the contract; new `date-format` bench scenario
- **Meta**: priority P1 · effort M · depends — (run before 048 for clean profile attribution)
- **Record**: DONE (branch `perf/045-date-display-fast-path`, 2026-10-17): two-run node baselines then the v2 memo landed; `date-format` bench **303.64→0.99ms (m)** (`≈118×`), 350.4→1.8ms (l); obsidian view-mode refresh **119.7→83.5ms (−30%)** in the isolated profile-share comparison; plugin profile self-time 329→140ms with the format-region group **54.7%→1.4%** of self; all five control scenarios show no systematic regression; byte-identical output pinned by unit tests (midnight-safety structural: the diffDays is part of the cache key); gates rc=0 (unit + 86 integration); commit `280fd6a` carries the headlines; follow-up seed: inclusive date-group share 18.6% vs the 15% sub-gate — residue is warning/urgency-path `normalizeDateForTimezone` (24→25ms, unchanged), candidate for a future warning-path date-cost plan
- **File**: [045-date-display-fast-path.md](045-date-display-fast-path.md)

### Plan 046

- **Title**: Perf measurement fidelity — sleep-free timed regions, honest input-latency metric, scenario-selectable CPU profiles, checked-in profile analyzer
- **Meta**: priority P1 · effort S–M · depends on — (hard gate for 047/048 acceptance)
- **Record**: DONE (branch `perf/046-measurement-fidelity` from `65b1b95`, 2026-10-17; two baseline runs (34.6/34.9 rescan, 121.7/120.9 view-modes, 1397.3/1393.1 sleep-mixed search, 166.8/173.1 archive) pinned the artifact arithmetic — 1250ms of search's median and 150ms of archive's were fixed sleeps inside timed callbacks; restructure: archive = dispatch→visible with untimed afterEach close + `state:'detached'` wait (B2 revision killed bogus ~7ms stale-modal samples), search = `fill`→list-mutation `obsidian-search-input-latency` (4 after-runs: 1435.5-1440.4, 0.3% range; decomposes to ~83% plugin debounce / ~17% round-trip+render), `PERF_PROFILE=<label>` selects one scenario, `scripts/perf/analyze-profile.ts` added (7 unit tests, strict-tsc clean, fail-loud rc=1, auto-identifies minified bundle frames); B4 STOP resolved by diagnosis: control drift (rescan +2.4-4.3ms vs 0.6ms floor) traced to shared-desktop load (2.95-3.71, recorded) with byte-identical timers + constant heap work — floor-underestimation recorded as a methodology gap (baselines must log `uptime`); gates all rc=0 — format/lint/tsc/5392 jest (+7)/86 integration PERF-unset/strict tsc on harness files; src+docs diffs 0, docs/assets clean; verdict KEEP with numbers in commit message; README gained the metric-semantics + rename-mapping tables; deliberate recorded divergence: skill's Step-5 CI gate declined in favour of report-only repo philosophy)
- **File**: [046-perf-measurement-fidelity.md](046-perf-measurement-fidelity.md)

### Plan 047

- **Title**: Archive dialog open re-baseline — gated: run the honest open-only metric; ≤50 median ⇒ CLOSED-NO-ACTION, >50 ⇒ profile first then evidence-led fix in `archive-dialog.ts` only; prior "165ms structural" claim retracted
- **Meta**: priority P3 · effort S (S–M if gate opens) · depends 046 (hard)
- **Record**: DONE (2026-10-17, working tree only — no branch, the plan prescribes no commit when the gate closes) — **GATE CLOSED-NO-ACTION**: three consecutive honest open-only runs 17.1 / 18.2 / 16.8ms medians (≤50ms gate), spread 6.1% (≤20%), controls within noise; the prior "165.1ms structural cost" claim is retracted — 150ms of it was a fixed sleep inside the timed region (165.1−150 ≈ observed 15ms); no `src/` edit, no profile taken (G2 not reached), no commit; correction recorded in the dependency notes; full arithmetic in plan `## Results`
- **File**: [047-archive-dialog-open-rebaseline.md](047-archive-dialog-open-rebaseline.md)

### Plan 049

- **Title**: Classify once per refresh — `classifyAll` passed explicitly into `sortTasksWithThreeBlockSystem` + `countHiddenByFilters`; golden order/count pins; honest-scope single-pass threading
- **Meta**: priority P2 · effort S–M · depends 045/046 (profile attribution)
- **Record**: DONE (branch `perf/049-classify-once`, 2026-10-17) — **KEEP**: `classifyAll` map threaded through optional trailing params (every old call shape unchanged); live-file reconciliation corrected the plan's premise first (the duplicate classify exists only in the empty-visible branch, `task-list-view.ts:2077`); production-shaped **`classify-refresh-pair` 5.29→3.43ms (m) / 21.27→12.99ms (l) = 3.5–3.9× the required 2× bar**; 12-combo shared-classify bench **−81.5% at l** (bar was 35%; honest note recorded where it fell short at m); golden order/count pins captured red-first and byte-equal after; 12-combo invariant test untouched; classify spy asserts **exactly one** pass per refresh; same-clock A/B: obsidian control metrics within noise; gates 5,400 unit + 86 integration rc=0, `src/` diff outside the three files empty; verdict + numbers in commit `345e055`
- **File**: [049-classify-sort-single-pass.md](049-classify-sort-single-pass.md)

### Plan 050

- **Title**: Dashboard aggregation — Step-1 evidence picks the branch (single-entry cache → `groupBy`-keyed map, else shared preprocessing); honest negative-finding closure if gain <10%
- **Meta**: priority P3 · effort S–M · depends 046 (labels); run last for attribution
- **Record**: CLOSED AS FINDING (2026-10-17) — Step-1 evidence declined D1 **before any edit**: `CacheEntry` hits only on identical tasks-array identity, production passes a fresh `filterArchivedTasks(...)` array on every call (temp probe: `freshArraySameParamsHit=false`) and the bench builds a fresh aggregator per iteration — a keyed-cache widening is provably measurement-flat everywhere measurable; per plan STOP, D2 never attempted; zero diff, no commit. Real finding recorded: the dashboard cache is dead code in production (every debounced refresh re-aggregates every card through the shared aggregator); follow-up direction = stable array refs and/or per-refresh shared preprocessing — cited line numbers + probe semantics in plan `## Results`
- **File**: [050-dashboard-aggregate-single-pass.md](050-dashboard-aggregate-single-pass.md)

### Plan 051

- **Title**: Perf guards — bundle-size budget record + quiet ceiling test, in-page `longtask` (>50ms) observer on rescan/view-mode/search sections; report-only, observation not optimization
- **Meta**: priority P3 · effort S · depends 046 (seams + labels)
- **Record**: DONE (branch `perf/051-perf-guards`, 2026-10-17) — **KEEP** both guards: (a) in-page `PerformanceObserver({type:'longtask'})` wraps rescan / view-modes / search-input windows, reporting additive `longTasks {count,maxMs,totalMs}` (unit-tested Node-side summary, README'd) — smoke-proven with six forced 80ms timer tasks (**count 6, max exactly 80.0ms**; buffered probe shows the platform emits `longtask`; raw CDP-eval busy-loops do _not_ cross the task boundary — methodological note for future smokes); size-m counts **0/0 stable across ×2 runs**; all six control medians inside run-to-run noise vs the observer-less control (dialog section had no observer attached at all), keep-or-revert arithmetic in plan Results; (b) adopted quiet ceiling test `gzip(main.js) < 175KB` over a 143,784-byte baseline (red-proofed at a temporarily lowered ceiling); (c) first-ever Obsidian-tier `l` run recorded **0 long tasks in every observed window even with the full 10k-task scan + chunked render running concurrently** (yield/chunk design validated in situ), with the caveat that sections 1–3 raced the harness's fixed 2s settle (pre-existing harness×fixture-scale behaviour — scanner in-progress guard `vault-scanner.ts:118`) → seed: wait-for-scan harness plan 052; gates: jest 5,406 / lint / format / integration 86 all rc=0, `src/` diff empty; commit `58216b9`
- **File**: [051-perf-guards-bundle-longtasks.md](051-perf-guards-bundle-longtasks.md)

### Plan 052

- **Title**: Perf harness settle — wait for scan completion + task-state stability + list quiescence instead of a fixed sleep; debounce floor on the search mutation wait
- **Meta**: priority P3 · effort S · depends 051 (seed + labels)
- **Record**: DONE (branch `perf/052-harness-settle`, 2026-10-17) — **KEEP**. Two root causes found beyond the original hypothesis, both by temporary page probes (reverted): (1) scanner-idle does NOT mean settled — Obsidian registers seeded files in waves after the scanner reports idle, so the task-state count climbs (probe: 491→926 mid-run; true totals 2,276 at m / 9,026 at l; the old 2000ms sleep was accidentally covering this at m) → settle phase two waits for the count to hold still 750ms (`stateStablePage`); (2) the search mutation wait resolved on focus-driven `draggable` attribute flips ~9ms after each fill, long before the 250ms `SEARCH_REFRESH_DEBOUNCE_MS` → `waitForListMutation(page, minAgeMs)` now resolves only at-or-after the debounce floor. First wiring attempt failed its own control bands (view-modes 50ms, search 146ms) and was corrected, not shipped. Validation: m ×2 back inside established bands (view 81.6/83.5, search 1423.7/1432.7 debounce-shaped); **first trustworthy Obsidian `l` runs** — state settles at 9,026 tasks, rescan 77.5/77.6 (0.1% spread; was a 1.7ms no-op), view-modes 166.6/166.6, search 1506.7/1517.0 (≤0.7% ≪ 20% rule), longTasks 0/0/0 at both sizes ×2 runs under fully-settled state; 16 jsdom tests red-first; gates jest 5,422 / lint / format / integration 86 all rc=0, `src/` diff empty. Supersedes 051's caveat-laden `l` observation; consumes 051's seed.
- **File**: [052-perf-harness-settle.md](052-perf-harness-settle.md)

### Plan 053

- **Title**: Preserve unchanged dates and first-only warning removal during recurrence
- **Meta**: priority P1 · effort S–M · depends on —; before 065
- **Record**: DONE (2026-11-11) — recurrence forwards `undefined` as unchanged, so completing a task keeps its non-repeating date and removes a first-only `--Nd` from the written line. Unit 171 suites / 5,512 tests, build, lint and the recurrence integration spec (3/3) green.
- **File**: [053-recurrence-persistence.md](053-recurrence-persistence.md)

### Plan 054

- **Title**: Preserve supported metadata when extracting and moving task blocks
- **Meta**: priority P1 · effort M · depends on —; before 055
- **Record**: DONE (2026-11-11) — copy/move take the whole contiguous metadata block (SCHEDULED, DEADLINE, CLOSED, STARTED, DESCRIPTION) while migration still removes only the dates it moves. Unit suite, build and lint green.
- **File**: [054-task-block-metadata.md](054-task-block-metadata.md)

### Plan 056

- **Title**: Preserve current task state across per-file and full-scan publication
- **Meta**: priority P1 · effort M–L · depends on —
- **Record**: DONE (2026-11-11) — incremental/rename publications merge onto state read after their awaits, heading-only edits publish, renamed archived tasks stay excluded, and an active full scan reconciles journaled paths before both publication points. Unit 172 suites / 5,527 tests, build, lint and the external-change integration spec (3/3) green.
- **File**: [056-scanner-state-consistency.md](056-scanner-state-consistency.md)

### Plan 057

- **Title**: Refresh supported Org and code tasks after file events and extension changes
- **Meta**: priority P2 · effort M · depends on 056
- **Record**: DONE (2026-11-11) — live events use the scanner's eligibility rules, so enabled Org/code formats refresh while attachments stay ignored; renames clean the old path even when the destination is unsupported. Unit 172 suites / 5,531 tests, build, lint and the external-change spec (3/3) green.
- **File**: [057-configured-file-events.md](057-configured-file-events.md)

### Plan 060

- **Title**: Honor the daily-note availability boolean consistently across commands and transfers
- **Meta**: priority P2 · effort S · depends on —
- **Record**: DONE (2026-11-11) — both wrappers use the live boolean, the core-plugins.json read and stale cache are gone, and disabled providers never reach note creation. Unit 172 suites / 5,531 tests, build and lint green.
- **File**: [060-daily-note-availability.md](060-daily-note-availability.md)

### Plan 062

- **Title**: Recognize configured task keywords when inserting dates in the editor
- **Meta**: priority P2 · effort S · depends on —
- **Record**: DONE (2026-11-11) — date insertion uses the live KeywordManager and the shared task-line grammar; all configured states are recognised, prose is not, and manager replacement applies immediately. Unit 172 suites / 5,531 tests, build and lint green.
- **File**: [062-date-autocomplete-keywords.md](062-date-autocomplete-keywords.md)

### Plan 067

- **Title**: Preserve default search over normalized task text
- **Meta**: priority P2 · effort S · depends on —
- **Record**: DONE (2026-11-11) — default search indexes the normalized task text alongside the raw line, so phrases spanning a priority or footnote marker match again while raw words stay searchable. Unit 173 suites / 5,537 tests, build and lint green.
- **File**: [067-normalized-task-search.md](067-normalized-task-search.md)

### Plan 072

- **Title**: Preserve archive dialog keyboard traversal and focus in pop-out windows
- **Meta**: priority P2 · effort S · depends on —
- **Record**: DONE (2026-11-11) — the dialog reads its own document and compares element identity, so Tab/Shift+Tab only wrap at the boundaries in pop-out windows and closing restores the opener. 175 suites / 5,549 tests, build and lint green.
- **File**: [072-archive-window-focus.md](072-archive-window-focus.md)

### Plan 073

- **Title**: Keep relative date labels and status classes correct across DST
- **Meta**: priority P2 · effort S · depends on —
- **Record**: DONE (2026-11-11) — one shared local calendar-day distance drives relative labels and row status classes, so 23/25-hour days no longer shift labels. Toronto, UTC and Tokyo runs green; 175 suites / 5,549 tests, build and lint green.
- **File**: [073-calendar-day-labels.md](073-calendar-day-labels.md)

### Plan 076

- **Title**: Apply block inclusion settings before collecting numeric footnote tasks
- **Meta**: priority P2 · effort S · depends on —
- **Record**: DONE (2026-11-11) — footnote extraction now runs after block transitions and the shared skip rule, so excluded code/comment/math content no longer yields tasks. 175 suites / 5,549 tests, build and lint green.
- **File**: [076-footnote-block-context.md](076-footnote-block-context.md)

### Plan 080

- **Title**: Characterize escaped table delimiters in Obsidian before a bounded cell-identity fix
- **Meta**: priority P2 · effort M · depends on —
- **Record**: DONE (2026-11-11) — gate opened: table cell parsing treats an escaped pipe as cell content, and cell writes now replace only the selected span, leaving the rest of the row byte-identical. 176 suites / 5,556 tests, build and lint green; host Playwright characterization not run.
- **File**: [080-escaped-table-pipes.md](080-escaped-table-pipes.md)

### Plan 055

- **Title**: Route cell-aware task transfers through TaskWriter without overwriting edits
- **Meta**: priority P1 · effort L · depends on 054, 080
- **Record**: DONE (2026-11-11) — copy, move and migrate go through one TaskWriter seam with atomic destination appends, source revalidation and cell-local table moves; panel, embedded list and drag-and-drop report typed outcomes. 177 suites / 5,550 tests, build and lint green; no Playwright host spec.
- **File**: [055-safe-task-transfers.md](055-safe-task-transfers.md)

### Plan 058

- **Title**: Release embedded task lists and dashboards when their Markdown renders unload
- **Meta**: priority P2 · effort M · depends on —
- **Record**: DONE (2026-11-11) — each embedded list and dashboard is owned by its Markdown render, refreshes carry a per-instance generation, and debounce timers are cleaned up, so unloaded blocks never repaint. 178 suites / 5,558 tests, build and lint green; no Playwright mode-switch spec.
- **File**: [058-embedded-render-lifecycle.md](058-embedded-render-lifecycle.md)

### Plan 059

- **Title**: Refresh property-filtered task views after each completed property index batch
- **Meta**: priority P2 · effort M · depends on 058, 061, 069
- **Record**: DONE (2026-11-11) — a drained nonempty property batch publishes exactly one refresh to the panel, embedded lists and dashboards; empty and destroyed batches publish nothing and a throwing recipient cannot stop later batches. 179 suites / 5,564 tests, build and lint green; 069 and the host spec remain open.
- **File**: [059-property-view-invalidation.md](059-property-view-invalidation.md)

## Execution notes

These notes previously sat directly under the status table in `plans/README.md`.

- Integration-stability execution notes (2026-09-30, `3a686e8` + `21a8647` +
  `f3e1859`): the "PRE-EXISTING shared-session failures" reported against 020
  were root-caused after a manual full-suite run failed 6 tests that pass in
  isolation. Two independent shared-session poisons, both harness-side, no
  plugin defects: (1) dashboard drill-through bakes its composed query into
  the shared Task List leaf and the reset only restored files/settings —
  later tests inherited the stale filter (fixed: `resetVaultState` now resets
  every open Task List leaf via `resetUiStateToDefaults()`); (2) dashboard
  tests toggle the main leaf to reading mode and `openFileInEditor` used
  `leaf.openFile()`, which inherits the leaf's mode, so the next file opened
  with hidden source view (fixed: `setViewState` with explicit source mode).
  A workspace-level `resetWorkspaceState()` helper (close popouts first,
  detach stray main-area leaves via `getRoot()`, re-anchor one baseline
  source-mode leaf) plus its own pollution/idempotency specs pin the
  "known workspace, not just known vault" guarantee; two hardening commits
  also landed on the way (guard test validating every shipped example/docs
  code block through the real parsers; the collapse-test DOM dump now fires
  only on failure). Full suite green 77/77 incl. the restart project.

- 014 execution notes (2026-09-25): (1) The keyword commit path writes
  `plugin.settings` directly from the debounced onChange (not via
  `setControlValue`), so the plan's Step-2 second branch applied: the guarded
  refresh is invoked from the debounce callback AFTER `recreateParser()` —
  that call is what refreshes `plugin.keywordManager`, so ordering matters.
  (2) Cross-realm gotcha found twice: the settings window is a separate JS
  realm, so `instanceof HTMLInputElement` is false for its elements — both
  the implementation (identity match via `keywordFieldBindings`) and the
  integration test (identity/value assertions, not instanceof) avoid it.
  (3) Whole-tab `update()` proved non-destructive WITH the focus/caret/scroll
  guard — no STOP condition hit. (4) The 500ms keyword debounce means the
  refresh lands ~0.5s after typing stops; scroll position is preserved.

- 013 execution notes (2026-09-25, commit after `ee9f4a2`): plan deviations
  (all verified, none STOP-worthy). (1) `scan-completed` fires ONLY from
  `scanVault()` (vault-scanner.ts line 184) — incremental paths
  (`processIncrementalChange`/`processFileDelete`/`processFileRename`) emit
  `tasks-changed` only — so the plan's full-scan gating concern is moot; the
  opt-in gate is the only guard needed. (2) The plan's spec filename
  `auto-archive.spec.ts` was wrong for this repo: the Playwright config's
  `obsidian` project matches `*.test.ts` → `tests/integration/auto-archive.test.ts`.
  (3) `noticeEl` is deprecated in current obsidian.d.ts → the Undo button uses
  `notice.messageEl` (1.8.7+). (4) The plan's Step-2 sketch inlined the run in
  the listener; implemented as `PluginLifecycleManager.runAutoArchiveIfEnabled()`
  (private, called inside the listener's existing setTimeout) for symmetry with
  `performArchiveUndo()`; `shouldAutoArchive` lives in archive-service.ts per
  the plan's preference, with 4 gating unit tests + the `isRunning` round-trip
  already pinned by plan 011's suite. (5) Test-found product nuance: with the
  opt-in ON, a rescan is enough to trigger the run (not just startup) — that is
  the plan's stated intent ("every time the vault is scanned (including at
  startup)", settings copy) and is pinned by spec 3. (6) Harness finding:
  `resetVaultState` restores baseline data.json + loadSettings, but a late
  auto-run from a previous test's still-enabled in-memory settings could fire
  during the next test's setup rescan → the suite forces `autoArchiveEnabled:
false` in beforeEach before seeding (test-isolation concern only, no plugin
  change). Integration: 6 specs (manual run, undo via command, auto-run +
  notice + Undo button, date-mode exclusion, no-op silence, default-off
  silence). Suite green 4753/4753, integration 50/50.

- 011/012 bugfix (2026-09-25, third live-test feedback round): two manual-testing
  bugs traced to a shared root — the post-run `plugin.scanVault()` in the dialog
  apply path and `performArchiveUndo` read files via `vault.cachedRead`, which
  LAGS the editor buffer until Obsidian's autosave flushes source-mode writes
  (TaskWriter writes the active file through `editor.replaceRange`). The stale
  rescan (a) resurrected pre-archive DONE tasks into TaskStateManager (views
  kept showing DONE after ARCHIVED), and (b) after undo, re-read pre-undo
  ARCHIVED lines that the scanner filters out — so the restored task never
  returned to the manager and the dialog offered no candidates. Fixes: removed
  both post-run rescans (the coordinator already maintains the manager);
  `performArchiveUndo` reads lines via new `plugin.readLiveLine()` (editor
  buffer first, vault fallback); `optimisticUpdate` and `finalizeTaskState` now
  re-add tasks absent from the manager (archived→non-archived undo path — the
  task was removed at archive time); `ArchiveMatch`/`ArchiveCandidate` carry
  `tableCell` and `getTask(path, line, cellIndex)` resolves the right cell when
  sibling cells share path:line; the coordinator re-adds journaled table tasks
  with cell identity intact. New regression coverage: 9 unit tests (re-add,
  cellIndex threading, undo-completed) + permanent integration spec
  `tests/integration/archive-refresh.test.ts` (3 specs incl. the table undo
  regression). Suite green 4749/4749, integration 44/44, lint 0 errors (also
  cleaned the pre-existing unused imports the archive files carried).

## Dependency notes (completed plans)

Bullets from `plans/README.md` → Dependency notes that involve only completed plans; routing notes for pending plans remain there.

- 017 / 018 / 019 (2026-09-29, branch audit at commit `089c10b`): review of
  the Auto-Archive feature as implemented on `development/autoarchive`
  (plans 011–016). Scope was the branch diff vs `main` plus a rendered
  visual/a11y audit of the dialog (real Obsidian 1.13.7 via the integration
  harness: desktop/mobile/light/dark captures + CDP DOM probe; 8 screenshots
  and the probe JSON in `/tmp/todoseq-audit/`, not committed). Verification
  at audit time: build + lint clean, unit suite 4768/4768 green. Execute in
  order 017 → 018 → 019 — all three touch
  `src/view/components/archive-dialog.ts`, so sequential landing avoids
  trivial conflicts; logically each is independent. 019's mobile fix is
  verified via forced `.is-mobile/.is-phone` body classes on desktop
  Electron — the plan records the caveat that one real-device check is owed
  before the next mobile-facing release.
- 016 (Auto-Archive docs) documents the feature shipped by plans 011–015 on
  branch `advisor/011-archive-service-core`. Its git workflow branches FROM
  that feature branch so the docs and feature ship together; if 011 merges
  first, rebase onto `main` instead. Executing 016 against a `main` that
  lacks the feature would document unreleased behavior — that is the plan's
  first STOP condition.
- 016 is docs-only (no product code) and safe to execute in parallel with
  any non-docs plan, subject to the base-branch note above.
- 002 and 003 are independent and can be executed in parallel or either first.
- 002 (revised 2026-09-03 for commit `af59511`) follows Obsidian's own UI language via
  `localStorage.getItem('language')`; it adds NO plugin language setting and
  NO settings migration. It therefore does not touch `settings-types.ts` or
  `settings-migration.ts`, removing all structural overlap with 003's
  migration (003 keeps version 6 on its own). Reconciliation folded in the
  two strings 003 added to `settings.ts` (`sortByStarted: 'Started date'`,
  the "Track started date" toggle) and inlined the FEI352 fork's zh
  translation baseline into Step 3.
- 003 now includes search (`started:`) and sort (`sortByStarted`) and inline
  editor/reader styling, per the maintainer's design decisions on 2026-09-02.
  Task-list-item display of STARTED and urgency influence are explicitly
  deferred.
- 005 / 006 / 007 (docs + README visual system, 2026-09-13, revised with impeccable + improve): three self-contained handoff plans for PR #79 landing-page quality. **005** = Persuade-mode home rebuild (left-aligned hero, CTA hierarchy, animated `todoseq-task-entry.gif`, shared `--ts-*` tokens in `docs/.vitepress/theme/custom.css`). **006** = Read-mode chrome on guide pages (depends on 005 tokens; no prose rewrites). **007** = concise GitHub README (parallel to 005; must echo 005 tagline/install URL if 005 is already merged; keep a hero image — prefer `docs/assets/todoseq-task-entry.gif`). Shared visual system is inlined in each plan so executors need no cross-conversation context. Content rewrites of guide pages are out of scope. Optional follow-ups (not blocking): `impeccable init` / `document` for PRODUCT.md + DESIGN.md; re-record retina hero media.
- 008 (2026-09-21, audit at commit `8639cec`): root cause is asymmetric gating in
  `TaskWriter.applyLineUpdate` — CLOSED insertion respects `trackClosedDate` but
  removal is gated only on completed status, so archiving (or any un-complete)
  with the setting off deletes the user's CLOSED line. The maintainer clarified
  the full transition matrix: completed→completed/archived keeps CLOSED
  (timestamp write-once), completed→active/inactive/waiting removes it
  (regardless of setting), archived never adds, non-completed→non-completed
  never touches. Table-cell removal semantics and recurrence CLOSED reset are
  explicitly out of scope (documented in the plan's maintenance notes).
  **Revised during 009 recon (same day)**: the "cell parser can't read
  CLOSED" rationale was stale — `TaskParser.parseTasksFromTableCells`
  (`task-parser.ts:1290-1393`) _does_ populate `task.closedDate` from
  `<br>CLOSED:` segments. The preserve rule was implementable all along;
  the table-cell path is now covered by plan 009. Recurrence CLOSED reset
  remains a separate undecided concern.
- 009 (2026-09-21, at commit `39a829d`): depends on 008's
  `resolveClosedDateAction` helper. Cell-path deviations pinned: DONE→CANCELED
  overwrites the original cell timestamp; TODO→LATER strips the CLOSED tag
  regardless of state history or setting. Un-complete (DONE→TODO) and fresh
  completion behave correctly today and are pinned by regression-guard tests
  in the plan.
- 011 / 012 / 013 (2026-09-24, at commit `14f28b0`): the Auto-Archive
  feature (confirmed design brief: criteria mode switch with date mode
  manual-only, per-completed-state → archived-state mapping rows validated
  via KeywordManager, no-CLOSED-date tasks always excluded, session-only
  undo journal, opt-in startup auto-run defaulting OFF with silent-except-
  -notice behavior). Execute strictly in order: 011 (service + settings
  types, no UI) → 012 (dialog, settings section, commands; may continue on
  011's branch) → 013 (scan-completed auto-run + integration specs). 013
  must not start before 012's commands exist (its specs exercise the
  dialog and undo command). Key API surface fixed by 011 and consumed by
  012/013: `ArchiveService.evaluateArchiveCriteria/applyArchives/undoLastRun/hasUndoableRun`,
  `settings.taskArchive` (`TaskArchiveSettings`),
  `TaskUpdateCoordinator.updateTaskState(task, target, 'task-list')` as the
  apply dependency. All three plans write against `main`'s literal-string
  convention — the i18n engine lives on the unmerged
  `advisor/004-translate-view-components` branch and must NOT be imported. **011 API deviation (2026-09-24, post-implementation review)**:
  `evaluateArchiveCriteria` takes `ArchiveCandidate[]` — `{ state,
closedDate }` plus `{ path, line, rawText }` — and returns `ArchiveMatch`
  objects carrying that identity and the resolved `target`. The plan's
  sketch (`{ state, closedDate, target }` without identity) was not
  implementable: `applyArchives` verifies each match against fresh state
  via `getTask(path, line)` before writing, and the undo journal needs
  `rawTextBefore` from that identity. Consequence for 012/013: pass
  `taskStateManager.getTasks()` tasks directly to the evaluator (they
  already satisfy `ArchiveCandidate`); no downstream code change needed.
  012/013 API-quote corrections are annotated in those files. Also landed
  ahead of 013's scope: `ArchiveService.isRunning()` (with tests), so 013
  Step 1 only adds the `shouldAutoArchive` gate.
- 014 (2026-09-24): written from maintainer live-test feedback — settings
  mapping rows don't refresh when custom task keywords are edited while the
  settings tab is open (dialog is confirmed working; it re-derives rows on
  every open). Root cause pinned in the plan: `buildAutoArchiveGroup()`
  derives rows eagerly at construction from `KeywordManager`, and nothing
  re-renders the archive group on keyword changes. Originally a placeholder
  pending design decisions; the maintainer resolved all three on the same
  day: (1) whole-tab `update()` with an explicit focus/caret/scroll
  restoration guard — no DOM surgery; (2) render-time row derivation via an
  extracted `buildArchiveMappingItems()` helper, executed together with (1);
  (3) rows stay flat, no subheading (avoids reintroducing the
  description-only-item pattern removed in `fc3bc51`). The executor must
  read "Resolved design decisions" and not re-derive them. Step 3's
  integration spec doubles as the settings coverage plan 013 defers.
- 012 execution notes (2026-09-24): the dialog takes a structural plugin
  facade (not `TodoTracker` directly) so the view layer stays decoupled
  from nullable plugin properties; the lifecycle guards nullability and
  passes a fully-populated object. `openArchiveDialog()` is public on
  `PluginLifecycleManager` (command + settings button share it);
  `performArchiveUndo()` likewise (undo command; plan 013's notice will
  reuse it). The settings tab needed `SettingDefinitionGroup` +
  `SettingGroup.addSetting` for per-row mapping Settings — a single
  `Setting` cannot host N rows (plan 012 Step 5 anticipated this fork;
  the nested-key check resolved to custom render items). The settings
  structural test was updated 7→8 groups for the new heading. Detector
  over the changed UI files: two `border-left: 3px solid` warnings are
  the pre-existing DESIGN.md date-rail pattern (untouched), no new
  findings.
  **CDP smoke findings (2026-09-24, fixed in `407f74f`)**: (1) the dialog's
  apply button initialized disabled — inclusion now defaults to ALL matches
  with user exclusions persisting across preview refreshes; (2) undo
  corrupted the task line (`undefined- [x] DONE`): the service's minimal
  Task lacks the indent/listMarker/text fields `generateTaskLine` needs, so
  `performArchiveUndo`'s apply callback now re-parses the archived line via
  the file's `ParserRegistry` parser (`parseLine`) before reverting — the
  plan-011-review prediction was correct and the plan-012 annotation made
  it the primary path. Service `undoLastRun` contract unchanged (wiring
  concern only). Both validated by temporary integration specs (removed
  after the run; permanent specs land with plan 013). **Superseded by
  `e0b6ad6` (2026-09-24, second live failure report):** the re-parse path
  itself failed for table-cell tasks (`parseLine` cannot parse a table
  row) and the error aborted the whole undo. Final design: the journal
  carries the full Task snapshot (defensive copy with table identity),
  undo re-applies the snapshot with current rawText + archived state, no
  reconstruction exists anywhere, skips are typed
  (`line-missing/line-changed/unparseable/apply-failed`), and one failing
  apply no longer aborts the batch. Live-verified: table-cell archive →
  undo restores cell, text, and CLOSED date exactly.
  012's settings step verifies whether the declarative renderer supports
  nested keys before choosing custom `render` items; 013 gates auto-run to
  full scans after verifying which `scan-completed` emissions are
  incremental. CLOSED-line preservation on archive targets is guaranteed
  by plans 008/009's transition matrix — none of 011–013 may touch
  `task-writer.ts`.
- 020 (2026-09-29, written at `main@ae4ac8c`; target branch `development/dashboard`):
  approved design (mockups + spec inlined in the plan). Recon findings the
  executor must honor: (1) the i18n engine from 002 is **not on main** —
  commit `ae0f379` is not reachable from any branch and `main`'s tree has no
  i18n files, so 020 uses literal strings (same convention 011–019 used);
  002's DONE status refers to work not present on main. (2)
  `STATE_GROUP_MAP` (`search-evaluator.ts:14-20`) maps only
  active/inactive/waiting/completed — `state:archived` does not resolve, so
  020's state resolver adds an Archived group (only when settings define
  archived keywords) with an OR-of-keywords filter to keep
  `sum(counts) == total`. (3) Maintainer-resolved decisions recorded in the
  plan's "Resolved design decisions" section: separate `todoseq-dashboard`
  block language; "Later" bucket uses the no-grammar-change negation filter
  (Option B, `-scheduled:none -(…)`: ranges rejected on the 2026-09-29
  revisit; `src/search/**` frozen for this plan);
  plain click reuses the Task List leaf, Cmd/Ctrl-click new tab; tag
  overlap allowed with an explanatory tooltip on the total; boolean options
  accept `true|show` / `false|hide` (embedded-list convention, except
  `collapsed:` = `true|false` only). (4) The rejected Option A (grammar
  extension) was captured as plan 021 for future consideration — 020 does
  not depend on it; 021's Step 5 simplifies 020's `LATER_FILTER` if it
  executes after 020 lands.

- 020 execution notes (2026-09-29, commits `16c6dbd`→`0ce4b5b` on
  `development/dashboard`; executed by subagent, reviewed and approved by
  the advisor — all gates re-run independently): five documented
  deviations, all judged on merit and pinned by tests. (1) The plan's
  unquoted Later filter string fails in today's tokenizer (`… OR
scheduled:next 7 days` binds only `next` as the prefix value; `7`/`days`
  leak as bare terms), so the window filters use the quoted in-vocabulary
  form `scheduled:"next 7 days"` — pinned against the real evaluator.
  **Follow-up finding:** the bare Task-List query `scheduled:next 7 days`
  (unquoted) appears to match nothing today — a pre-existing product bug
  worth a small future plan (docs fix or tokenizer value-consumption fix).
  (2) The evaluator's next-7-days window INCLUDES today
  (`isDateInNextNDays`), contradicting the plan's mutual-exclusivity
  claim — the bucket filter excludes today via same-vocabulary negation
  (`scheduled:"next 7 days" -scheduled:today`), and a property test
  evaluates every bucket filter through the real evaluator against its
  assigned count. (3) `composeFilterQuery` additionally wraps
  OR-containing FILTERS (the archived-keywords filter would re-scope over
  the base); both guards pinned through the real evaluator. (4) Tooltips
  are single-line strings (`setTooltip` takes only string) with an em-dash
  before the open hint — trivial copy deviation from the plan's `·`-only
  note. (5) Processor subscription tests live in
  `tests/dashboard-renderer.test.ts` (the plan's scope list fixes exactly
  four unit test files); file delete/rename untracking is folded into the
  processor. Integration: the new `dashboard-cards` spec verifies the
  consistency guarantee end-to-end (click → composed query in the search
  input → identical count) and the background in-place patch through a
  live-preview card (Obsidian unloads background reading views; CM embed
  blocks stay alive). Full `npm run test:integration` is NOT green on this
  machine — 48/18/1 with the executor, 49/17/1 rebuilt at base `ae4ac8c` —
  a pre-existing shared-session degradation (failing files pass in
  isolation; advisor spot-checked `embedded-task-list` in isolation:
  green). Push/merge deliberately not done — the branch is the operator's.

These notes previously sat directly under the status table in `plans/README.md`.

- Integration-stability execution notes (2026-09-30, `3a686e8` + `21a8647` +
  `f3e1859`): the "PRE-EXISTING shared-session failures" reported against 020
  were root-caused after a manual full-suite run failed 6 tests that pass in
  isolation. Two independent shared-session poisons, both harness-side, no
  plugin defects: (1) dashboard drill-through bakes its composed query into
  the shared Task List leaf and the reset only restored files/settings —
  later tests inherited the stale filter (fixed: `resetVaultState` now resets
  every open Task List leaf via `resetUiStateToDefaults()`); (2) dashboard
  tests toggle the main leaf to reading mode and `openFileInEditor` used
  `leaf.openFile()`, which inherits the leaf's mode, so the next file opened
  with hidden source view (fixed: `setViewState` with explicit source mode).
  A workspace-level `resetWorkspaceState()` helper (close popouts first,
  detach stray main-area leaves via `getRoot()`, re-anchor one baseline
  source-mode leaf) plus its own pollution/idempotency specs pin the
  "known workspace, not just known vault" guarantee; two hardening commits
  also landed on the way (guard test validating every shipped example/docs
  code block through the real parsers; the collapse-test DOM dump now fires
  only on failure). Full suite green 77/77 incl. the restart project.

- 014 execution notes (2026-09-25): (1) The keyword commit path writes
  `plugin.settings` directly from the debounced onChange (not via
  `setControlValue`), so the plan's Step-2 second branch applied: the guarded
  refresh is invoked from the debounce callback AFTER `recreateParser()` —
  that call is what refreshes `plugin.keywordManager`, so ordering matters.
  (2) Cross-realm gotcha found twice: the settings window is a separate JS
  realm, so `instanceof HTMLInputElement` is false for its elements — both
  the implementation (identity match via `keywordFieldBindings`) and the
  integration test (identity/value assertions, not instanceof) avoid it.
  (3) Whole-tab `update()` proved non-destructive WITH the focus/caret/scroll
  guard — no STOP condition hit. (4) The 500ms keyword debounce means the
  refresh lands ~0.5s after typing stops; scroll position is preserved.

- 013 execution notes (2026-09-25, commit after `ee9f4a2`): plan deviations
  (all verified, none STOP-worthy). (1) `scan-completed` fires ONLY from
  `scanVault()` (vault-scanner.ts line 184) — incremental paths
  (`processIncrementalChange`/`processFileDelete`/`processFileRename`) emit
  `tasks-changed` only — so the plan's full-scan gating concern is moot; the
  opt-in gate is the only guard needed. (2) The plan's spec filename
  `auto-archive.spec.ts` was wrong for this repo: the Playwright config's
  `obsidian` project matches `*.test.ts` → `tests/integration/auto-archive.test.ts`.
  (3) `noticeEl` is deprecated in current obsidian.d.ts → the Undo button uses
  `notice.messageEl` (1.8.7+). (4) The plan's Step-2 sketch inlined the run in
  the listener; implemented as `PluginLifecycleManager.runAutoArchiveIfEnabled()`
  (private, called inside the listener's existing setTimeout) for symmetry with
  `performArchiveUndo()`; `shouldAutoArchive` lives in archive-service.ts per
  the plan's preference, with 4 gating unit tests + the `isRunning` round-trip
  already pinned by plan 011's suite. (5) Test-found product nuance: with the
  opt-in ON, a rescan is enough to trigger the run (not just startup) — that is
  the plan's stated intent ("every time the vault is scanned (including at
  startup)", settings copy) and is pinned by spec 3. (6) Harness finding:
  `resetVaultState` restores baseline data.json + loadSettings, but a late
  auto-run from a previous test's still-enabled in-memory settings could fire
  during the next test's setup rescan → the suite forces `autoArchiveEnabled:
false` in beforeEach before seeding (test-isolation concern only, no plugin
  change). Integration: 6 specs (manual run, undo via command, auto-run +
  notice + Undo button, date-mode exclusion, no-op silence, default-off
  silence). Suite green 4753/4753, integration 50/50.

- 011/012 bugfix (2026-09-25, third live-test feedback round): two manual-testing
  bugs traced to a shared root — the post-run `plugin.scanVault()` in the dialog
  apply path and `performArchiveUndo` read files via `vault.cachedRead`, which
  LAGS the editor buffer until Obsidian's autosave flushes source-mode writes
  (TaskWriter writes the active file through `editor.replaceRange`). The stale
  rescan (a) resurrected pre-archive DONE tasks into TaskStateManager (views
  kept showing DONE after ARCHIVED), and (b) after undo, re-read pre-undo
  ARCHIVED lines that the scanner filters out — so the restored task never
  returned to the manager and the dialog offered no candidates. Fixes: removed
  both post-run rescans (the coordinator already maintains the manager);
  `performArchiveUndo` reads lines via new `plugin.readLiveLine()` (editor
  buffer first, vault fallback); `optimisticUpdate` and `finalizeTaskState` now
  re-add tasks absent from the manager (archived→non-archived undo path — the
  task was removed at archive time); `ArchiveMatch`/`ArchiveCandidate` carry
  `tableCell` and `getTask(path, line, cellIndex)` resolves the right cell when
  sibling cells share path:line; the coordinator re-adds journaled table tasks
  with cell identity intact. New regression coverage: 9 unit tests (re-add,
  cellIndex threading, undo-completed) + permanent integration spec
  `tests/integration/archive-refresh.test.ts` (3 specs incl. the table undo
  regression). Suite green 4749/4749, integration 44/44, lint 0 errors (also
  cleaned the pre-existing unused imports the archive files carried).

## Dependency notes (completed plans)

Bullets from `plans/README.md` → Dependency notes that involve only completed plans; routing notes for pending plans remain there.

- 017 / 018 / 019 (2026-09-29, branch audit at commit `089c10b`): review of
  the Auto-Archive feature as implemented on `development/autoarchive`
  (plans 011–016). Scope was the branch diff vs `main` plus a rendered
  visual/a11y audit of the dialog (real Obsidian 1.13.7 via the integration
  harness: desktop/mobile/light/dark captures + CDP DOM probe; 8 screenshots
  and the probe JSON in `/tmp/todoseq-audit/`, not committed). Verification
  at audit time: build + lint clean, unit suite 4768/4768 green. Execute in
  order 017 → 018 → 019 — all three touch
  `src/view/components/archive-dialog.ts`, so sequential landing avoids
  trivial conflicts; logically each is independent. 019's mobile fix is
  verified via forced `.is-mobile/.is-phone` body classes on desktop
  Electron — the plan records the caveat that one real-device check is owed
  before the next mobile-facing release.
- 016 (Auto-Archive docs) documents the feature shipped by plans 011–015 on
  branch `advisor/011-archive-service-core`. Its git workflow branches FROM
  that feature branch so the docs and feature ship together; if 011 merges
  first, rebase onto `main` instead. Executing 016 against a `main` that
  lacks the feature would document unreleased behavior — that is the plan's
  first STOP condition.
- 016 is docs-only (no product code) and safe to execute in parallel with
  any non-docs plan, subject to the base-branch note above.
- 002 and 003 are independent and can be executed in parallel or either first.
- 002 (revised 2026-09-03 for commit `af59511`) follows Obsidian's own UI language via
  `localStorage.getItem('language')`; it adds NO plugin language setting and
  NO settings migration. It therefore does not touch `settings-types.ts` or
  `settings-migration.ts`, removing all structural overlap with 003's
  migration (003 keeps version 6 on its own). Reconciliation folded in the
  two strings 003 added to `settings.ts` (`sortByStarted: 'Started date'`,
  the "Track started date" toggle) and inlined the FEI352 fork's zh
  translation baseline into Step 3.
- 003 now includes search (`started:`) and sort (`sortByStarted`) and inline
  editor/reader styling, per the maintainer's design decisions on 2026-09-02.
  Task-list-item display of STARTED and urgency influence are explicitly
  deferred.
- 005 / 006 / 007 (docs + README visual system, 2026-09-13, revised with impeccable + improve): three self-contained handoff plans for PR #79 landing-page quality. **005** = Persuade-mode home rebuild (left-aligned hero, CTA hierarchy, animated `todoseq-task-entry.gif`, shared `--ts-*` tokens in `docs/.vitepress/theme/custom.css`). **006** = Read-mode chrome on guide pages (depends on 005 tokens; no prose rewrites). **007** = concise GitHub README (parallel to 005; must echo 005 tagline/install URL if 005 is already merged; keep a hero image — prefer `docs/assets/todoseq-task-entry.gif`). Shared visual system is inlined in each plan so executors need no cross-conversation context. Content rewrites of guide pages are out of scope. Optional follow-ups (not blocking): `impeccable init` / `document` for PRODUCT.md + DESIGN.md; re-record retina hero media.
- 008 (2026-09-21, audit at commit `8639cec`): root cause is asymmetric gating in
  `TaskWriter.applyLineUpdate` — CLOSED insertion respects `trackClosedDate` but
  removal is gated only on completed status, so archiving (or any un-complete)
  with the setting off deletes the user's CLOSED line. The maintainer clarified
  the full transition matrix: completed→completed/archived keeps CLOSED
  (timestamp write-once), completed→active/inactive/waiting removes it
  (regardless of setting), archived never adds, non-completed→non-completed
  never touches. Table-cell removal semantics and recurrence CLOSED reset are
  explicitly out of scope (documented in the plan's maintenance notes).
  **Revised during 009 recon (same day)**: the "cell parser can't read
  CLOSED" rationale was stale — `TaskParser.parseTasksFromTableCells`
  (`task-parser.ts:1290-1393`) _does_ populate `task.closedDate` from
  `<br>CLOSED:` segments. The preserve rule was implementable all along;
  the table-cell path is now covered by plan 009. Recurrence CLOSED reset
  remains a separate undecided concern.
- 009 (2026-09-21, at commit `39a829d`): depends on 008's
  `resolveClosedDateAction` helper. Cell-path deviations pinned: DONE→CANCELED
  overwrites the original cell timestamp; TODO→LATER strips the CLOSED tag
  regardless of state history or setting. Un-complete (DONE→TODO) and fresh
  completion behave correctly today and are pinned by regression-guard tests
  in the plan.
- 011 / 012 / 013 (2026-09-24, at commit `14f28b0`): the Auto-Archive
  feature (confirmed design brief: criteria mode switch with date mode
  manual-only, per-completed-state → archived-state mapping rows validated
  via KeywordManager, no-CLOSED-date tasks always excluded, session-only
  undo journal, opt-in startup auto-run defaulting OFF with silent-except-
  -notice behavior). Execute strictly in order: 011 (service + settings
  types, no UI) → 012 (dialog, settings section, commands; may continue on
  011's branch) → 013 (scan-completed auto-run + integration specs). 013
  must not start before 012's commands exist (its specs exercise the
  dialog and undo command). Key API surface fixed by 011 and consumed by
  012/013: `ArchiveService.evaluateArchiveCriteria/applyArchives/undoLastRun/hasUndoableRun`,
  `settings.taskArchive` (`TaskArchiveSettings`),
  `TaskUpdateCoordinator.updateTaskState(task, target, 'task-list')` as the
  apply dependency. All three plans write against `main`'s literal-string
  convention — the i18n engine lives on the unmerged
  `advisor/004-translate-view-components` branch and must NOT be imported. **011 API deviation (2026-09-24, post-implementation review)**:
  `evaluateArchiveCriteria` takes `ArchiveCandidate[]` — `{ state,
closedDate }` plus `{ path, line, rawText }` — and returns `ArchiveMatch`
  objects carrying that identity and the resolved `target`. The plan's
  sketch (`{ state, closedDate, target }` without identity) was not
  implementable: `applyArchives` verifies each match against fresh state
  via `getTask(path, line)` before writing, and the undo journal needs
  `rawTextBefore` from that identity. Consequence for 012/013: pass
  `taskStateManager.getTasks()` tasks directly to the evaluator (they
  already satisfy `ArchiveCandidate`); no downstream code change needed.
  012/013 API-quote corrections are annotated in those files. Also landed
  ahead of 013's scope: `ArchiveService.isRunning()` (with tests), so 013
  Step 1 only adds the `shouldAutoArchive` gate.
- 014 (2026-09-24): written from maintainer live-test feedback — settings
  mapping rows don't refresh when custom task keywords are edited while the
  settings tab is open (dialog is confirmed working; it re-derives rows on
  every open). Root cause pinned in the plan: `buildAutoArchiveGroup()`
  derives rows eagerly at construction from `KeywordManager`, and nothing
  re-renders the archive group on keyword changes. Originally a placeholder
  pending design decisions; the maintainer resolved all three on the same
  day: (1) whole-tab `update()` with an explicit focus/caret/scroll
  restoration guard — no DOM surgery; (2) render-time row derivation via an
  extracted `buildArchiveMappingItems()` helper, executed together with (1);
  (3) rows stay flat, no subheading (avoids reintroducing the
  description-only-item pattern removed in `fc3bc51`). The executor must
  read "Resolved design decisions" and not re-derive them. Step 3's
  integration spec doubles as the settings coverage plan 013 defers.
- 012 execution notes (2026-09-24): the dialog takes a structural plugin
  facade (not `TodoTracker` directly) so the view layer stays decoupled
  from nullable plugin properties; the lifecycle guards nullability and
  passes a fully-populated object. `openArchiveDialog()` is public on
  `PluginLifecycleManager` (command + settings button share it);
  `performArchiveUndo()` likewise (undo command; plan 013's notice will
  reuse it). The settings tab needed `SettingDefinitionGroup` +
  `SettingGroup.addSetting` for per-row mapping Settings — a single
  `Setting` cannot host N rows (plan 012 Step 5 anticipated this fork;
  the nested-key check resolved to custom render items). The settings
  structural test was updated 7→8 groups for the new heading. Detector
  over the changed UI files: two `border-left: 3px solid` warnings are
  the pre-existing DESIGN.md date-rail pattern (untouched), no new
  findings.
  **CDP smoke findings (2026-09-24, fixed in `407f74f`)**: (1) the dialog's
  apply button initialized disabled — inclusion now defaults to ALL matches
  with user exclusions persisting across preview refreshes; (2) undo
  corrupted the task line (`undefined- [x] DONE`): the service's minimal
  Task lacks the indent/listMarker/text fields `generateTaskLine` needs, so
  `performArchiveUndo`'s apply callback now re-parses the archived line via
  the file's `ParserRegistry` parser (`parseLine`) before reverting — the
  plan-011-review prediction was correct and the plan-012 annotation made
  it the primary path. Service `undoLastRun` contract unchanged (wiring
  concern only). Both validated by temporary integration specs (removed
  after the run; permanent specs land with plan 013). **Superseded by
  `e0b6ad6` (2026-09-24, second live failure report):** the re-parse path
  itself failed for table-cell tasks (`parseLine` cannot parse a table
  row) and the error aborted the whole undo. Final design: the journal
  carries the full Task snapshot (defensive copy with table identity),
  undo re-applies the snapshot with current rawText + archived state, no
  reconstruction exists anywhere, skips are typed
  (`line-missing/line-changed/unparseable/apply-failed`), and one failing
  apply no longer aborts the batch. Live-verified: table-cell archive →
  undo restores cell, text, and CLOSED date exactly.
  012's settings step verifies whether the declarative renderer supports
  nested keys before choosing custom `render` items; 013 gates auto-run to
  full scans after verifying which `scan-completed` emissions are
  incremental. CLOSED-line preservation on archive targets is guaranteed
  by plans 008/009's transition matrix — none of 011–013 may touch
  `task-writer.ts`.
- 020 (2026-09-29, written at `main@ae4ac8c`; target branch `development/dashboard`):
  approved design (mockups + spec inlined in the plan). Recon findings the
  executor must honor: (1) the i18n engine from 002 is **not on main** —
  commit `ae0f379` is not reachable from any branch and `main`'s tree has no
  i18n files, so 020 uses literal strings (same convention 011–019 used);
  002's DONE status refers to work not present on main. (2)
  `STATE_GROUP_MAP` (`search-evaluator.ts:14-20`) maps only
  active/inactive/waiting/completed — `state:archived` does not resolve, so
  020's state resolver adds an Archived group (only when settings define
  archived keywords) with an OR-of-keywords filter to keep
  `sum(counts) == total`. (3) Maintainer-resolved decisions recorded in the
  plan's "Resolved design decisions" section: separate `todoseq-dashboard`
  block language; "Later" bucket uses the no-grammar-change negation filter
  (Option B, `-scheduled:none -(…)`: ranges rejected on the 2026-09-29
  revisit; `src/search/**` frozen for this plan);
  plain click reuses the Task List leaf, Cmd/Ctrl-click new tab; tag
  overlap allowed with an explanatory tooltip on the total; boolean options
  accept `true|show` / `false|hide` (embedded-list convention, except
  `collapsed:` = `true|false` only). (4) The rejected Option A (grammar
  extension) was captured as plan 021 for future consideration — 020 does
  not depend on it; 021's Step 5 simplifies 020's `LATER_FILTER` if it
  executes after 020 lands.

- 020 execution notes (2026-09-29, commits `16c6dbd`→`0ce4b5b` on
  `development/dashboard`; executed by subagent, reviewed and approved by
  the advisor — all gates re-run independently): five documented
  deviations, all judged on merit and pinned by tests. (1) The plan's
  unquoted Later filter string fails in today's tokenizer (`… OR
scheduled:next 7 days` binds only `next` as the prefix value; `7`/`days`
  leak as bare terms), so the window filters use the quoted in-vocabulary
  form `scheduled:"next 7 days"` — pinned against the real evaluator.
  **Follow-up finding:** the bare Task-List query `scheduled:next 7 days`
  (unquoted) appears to match nothing today — a pre-existing product bug
  worth a small future plan (docs fix or tokenizer value-consumption fix).
  (2) The evaluator's next-7-days window INCLUDES today
  (`isDateInNextNDays`), contradicting the plan's mutual-exclusivity
  claim — the bucket filter excludes today via same-vocabulary negation
  (`scheduled:"next 7 days" -scheduled:today`), and a property test
  evaluates every bucket filter through the real evaluator against its
  assigned count. (3) `composeFilterQuery` additionally wraps
  OR-containing FILTERS (the archived-keywords filter would re-scope over
  the base); both guards pinned through the real evaluator. (4) Tooltips
  are single-line strings (`setTooltip` takes only string) with an em-dash
  before the open hint — trivial copy deviation from the plan's `·`-only
  note. (5) Processor subscription tests live in
  `tests/dashboard-renderer.test.ts` (the plan's scope list fixes exactly
  four unit test files); file delete/rename untracking is folded into the
  processor. Integration: the new `dashboard-cards` spec verifies the
  consistency guarantee end-to-end (click → composed query in the search
  input → identical count) and the background in-place patch through a
  live-preview card (Obsidian unloads background reading views; CM embed
  blocks stay alive). Full `npm run test:integration` is NOT green on this
  machine — 48/18/1 with the executor, 49/17/1 rebuilt at base `ae4ac8c` —
  a pre-existing shared-session degradation (failing files pass in
  isolation; advisor spot-checked `embedded-task-list` in isolation:
  green). Push/merge deliberately not done — the branch is the operator's.
