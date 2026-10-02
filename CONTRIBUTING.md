# Contributing to TODOseq

## Development

**Requirements**: Node.js and npm

**Scripts**:

- `npm run dev` — Run esbuild bundler in watch mode for development
- `npm run build` — Type-check and build for production
- `npm run test` — Run unit tests (Jest)
- `npm run test:integration` — Run integration tests (Playwright + real Obsidian instance)
- `npm run test:integration:fast` — Run integration tests without rebuild
- `npm run lint` — Run ESLint to check code style
- `npm run format` — Format code using Prettier
- `npm run docs:dev` — Run dynamic docs site for development
- `npm run docs:build` — Run VitePress to build production docs
- `npm run docs:preview` — Preview static production docs
- `npm run docs:screenshots` — Recapture the docs screenshots (see below)

## Integration Tests

Integration tests launch a real isolated Obsidian instance via Electron, connect over CDP (Chrome DevTools Protocol), and run Playwright tests against the actual plugin.

```bash
npm run test:integration       # build + run all tests
npm run test:integration:fast  # run without rebuild
npx playwright test --config=tests/integration/playwright.config.ts -g "test name"  # single test
```

Key details:

- Obsidian is launched with `--user-data-dir` pointing at an ephemeral fixtures directory for full isolation.
- A single Obsidian instance is shared across all test files via CDP (port 9334 by default, overridable via `OBSIDIAN_CDP_PORT`; chosen to avoid collisions with other local apps).
- The `obsidian-restart` project tests settings persistence across a real process restart.
- **No keyboard shortcuts** — all Obsidian commands are invoked via `page.evaluate(() => app.commands.executeCommandById(...))` to avoid triggering unintended actions.
- DOM selectors are version-specific (e.g. Obsidian 1.12+ uses `.vertical-tab-nav-item`, not `.vertical-tab-list-item`).

See `AGENTS.md` for the full list of critical gotchas and live debugging via CDP.

## Docs Screenshots

Every image in `docs/` is a real screenshot of a real Obsidian window, captured by
`npm run docs:screenshots`. The pipeline lives in `scripts/screenshots/`: a
scenario per docs feature (an `obsidian-demo-recorder` script), a driver that
stages a throwaway vault, and `manifest.json` recording what produced each file.

**If you change anything a screenshot shows** — a plugin view, the task list, the
dashboard, the settings UI, the editor or reading-mode rendering, or a colour in
`styles.css` — you must recapture, or the docs will show the old UI.

### Prerequisites

```bash
npm run build                                  # stages main.js + styles.css
npm run docs:screenshots                       # capture everything
```

The driver needs:

- `obsidian-demo-recorder` on `PATH`, or `SCREENSHOT_RECORDER=/path/to/binary`.
- `ffmpeg` on `PATH` (only for the GIF scenario).
- A built plugin — the driver reads `main.js`, `styles.css` and `manifest.json`
  from the repo root and fails with a clear message if they are absent.

Each scenario launches Obsidian, so a full run takes several minutes. Scenarios
run sequentially and each gets a fresh vault.

### Commands

| Command                                              | Effect                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| `npm run docs:screenshots`                           | Capture every scenario, in both themes                                           |
| `npm run docs:screenshots -- --only=docs-dashboards` | Capture one scenario (comma-separate ids)                                        |
| `npm run docs:screenshots -- --dark-only`            | Skip the light twins (about half the time)                                       |
| `npm run docs:screenshots -- --check`                | Report staleness without capturing anything (exits non-zero if anything drifted) |
| `npm run docs:screenshots -- --explain`              | List the plugin sources each scenario hashes                                     |

Scenario ids are the keys of the `SCENARIOS` registry in
`scripts/screenshots/registry.ts`: `docs-editor`, `docs-task-list`,
`docs-embedded-reader`, `docs-search`, `docs-settings`, `docs-dashboards`,
`docs-auto-archive`, `docs-task-entry`.

### Checking what is stale

`--check` re-hashes every asset and prints one row per file. It needs no
`npm run build` — it reads plugin sources and the captured bytes, not the
bundle:

```bash
npm run docs:screenshots -- --check
```

