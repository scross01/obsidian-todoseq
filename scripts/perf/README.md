# TODOseq performance profiling

A repeatable, **report-only** profiling framework with two tiers. Numbers
are signals for humans — there are no thresholds and no CI gate (same
philosophy as the docs screenshot staleness check: a signal that fires
when nothing is wrong trains people to ignore it).

Both tiers seed their content from the same deterministic generator
(`generate-fixture.ts`: fixed seed `1337`, fixed local date, so the same
`size` always produces byte-identical files on any machine). Code-comment
fixtures use `.ts` like real plugin content — but the harness must never
**open** a raw source fixture (the plugin only scans them): OS file
associations would hand an opened `.ts` to a media player (e.g. IINA,
"Cannot open file or stream") and other extensions to other apps.

## Tier 1 — node benchmarks (`npm run perf:node`)

Times the pure-logic hot paths over the generated vault, in-process, with
the real parser/keyword stack (only the `obsidian` module is mapped, like
the unit suite). Warmup + 15 iterations; reports median/p95/min.

```bash
npm run perf:node                      # size m: 2,500 tasks / 500 files
PERF_SIZE=l npm run perf:node          # size l: 10,000 tasks / 2,000 files
PERF_SIZE=s npm run perf:node          # size s: 250 tasks / 50 files
PERF_ITERATIONS=30 npm run perf:node   # more samples
```

Scenarios (`scripts/perf/scenarios.ts`):

| scenario                     | what it drives                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `parse-file`                 | full-vault parse through TaskParser / OrgModeTaskParser / CodeCommentTaskParser                          |
| `classify-sort`              | `sortTasksWithThreeBlockSystem` for all 3 view modes × 4 future settings (every Task List refresh)       |
| `search`                     | tokenize + parse + evaluate 6 realistic queries over the full task set (per-keystroke path)              |
| `dashboard-aggregate`        | `DashboardAggregator.aggregate` for all 6 group-by dimensions                                            |
| `natural-date`               | `NaturalDateParser.parse` over a keystroke-sized corpus (smart-date path)                                |
| `date-format`                | 6k `formatDateForDisplay`/`formatDateTooltip` calls over mixed relative/absolute spans (render hot path) |
| `regex-cache` / `regex-cold` | warm cache gets vs fresh compiles — the value RegexCache provides                                        |

Artifact: `output/perf/node-<size>.json` (local-only, untracked) with the
git SHA, node version, platform, and every scenario's numbers.

## Tier 2 — in-Obsidian profiling (`npm run perf:obsidian`)

Drives a real Obsidian instance (Electron, real vault I/O, real DOM)
through the existing Playwright/CDP harness. The fixture vault is seeded
into the ephemeral test vault from the same generator, then:

1. full vault rescan (`todoseq:rescan-vault`)
2. 12 task-list view-mode switches (the real dropdown path: set + refresh)
3. search input latency — `fill` → the visible list first mutates (the
   debounced refresh reaching the DOM; the INP-analog. Debounce dwell is
   included because users wait through it too — pure query cost is
   answered by the node tier's `search` scenario, not here)
4. dashboard code block open + render on the fixture vault
5. editor insert + delete cycle (smart-date + decorations)
6. archive dialog open — command dispatch → modal visible; the close and
   its 150ms cooldown run _outside_ the timer (`afterEach`)

**Timer rule**: a fixed `waitForTimeout` may never sit inside a timed
region. Cool-downs belong in `measureScenario`'s untimed `afterEach`;
condition waits (`waitFor`, mutation observers) are allowed inside because
they measure real settle time — every section's contract is commented
in-code.

```bash
npm run perf:obsidian                        # medians + heap brackets
PERF_PROFILE=1 npm run perf:obsidian         # + .cpuprofile for view-modes (default)
PERF_PROFILE=obsidian-archive-dialog-open npm run perf:obsidian   # one other scenario
PERF_SIZE=l PERF_ITERATIONS=10 npm run perf:obsidian

npx ts-node scripts/perf/analyze-profile.ts output/perf/<label>.cpuprofile 20 \
  --bundle <path-to-main.js>                 # top-20 self-time table + slices
```

Requires an Obsidian binary (default `/Applications/Obsidian.app`, or set
`OBSIDIAN_PATH` / `OBSIDIAN_COMMAND` per AGENTS.md). The spec is gated on
`PERF=1`, so the regular integration suite never pays for it.

Artifacts: `output/perf/obsidian-metrics.json`, plus optional
`output/perf/obsidian-view-mode-switches.cpuprofile`.

## Reading the results

### Metric semantics — what the timer includes

| metric label                    | timed region                                         | tier that answers "how fast is the algorithm?"      |
| ------------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| `obsidian-rescan`               | awaited `scanVault()`                                | node `parse-file`                                   |
| `obsidian-view-mode-switches`   | 12 × `setViewMode` + awaited refresh                 | node `classify-sort`                                |
| `obsidian-search-input-latency` | `fill` → list DOM mutation (debounce dwell included) | node `search`                                       |
| `obsidian-dashboard-render`     | two `openFile` → card visible (condition)            | node `dashboard-aggregate`                          |
| `obsidian-editor-edit-cycle`    | two `replaceRange` calls                             | — (smart-date path, node `natural-date` is related) |
| `obsidian-archive-dialog-open`  | dispatch → modal visible (condition)                 | —                                                   |

**Label renames are contract changes, not speedups.** The retired
`obsidian-search-burst` mixed in five fixed 250ms sleeps (1250ms of its
~1395ms median); `obsidian-archive-dialog-open` kept its label but lost a
150ms in-timer sleep, so pre-2026-10-17 and post- numbers for it are not
comparable either. Historical JSONs keep their original labels — use this
mapping before comparing across runs.

### Long-task observation (`longTasks`, additive schema)

Three sections — `obsidian-rescan`, `obsidian-view-mode-switches`,
`obsidian-search-input-latency` — wrap their whole window (warmup +
timed loop) in an in-page `PerformanceObserver({type: 'longtask'})`, so
those entries in `obsidian-metrics.json` gain
`longTasks: {count, maxMs, totalMs}` (Chromium counts tasks >50ms by
spec; the collector returns raw entries, the summary is computed
Node-side and unit-tested in `tests/perf-longtask-observer.test.ts`).
Report-only — **no thresholds anywhere**: zero long tasks at size `m`
is the design expectation (scan yields + chunked render); anything at
size `l` is a recorded _input_ to a future evidence-led plan, not a
failure. Dashboard/editor/archive sections are deliberately not attached
(short sections — the observation would dominate their signal).

Related quiet guard: `tests/bundle-size.test.ts` asserts
`gzip(main.js) < 175KB` (~+24% headroom over the recorded baseline) so
bundle growth surfaces in review instead of silently; it skips when no
build artifact exists and CI builds before tests.

- **Stdout table first**: median is the headline; a p95 far above the
  median means GC or event-loop noise — rerun before trusting it.
- **Scale curve**: run size `m` and `l`. Near-linear growth is healthy;
  super-linear growth (10k tasks ≫ 4× the 2.5k numbers) points at an
  algorithmic problem, usually in classification, search, or aggregation.
- **`.cpuprofile` files** open in Chrome DevTools (Performance → Load
  profile) or at speedscope.app for a visual pass — or run
  `scripts/perf/analyze-profile.ts` for the reproducible text view:
  self-time per function with plugin-frame share, plus a source slice of
  the production bundle for minified frames (the step that identified
  `c L6:C1566` as a `toLocaleDateString` closure). Look for the hottest
  self-time frames and map them back to plugin sources; then confirm the
  finding with the node tier, which isolates the same code without the
  DOM.
- **Heap brackets** are coarse (no forced GC) — treat a climbing heap
  across scenarios as a hint, not a measurement.

## Extending

Add a scenario to `scripts/perf/scenarios.ts` (node tier) or a section in
`tests/integration/perf.test.ts` (Obsidian tier). The fixture generator
grows in `generate-fixture.ts`; its contract (determinism + parse-back
count) is pinned by `tests/perf-fixture.test.ts` — keep that green.