| Status                                        | Meaning                                                             |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `FRESH`                                       | Bytes, scenario and plugin sources all match the manifest           |
| `STALE (scenario changed)`                    | The scenario script (or shared helpers) was edited                  |
| `STALE (plugin build changed)`                | A plugin source this scenario renders has changed since the capture |
| `STALE (output changed)`                      | The file in `docs/assets/` was edited outside the pipeline          |
| `MISSING (no manifest entry)`                 | An asset on disk that the pipeline never recorded                   |
| `ORPHAN (scenario no longer in the registry)` | Manifest points at a deleted scenario                               |
| `UNREFERENCED`                                | Asset exists but no docs page embeds it                             |

#### What "plugin build changed" actually hashes

Not `main.js`. The bundle is one minified file, so hashing it marked all 52
assets stale after _any_ source change — including parser fixes and
vault-scanner work that change no pixel. A check that cries wolf on every commit
is a check nobody reads, which defeats the only failure it exists to catch: a
screenshot quietly documenting a plugin that no longer looks like that.

Instead, `scripts/screenshots/plugin-surfaces.ts` declares which sources each
scenario can actually render:

- The task formatting/sort/urgency core is hashed for **every** scenario,
  because it decides what a rendered task says everywhere.
- `src/view/**` is the rendering layer, so each scenario claims the components
  it shows. A scenario may also name a non-view module it depends on — the
  task-entry GIF lists the smart-date processor, because the demo shows
  `tomorrow` being rewritten.
- Parsers, vault scanning, state management and the plugin lifecycle are
  excluded. They can change behaviour without changing a pixel.
- `styles.css` is sliced rather than taken whole — see below.

`styles.css` is the exception that proves the rule. It is one 100KB file with
no imports, so hashing it whole would put it back where `main.js` was: any
style change invalidating all 52 assets. Instead it is **split per scenario**.
`scripts/screenshots/css-slices.ts` parses it into leaf rules, and each rule is
attributed to the scenarios whose class names appear in its selector — so the
dashboard stylesheet stops invalidating the task list screenshots. Slices run
from about 34 rules (Settings, which is mostly Obsidian's own UI) to 314
(Editor, which pulls in the embedded list and reader rules) out of 527.

A rule that names no known class goes to **every** scenario. That is the whole
safety argument: a missed marker can only cost a spurious stale row, never a
restyle that stopped being checked. Editing `.markdown-preview-view`, a bare
`body` rule or a class the plugin no longer creates therefore still invalidates
everything, which is correct — nobody can predict what those touch.

Observed effect on the check:

| Edit                                | Scenarios invalidated                   |
| ----------------------------------- | --------------------------------------- |
| A parser, scanner or lifecycle file | none                                    |
| A `.todoseq-dashboard-*` rule       | Dashboard (10 assets)                   |
| A `.todoseq-task-item` rule         | Task list, Editor, Embedded (34 assets) |
| A `.todoseq-some-unclaimed` rule    | all 52, because nothing claims it       |
| `styles.css` wholesale              | all 52                                  |

Markers are derived, not listed: a scenario's markers are the `todoseq-`/`todo-`
class names appearing in its own declared source files. A component claims its
CSS by existing, so there is no second registry to keep in sync — and adding a
class in a new view file widens that scenario's slice automatically.

The dependency is declared rather than derived, because scenario scripts reach
the plugin through Obsidian commands and DOM selectors, so the bundle contains
no edge to follow. To stop the declaration becoming a silent hole,
`tests/screenshot-plugin-surfaces.test.ts` **fails if any module under
`src/view` is claimed by no scenario**, so adding a view file always asks which
screenshots it can change. Run `--explain` to see the current mapping.

`--check` is **manual only** — no CI job runs it, so nothing reports staleness
unless you ask it to. That is deliberate, and it is the opposite of a hard gate
for the same reason: a contributor who fixed a parser is not going to recapture
52 screenshots. Per-scenario source hashing cut the noise considerably, but
staleness still fires on plenty of commits that change no rendered pixel, and a
report on every PR is noise rather than signal. Run it yourself when you touch
plugin sources, and read a stale row as "these images may need updating", not as
work this change owes.

### Workflow after a visual change

1. `npm run build` — the capture stages the build output, not your sources.
2. `npm run docs:screenshots` — or `--only=<scenario>` for the one you touched,
   if you are confident nothing else renders that change.
3. `npm run docs:screenshots -- --check` — expect `all N fresh` and exit 0.
4. **Eyeball every changed image against its docs section.** The driver cannot
   tell a correct screenshot of a broken state from a correct screenshot of a
   working one; a stale capture is exactly what a passing run produces.
5. `npm run docs:build` and click through the affected pages in both light and
   dark appearance.

Do not skip to step 2 on every change. A capture run takes minutes and rewrites
50+ committed binaries, which buries the actual edit in a diff of images, so
regenerating is a deliberate act rather than the automatic response to a stale
row.

A `STALE` row is a heads-up, not an instruction. It means _this image may no
longer match the plugin_ — which is frequently fine, because many changes change
no pixel, and because the image is still an honest record of a build that
existed. The correct response is often to leave it stale and say so. When you do
regenerate, a human has to look at the result before it is committed; if you
have regenerated but cannot review, revert `docs/assets/` and
`scripts/screenshots/manifest.json` and let the check keep reporting the drift.

### Things that will waste your time otherwise

- **Editing `scenarios/helpers.ts` invalidates every scenario.** It holds the
  shared vault seeds and wait predicates, and it is part of every scenario's
  hash. Any edit there means a full recapture, not `--only`.
- **Never hand-write a light-mode scenario.** The driver generates a light twin
  of each scenario (`lightVariantScriptPath()`) that imports the real one and
  only overrides the base theme and a `-light` suffix on each screenshot id. A
  second hand-maintained copy would guarantee the two drift. The generated
  wrappers land in the gitignored `.tmp-screenshots/theme-variants/`.
- **`--dark-only` leaves the light twins stale**, which `--check` reports like
  any other drift. It is for fast iteration, not for committing.
- **Demo content is linted, not just documented.** The rules in `AGENTS.md`
  (TODOseq syntax only — dates on their own `SCHEDULED:`/`DEADLINE:`/`CLOSED:`/
  `STARTED:` line, never inline `<…>`; no completion emoji; no `# H1` in seeded
  notes; dates relative to today) are enforced by
  `tests/screenshot-seed-lint.test.ts`, so `npm test` fails on a seed that would
  produce a misleading screenshot.

### Wiring a new screenshot into the docs

1. Add a `screenshot` action with a stable `id` to the relevant scenario in
   `scripts/screenshots/scenarios/`. The id becomes the filename in
   `docs/assets/`.
2. Register the scenario in `SCENARIOS` in `registry.ts` if it is new, and
   list the plugin sources it renders in `SCENARIO_PLUGIN_SOURCES` — the
   coverage test fails otherwise.
3. `npm run docs:screenshots -- --only=<scenario-id>`.
4. Embed it on the docs page. **Every image is a dark/light pair on two
   adjacent lines**, with the light asset suffixed `-light`:

   ```md
   ![Alt text](./assets/my-feature-dark.png){.ts-img-wide .ts-img-dark}
   ![Alt text](./assets/my-feature-dark-light.png){.ts-img-wide .ts-img-light}
   ```

   The two rules that swap between them live in
   `docs/.vitepress/theme/custom.css` and key off VitePress's `html.dark`
   appearance class. Two traps, both silent:

   - **A `{.…}` attribute block takes one class, not a list.**
     `{.ts-img-wide ts-img-dark}` emits `class="ts-img-wide" ts-img-dark=""` —
     the second class becomes a junk attribute and the theme swap never happens.
     Multiple classes need a leading dot on each: `{.ts-img-wide .ts-img-dark}`.
   - **The two lines must be adjacent** so VitePress renders them in a single
     `<p>`. The hidden one then takes up no flow box and the spacing is
     identical in both themes.

5. `npm run docs:screenshots -- --check` should report the new asset `FRESH` and
   no `UNREFERENCED` rows.

`docs/assets/` is committed and currently around 4 MB; the light/dark pairing
roughly doubled it. Keep new assets to what the page actually needs — prefer a
clipped detail over a full window, and drop an image the page no longer uses.

## GitHub Actions Workflow for VitePress

The workflow automates the entire process: installing dependencies, building the VitePress site, and deploying it to GitHub Pages.

## Contributing

Issues and pull requests are welcome. Please describe changes clearly and include steps to reproduce when filing bugs.

## AI

Multiple AI tools have been used with human guidance and oversight to assist in the development, documentation, and review of this plugin.

AI generated contributions are accepted, but should adhere to existing project structure and code style and must be fully tested and reviewed before submission.

## License

TODOseq is released under the [MIT License](LICENSE).
