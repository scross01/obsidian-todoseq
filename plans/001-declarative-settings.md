# Plan 001: Migrate `TodoTrackerSettingTab` to the Obsidian 1.13.0 declarative settings API

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 4ba5e81..HEAD -- src/settings/settings.ts __mocks__/obsidian.ts tests/settings.test.ts tests/integration/settings-tab.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `4ba5e81`, 2026-08-05

## Why this matters

On Obsidian 1.13.0+ a `PluginSettingTab` that only implements `display()` is rendered from `getSettingDefinitions()` when that method returns a non-empty array — otherwise `display()` is skipped entirely and the tab is invisible to Obsidian's new settings search. `TodoTrackerSettingTab` (`src/settings/settings.ts`) implements only `display()`, so on 1.13+ TODOseq settings cannot be found via settings search (the plugin's own Obsidian install surfaces the warning: "This PluginSettingTab does not implement getSettingDefinitions(); its settings will not appear in Obsidian's settings search for users on 1.13.0 or later."). `manifest.json` already declares `minAppVersion: "1.13.0"`, so a clean Path A migration (delete `display()`, implement `getSettingDefinitions()` only) is allowed and is what Obsidian's migration guide recommends. After this lands, all TODOseq settings are search-indexed, and the codebase sheds its largest imperative UI file for the smaller declarative form.

## Current state

- `src/settings/settings.ts` (1569 lines) — `TodoTrackerSettingTab extends PluginSettingTab`; builds the tab imperatively in `display()` (line 1361) by calling seven section builders that create `SettingGroup`/`Setting` rows directly. Contains all keyword-group validation machinery that this plan preserves.
- `src/plugin-lifecycle.ts:171-173` — registers the tab: `this.plugin.addSettingTab(new TodoTrackerSettingTab(this.plugin.app, this.plugin))`. **Unchanged by this plan.**
- `src/main.ts` — `loadSettings()` (147–201) injects the live `App` instance onto the settings object: `(this.settings as TodoTrackerSettings & { app: typeof this.app }).app = this.app;` (line 162). `saveSettings()` (315–327) strips it before `saveData()`: `delete settingsToSave.app;`. Keep both exactly as-is.
- `src/search/search-evaluator.ts:26` — reads that instance back: `(settings as TodoTrackerSettings & { app?: App })?.app`. This is why `settings.app` must never be serialized.
- `src/utils/settings-utils.ts`, `src/utils/keyword-manager.ts`, `src/services/transition-parser.ts`, `src/parser/task-parser.ts` — imported by settings.ts; their use is unchanged.
- `__mocks__/obsidian.ts:64-76` — mock `PluginSettingTab` (used by all unit tests via `jest.config.json` `moduleNameMapper`); lacks the 1.13.0 methods.
- `tests/settings.test.ts` — jsdom test for the tab; defines its own inline `jest.mock('obsidian', ...)` with a `MockPluginSettingTab` (line 12) and `MockSetting` (line 20). Tests exercise private helpers via `(settingTab as any).<method>()`.
- `tests/integration/settings-tab.test.ts` — E2E asserts the tab renders setting labels inside `.setting-item` elements.

### Section → line map of the current file (for extracting verbatim strings)

| Section                           | Builder method                       | Lines     |
| --------------------------------- | ------------------------------------ | --------- |
| "Format task keywords" toggle     | `display()` top                      | 1366–1380 |
| Task detection group              | `createTaskDetectionSettings`        | 956–1069  |
| Smart date recognition group      | `createSmartDateRecognitionSettings` | 1205–1263 |
| Task list search and filter group | `createTaskSearchFilterSettings`     | 1074–1200 |
| Task keywords group               | `createTaskKeywordsSettings`         | 166–252   |
| Task state transitions group      | `createStateTransitionsSettings`     | 523–698   |
| Warning period group              | `createWarningPeriodSettings`        | 1268–1356 |
| Experimental features group       | `display()` bottom                   | 1401–1567 |

### Repo conventions that apply

- **Test-driven**: update/add unit tests before/with code changes (AGENTS.md). `npm test` uses Jest (`tests/settings.test.ts` is the pattern for this file; it uses `@jest-environment jsdom` and `installObsidianDomMocks()` from `tests/helpers/obsidian-dom-mock.ts`).
- **No `any`**: use `unknown` + explicit casts. Example already in repo: `main.ts:148` `// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment`.
- **No `console.log`**: use `console.error` for error paths (the existing rescan catch already does).
- **Lint rules**: `obsidianmd/ui/sentence-case` is disabled in `eslint.config.js:100`; the file uses `// workaround aggressive obsidianmd/ui/sentence-case ...` comments where sentence-case would mangle keyword examples (e.g. settings.ts:564, 1525) — keep those comment workarounds intact in moved code.
- **Commit style**: conventional commits, e.g. `feat: add support for tasks in markdown headings`, `chore(deps): updated dependencies`, `fix(lint): address mode plugin review lint errors`. Use `refactor(settings): migrate to declarative settings API`.

### The 1.13.0 API (verified in `node_modules/obsidian/obsidian.d.ts`)

- `PluginSettingTab.getSettingDefinitions(): SettingDefinitionItem[]` — d.ts:5159. Called on every `update()` **and once at registration for search indexing (no DOM exists then)**. When it returns a non-empty array, `display()` is never called (d.ts:6633).
- `SettingDefinitionControl`: `{ name, desc?, aliases?, searchable?, visible?, control: { type, key, defaultValue?, validate?, disabled? } }` (d.ts:5990–6047). `key` names a top-level property of `this.plugin.settings`. Obsidian reads via `getControlValue(key)` and writes via `setControlValue(key, value)`; the default `setControlValue` calls `saveData(this.plugin.settings)` — **unless overridden**, in which case you own persistence.
- `SettingDefinitionGroup`: `{ type: 'group', heading, items: SettingGroupItem[] }` (d.ts:6079). Top-level items may also be plain definitions (style guide: the general section at top gets no heading).
- `SettingDefinitionRender`: `{ name, desc?, render: (setting: Setting, group: SettingGroup) => void | (() => void) }` (d.ts:6265). `setting.settingEl` / `nameEl` / `descEl` / `controlEl` are public (d.ts:5699–5719), so DOM-attachment helpers keep working. **`render` does NOT auto-save** — call `this.plugin.saveSettings()` in `onChange`.
- `validate?: (value) => string | void | Promise<...>` — return a non-empty string to reject + show inline error; runs once on mount too. It never rewrites stored data (d.ts:5908–5915).
- **`validate` is single-control only**: it runs on its own control's mount/change, sees only its own value, and attaches its error only to its own row. It CANNOT (a) attach a warning/error to a _different_ setting's row, or (b) re-run when a sibling setting changes. Any setting whose validity depends on another setting (the keyword groups, the state-transition textarea, and the default-state dropdowns all depend on each other) MUST therefore be a `render` callback with the imperative `onChange` body preserved — never a `control` + `validate` combo. This is the design constraint behind Steps 2d and 2e; do not "simplify" them into `validate`.
- `disabled`/`visible` accept `boolean | () => boolean`; after any `control` change Obsidian re-evaluates them automatically. `refreshDomState()` re-evaluates without a re-render (d.ts:6628).
- `number` control: `{ type: 'number', key, min?, max?, step?, placeholder?, defaultValue? }` — commits on blur/Enter; out-of-range shows inline error and rejects (d.ts:6422).
- Control types available: `toggle | dropdown | text | textarea | number | file | folder | slider | color` (d.ts:5878). `dropdown` needs `options: Record<string, string>` where key is the stored value.

## Commands you will need

| Purpose                         | Command                                                                                 | Expected on success                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Format                          | `npm run format`                                                                        | prettier rewrites files; exit 0                                                                                                                       |
| Lint                            | `npm run lint`                                                                          | exit 0                                                                                                                                                |
| Tests                           | `npm test`                                                                              | all pass                                                                                                                                              |
| Single unit test file           | `npm test -- settings.test`                                                             | that file passes                                                                                                                                      |
| Typecheck+build                 | `npm run build`                                                                         | exit 0 (tsc `--noEmit` then esbuild)                                                                                                                  |
| Integration (Settings tab only) | `npx playwright test --config=tests/integration/playwright.config.ts -g "Settings tab"` | all pass (launches real Obsidian via Electron; on Linux set `OBSIDIAN_COMMAND`/`OBSIDIAN_PATH` per AGENTS.md; on headless CI wrap with `xvfb-run -a`) |

## Scope

**In scope** (the only files you should modify):

- `src/settings/settings.ts`
- `__mocks__/obsidian.ts`
- `tests/settings.test.ts`
- `tests/integration/settings-tab.test.ts` (selectors only, if E2E fails — see Step 6)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):

- `manifest.json`, `versions.json` — `minAppVersion` already `1.13.0`; no bump needed.
- `src/main.ts` — `loadSettings`/`saveSettings`/`settings.app` stay exactly as-is; `saveSettings()` is the only persistence path the new code may use.
- `src/plugin-lifecycle.ts` — `addSettingTab` registration is unchanged.
- `src/search/search-evaluator.ts` — its `settings.app` read is load-bearing; do not refactor it.
- `src/view/task-list/` (`task-list-view.ts`, `task-list-filter.ts`) — the side-panel toggles/dropdowns write `plugin.settings.*` directly and persist via `saveSettings()`; they are independent of the settings tab and unaffected by this migration. Do not route them through `setControlValue`.
- The private validation helpers in `settings.ts` (listed in Step 2) — copy them over intact, do not "improve" them.
- No new dependencies. Nothing in `package.json`.

## Git workflow

- Branch: `refactor/settings-declarative-api` (or match whatever branch you were given).
- Commit per step or per logical unit (mocks → tab rewrite → tests → E2E selector fixes), message style: `refactor(settings): migrate to declarative settings API`. Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the 1.13.0 methods to the obsidian mocks

**`__mocks__/obsidian.ts`** — inside the mock `PluginSettingTab` class (line 64), add:

```ts
getSettingDefinitions() { return []; }
getControlValue(_key: string) { return undefined; }
setControlValue(_key: string, _value: unknown) {}
update() {}
```

**`tests/settings.test.ts`** — inside the inline `MockPluginSettingTab` (line 12), add the same four methods. Add `SettingDefinitionItem` to the imports from `obsidian` at the top of the new test code (Step 4).

**Verify**: `npm test -- settings.test` → existing tests still pass.

### Step 2: Rewrite `src/settings/settings.ts`

Preserve these private members **verbatim** (they operate on `Setting`/`settingEl` and on the existing instance maps — all of which still exist):

- `hideSettingNameAndControl` (24–27), `validateFileExtensions` (124–161)
- `configureKeywordGroupSetting` (259–358), `parseKeywordInputsFromUI` (360–386), `validateKeywordRegexForAllGroups` (388–428), `toGroupKeywordInput` (430–444), `renderKeywordValidationState` (446–518)
- `populateDefaultStateDropdown` (703–718), `getDefaultForGroup` (725–738), `updateDefaultStateDropdowns` (743–812)
- `validateTransitionSettings` (818–865), `clearTransitionSettingErrors` (870–903), `attachInfoToSetting` (908–925), `attachErrorsToSetting` (930–951)
- `refreshAllTaskListViews` (88–117) — the tab's own method that also syncs `vaultScanner`/`keywordManager`; this is the refresh the dispatch handlers call
- Instance fields: `keywordGroupDebounceTimers`, `fileExtensionsDebounceTimer`, `transitionValidationDebounceTimer`, `keywordFieldBindings`, `defaultStateDropdowns`, `transitionSettings`, `keywordSettingToGroup`, plus the `KEYWORD_DEBOUNCE_MS`/`FILE_EXTENSIONS_DEBOUNCE_MS`/`TRANSITION_VALIDATION_DEBOUNCE_MS` constants and the `KeywordSettingKey`/`KeywordFieldBinding` types.

Delete: `createTaskKeywordsSettings`, `createStateTransitionsSettings`, `createTaskDetectionSettings`, `createTaskSearchFilterSettings`, `createSmartDateRecognitionSettings`, `createWarningPeriodSettings`, and `display()`. Replace them with `getSettingDefinitions()` plus `setControlValue` and the side-effect dispatcher below.

**Imports**: add `SettingDefinitionItem` to the `obsidian` import. Remove imports that become unused (`SettingGroup` will be one; `Notice` is still used by `refreshAllTaskListViews`, `Setting` still by `configureKeywordGroupSetting`/`hideSettingNameAndControl`/the `transitionSettings` map type, `ToggleComponent`/`DropdownComponent` still by field annotations). Let the linter confirm in Step 5.

**2a. `getSettingDefinitions()` skeleton** — mirror today's section order:

```ts
getSettingDefinitions(): SettingDefinitionItem[] {
  return [
    { name: 'Format task keywords', desc: 'Highlight task keywords (todo, doing, etc.) in bold with accent color in the editor.',
      control: { type: 'toggle', key: 'formatTaskKeywords' } },
    { type: 'group', heading: 'Task detection', items: [ /* 2b */ ] },
    { type: 'group', heading: 'Smart date recognition', items: [ /* 2b */ ] },
    { type: 'group', heading: 'Task list search and filter', items: [ /* 2b */ ] },
    { type: 'group', heading: 'Task keywords', items: [ /* 2d + migrateToTodayState */ ] },
    { type: 'group', heading: 'Task state transitions', items: [ /* 2e + trackClosedDate */ ] },
    { type: 'group', heading: 'Warning period', items: [ /* 2b */ ] },
    { type: 'group', heading: '⚠︎ Experimental features', items: [ /* 2f */ ] },
  ];
}
```

Keep the heading strings exactly as today (the last one includes the `⚠︎` prefix, settings.ts:1401).

**2b. Simple and side-effecting settings → `control` definitions.** The table below lists every setting that moves to a declarative control. The `name`/`desc` strings must be copied verbatim from the current code (search indexing uses them). "Side effect key" maps to the dispatcher in 2c; "—" means pure save (no dispatcher entry). The number controls are a deliberate change: they replace the manual `inputEl.type='number'` + range-check pattern (current lines 1156–1171, 1277–1319) with native `min`/`max` validation; they now commit on blur/Enter instead of per keystroke.

| `name` (verbatim)                                    | `key`                                  | control                                                                                                                                                                                                                                                       | side effect key              |
| ---------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Format task keywords                                 | `formatTaskKeywords`                   | toggle                                                                                                                                                                                                                                                        | `formatTaskKeywords`         |
| Include tasks inside quote and callout blocks        | `includeCalloutBlocks`                 | toggle                                                                                                                                                                                                                                                        | rescan                       |
| Include tasks inside comments                        | `includeCommentBlocks`                 | toggle                                                                                                                                                                                                                                                        | rescan                       |
| Include tasks inside code blocks                     | `includeCodeBlocks`                    | toggle                                                                                                                                                                                                                                                        | `includeCodeBlocks`          |
| Enable language comment support                      | `languageCommentSupport`               | toggle, `disabled: () => !this.plugin.settings.includeCodeBlocks`                                                                                                                                                                                             | rescan                       |
| Enable smart date recognition                        | `enableSmartDateRecognition`           | toggle                                                                                                                                                                                                                                                        | `enableSmartDateRecognition` |
| Remove date keywords                                 | `smartDateRemoveKeywords`              | toggle, `disabled: () => !this.plugin.settings.enableSmartDateRecognition`                                                                                                                                                                                    | —                            |
| Week starts on                                       | `weekStartsOn`                         | dropdown `options: { Monday: 'Monday', Sunday: 'Sunday' }`, `defaultValue: 'Monday'`                                                                                                                                                                          | refreshViews                 |
| Completed tasks                                      | `taskListViewMode`                     | dropdown `{ showAll: 'Show all tasks', sortCompletedLast: 'Sort completed to end', hideCompleted: 'Hide completed' }`, `defaultValue: 'showAll'`                                                                                                              | refreshViews                 |
| Future dated tasks                                   | `futureTaskSorting`                    | dropdown `{ showAll: 'Show all tasks', showUpcoming: 'Show upcoming', sortToEnd: 'Sort future to end', hideFuture: 'Hide future' }`, `defaultValue: 'showAll'`                                                                                                | refreshViews                 |
| Task descriptions                                    | `taskDescriptionDisplay`               | dropdown `{ hide: 'Hide', show: 'Show' }`, `defaultValue: 'show'`                                                                                                                                                                                             | refreshViews                 |
| Upcoming period (days)                               | `upcomingPeriod`                       | **number** `min: 0, max: 30, defaultValue: 7`                                                                                                                                                                                                                 | refreshViews                 |
| Default sort method                                  | `defaultSortMethod`                    | dropdown `{ default: 'Default (file path)', sortByScheduled: 'Scheduled date', sortByDeadline: 'Deadline date', sortByClosedDate: 'Closed date', sortByPriority: 'Priority', sortByUrgency: 'Urgency', sortByKeyword: 'Keyword' }`, `defaultValue: 'default'` | —                            |
| Deadline advance notice (days)                       | `defaultDeadlineWarningPeriod`         | **number** `min: 0, max: 30, defaultValue: 0`                                                                                                                                                                                                                 | refreshViews                 |
| Scheduled delay (days)                               | `defaultScheduledWarningPeriod`        | **number** `min: 0, max: 30, defaultValue: 0`                                                                                                                                                                                                                 | refreshViews                 |
| Ignore scheduled delay when deadline is set          | `skipScheduledWarningPeriodIfDeadline` | toggle                                                                                                                                                                                                                                                        | refreshViews                 |
| Ignore deadline advance notice when scheduled is set | `skipDeadlinePrewarningIfScheduled`    | toggle                                                                                                                                                                                                                                                        | refreshViews                 |
| Track closed date                                    | `trackClosedDate`                      | toggle                                                                                                                                                                                                                                                        | —                            |
| Migrated state keyword                               | `migrateToTodayState`                  | text, `placeholder: '(disabled)'`                                                                                                                                                                                                                             | `migrateToTodayState`        |
| Detect org-mode files                                | `detectOrgModeFiles`                   | toggle                                                                                                                                                                                                                                                        | `detectOrgModeFiles`         |
| Scan code files for comments                         | `scanCodeFiles`                        | toggle                                                                                                                                                                                                                                                        | `scanCodeFiles`              |
| Use extended Markdown checkbox styles                | `useExtendedCheckboxStyles`            | toggle                                                                                                                                                                                                                                                        | `useExtendedCheckboxStyles`  |

**2c. `setControlValue` + side-effect dispatcher.** Overriding `setControlValue` replaces the default write path including its `saveData()` call — this is what keeps `settings.app` out of `data.json`. Add:

```ts
async setControlValue(key: string, value: unknown): Promise<void> {
  (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
  await this.plugin.saveSettings();
  await this.sideEffectHandlers[key]?.(value);
}
```

**Do NOT override `getControlValue`.** The default reads from `this.plugin.settings` (d.ts:5165) — the same object this override writes to. That round-trip is what keeps the settings tab in sync with the **task-list side panel**, whose view toggles (`src/view/task-list/task-list-view.ts:629, 692, 745`) write the _same keys_ (`taskListViewMode`, `futureTaskSorting`, `taskDescriptionDisplay`) directly into `this.plugin.settings` and persist through the same `this.plugin.saveSettings()`. Those direct writes are independent of the settings tab and are NOT migrated — if you broke the shared object (e.g. by routing `setControlValue` to a separate store, or overriding `getControlValue` to read elsewhere), the two surfaces would desync.

Private helpers (replicating today's behavior; `refreshAllTaskListViews` here is the tab's own method from 2b's preserve list, which also syncs `vaultScanner`/`keywordManager`):

```ts
private async rescanAndRefresh(): Promise<void> {
  try {
    await this.plugin.recreateParser();
    await this.plugin.scanVault();
    await this.refreshAllTaskListViews();
    this.plugin.refreshVisibleEditorDecorations();
    this.plugin.refreshReaderViewFormatter();
  } catch (parseError) {
    console.error('Failed to rescan vault:', parseError);
  }
}
private refreshViews(): Promise<void> { return this.refreshAllTaskListViews(); }
```

`sideEffectHandlers` (a class field `private readonly sideEffectHandlers: Record<string, (value: unknown) => Promise<void> | void>`):

- `formatTaskKeywords` → `() => this.plugin.updateTaskFormatting()`
- rescan keys → `() => this.rescanAndRefresh()`
- `includeCodeBlocks` → `(value) => { if (!value) this.plugin.settings.languageCommentSupport = false; return this.rescanAndRefresh(); }` (replaces settings.ts:1017–1039; after mutating, call `this.refreshDomState()` so the sibling's `disabled` predicate re-evaluates)
- `enableSmartDateRecognition` → `(value) => { if (!value) this.plugin.settings.smartDateRemoveKeywords = false; this.plugin.smartDateProcessor?.setEnabled(Boolean(value)); this.refreshDomState(); }` (replaces settings.ts:1219–1240)
- refreshViews keys → `() => this.refreshViews()`
- `migrateToTodayState` → `() => { this.plugin.embeddedTaskListProcessor?.updateSettings(); return this.refreshViews(); }`
- `detectOrgModeFiles` → replicate settings.ts:1418–1456: toggle `.org` in `this.plugin.settings.additionalFileExtensions` (add when enabling, remove when disabling), then `return this.rescanAndRefresh();` (the dispatcher already saved; the old code's intermediate `saveSettings()` is redundant)
- `scanCodeFiles` → add a class field `private codeExtensionsSnapshot: string[] | null = null;` and replicate settings.ts:1470–1518: on enable snapshot current `additionalFileExtensions` (if not already snapshotted) then append every `SUPPORTED_EXTENSIONS` entry not already present; on disable remove only the `SUPPORTED_EXTENSIONS` entries that are not in the snapshot (preserving user-added extensions); then `return this.rescanAndRefresh();`
- `useExtendedCheckboxStyles` → `async () => { await this.plugin.recreateParser(); this.plugin.updateTaskWriterKeywordManager(); }`

`SUPPORTED_EXTENSIONS` import stays (from `../parser/code-comment-task-parser`).

**2d. Task keywords group → `render` callbacks.** Each of the 5 keyword settings becomes a definition whose `render` delegates to the preserved `configureKeywordGroupSetting`:

```ts
{
  name: 'Inactive keywords',
  desc: '<verbatim current desc from settings.ts:174>',
  render: (setting) => this.configureKeywordGroupSetting(setting, 'additionalInactiveKeywords', 'Inactive keywords', '<same verbatim desc>', this.plugin.settings.additionalInactiveKeywords),
},
```

Repeat for `additionalActiveKeywords` (settings.ts:183), `additionalWaitingKeywords` (192), `additionalCompletedKeywords` (201), `additionalArchivedKeywords` (210). `configureKeywordGroupSetting` re-sets name/desc on the `Setting` internally — keep the definition `name`/`desc` identical so search index and DOM agree.

**The cross-field validation chain is already inside `configureKeywordGroupSetting`'s debounced `onChange` (settings.ts:302–344) and is preserved verbatim.** It re-validates ALL keyword groups, persists the parsed values, then calls `updateDefaultStateDropdowns()` (settings.ts:327) — which repopulates the transition group's default-state dropdowns and silently rewrites a stored default override that is no longer a keyword — and `validateTransitionSettings()` (settings.ts:330), which attaches a warning to the transition textarea/dropdown rows when a default-state override is not in the keyword set. This is the whole dynamic cross-group validation; **do not add a separate dispatcher entry for it, and do NOT delete `updateDefaultStateDropdowns`/`validateTransitionSettings` as "orphaned"** — they are reachable from the preserved keyword `onChange`. They also write persistence through `this.plugin.saveSettings()` (settings.ts:324, 810), never through `setControlValue`, which is correct: these are render-callback settings, not controls, and `saveSettings()` strips `app`.

After the **last** (archived) keyword definition, still inside its `render` callback, schedule the initial validation (mirrors settings.ts:237–251; must run after all five bindings exist — all render callbacks in a pass run synchronously in array order, so a `setTimeout(..., 0)` from the last one fires last):

```ts
window.setTimeout(() => {
  const parsed = this.parseKeywordInputsFromUI();
  const regex = this.validateKeywordRegexForAllGroups(parsed);
  const groups = this.toGroupKeywordInput(regex.validBySetting);
  const validation = validateKeywordGroupsDetailed(groups);
  this.renderKeywordValidationState(
    regex.errorsByGroup,
    validation.errors,
    validation.warnings,
  );
}, 0);
```

The `migrateToTodayState` control from 2b sits in this group, after the 5 render callbacks.

**2e. State transitions group → `render` callbacks.** Compute these locals once at the top of `getSettingDefinitions()`, before the `return` (there is no builder method anymore — the old method at settings.ts:523 is deleted):

```ts
const keywordManager = new KeywordManager(this.plugin.settings);
const defaultInactive = this.getDefaultForGroup(
  keywordManager,
  'inactiveKeywords',
  'TODO',
);
const defaultActive = this.getDefaultForGroup(
  keywordManager,
  'activeKeywords',
  'DOING',
);
const defaultCompleted = this.getDefaultForGroup(
  keywordManager,
  'completedKeywords',
  'DONE',
);
```

Then, in order:

- `State transitions` textarea → `render: (setting) => { this.transitionSettings.transitions = setting; setting.setName('State transitions').setDesc('<verbatim settings.ts:551>').addTextArea((ta) => { <body settings.ts:553–596 verbatim, keeping the sentence-case workaround comment on the placeholder at 564> }); }`
- `Default inactive state` → `render: (setting) => { this.transitionSettings.inactive = setting; setting.setName('Default inactive state').setDesc('<verbatim settings.ts:603>').addDropdown((dropdown) => { <body settings.ts:605–624 verbatim> }); }`
- `Default active state` → same shape, storing into `this.transitionSettings.active` / `this.defaultStateDropdowns.active` (body settings.ts:627–652).
- `Default completed state` → same shape, storing into `this.transitionSettings.completed` / `this.defaultStateDropdowns.completed` (body settings.ts:655–680). After this dropdown's `render` setup, schedule `window.setTimeout(() => this.validateTransitionSettings(), 0)` (replaces the initial call at settings.ts:697).

Each of these four `render` callbacks stores its `Setting` into `this.transitionSettings` and its `DropdownComponent` into `this.defaultStateDropdowns` — those maps are what `validateTransitionSettings()` and `updateDefaultStateDropdowns()` operate on, so the stores are load-bearing, not incidental. The verbatim `onChange` bodies (settings.ts:587–592, 615–623, 643–651, 671–679) call `validateTransitionSettings()` plus `plugin.updateTaskListViewSettings()` / `plugin.updateTaskUpdateCoordinatorSettings()` — this is the per-setting dynamic validation (e.g. typing a transition line that references an unknown state, or picking a default state override that isn't in the keyword set) and it survives exactly because the bodies are copied intact. All four render callbacks run synchronously in array order, so the two `setTimeout(..., 0)` initial-validation passes (this one and the keyword one in 2d) fire after every map and binding they read is populated.

- `Track closed date` → the pure toggle control from 2b (body settings.ts:682–694).

**2f. Experimental group.**

- Warning row (settings.ts:1403–1408): `{ name: 'Experimental features', render: (setting) => { setting.setDesc('Experimental features may be changed significantly or removed entirely in future versions.'); hideSettingNameAndControl(setting); } }`.
- The remaining toggles from 2b in current order: `detectOrgModeFiles`, `scanCodeFiles`, `useExtendedCheckboxStyles` (descs verbatim from settings.ts:1411–1567).

**Verify**: `npm run build` → exit 0, no unused-import errors. Then `npm test -- settings.test` → existing tests pass (they only touch preserved helpers).

### Step 3: Add unit tests for the declarative surface

In `tests/settings.test.ts`, add a `describe('declarative settings', ...)` block:

1. `getSettingDefinitions()` returns `formatTaskKeywords` as the first item and exactly 7 `type: 'group'` items with headings `Task detection`, `Smart date recognition`, `Task list search and filter`, `Task keywords`, `Task state transitions`, `Warning period`, `Experimental features`.
2. Control-shape spot checks: `defaultSortMethod` is a dropdown with 7 options; `upcomingPeriod` is `{ type: 'number', min: 0, max: 30 }`; `smartDateRemoveKeywords` has a function-valued `disabled`; `trackClosedDate` is a toggle.
3. `setControlValue('upcomingPeriod', 7)` → `pluginMock.settings.upcomingPeriod === 7`, `saveSettings` called, and the tab's `refreshAllTaskListViews` ran (assert `pluginMock.workspace.getLeavesOfType` was called, or spy on the tab method — `refreshAllTaskListViews` guards on `pluginMock.vaultScanner`, so the existing mock without `vaultScanner` is safe).
4. `setControlValue('formatTaskKeywords', true)` → `updateTaskFormatting` called.
5. `setControlValue('includeCodeBlocks', false)` → `settings.languageCommentSupport === false` and the rescan cascade fired (`recreateParser`, `scanVault`, `refreshVisibleEditorDecorations`, `refreshReaderViewFormatter` all called).
6. `setControlValue('enableSmartDateRecognition', false)` → `settings.smartDateRemoveKeywords === false` and `smartDateProcessor.setEnabled(false)` — add `smartDateProcessor: { setEnabled: jest.fn() }` to `pluginMock`.
7. `detectOrgModeFiles` true then false → `.org` added then removed from `additionalFileExtensions`.
8. `scanCodeFiles` true then false → `SUPPORTED_EXTENSIONS` added, then removed back to the pre-toggle snapshot (a manually added `.custom` extension survives the disable).
9. **Cross-field sibling warning (the "default-state override" case)** — `validateTransitionSettings()`: set `settings.stateTransitions.defaultCompleted = 'NOT-A-KEYWORD'` (not in the keyword set), keep `transitionStatements` valid, then call `(settingTab as any).validateTransitionSettings()`. Assert a `.todoseq-setting-item-warning` appears inside `transitionSettings.completed.settingEl` (mirror the Setting-mock pattern of the existing `attachInfoToSetting` test at tests/settings.test.ts:413) and that `transitionSettings.transitions.settingEl` has NO `.todoseq-setting-item-error`. Inverse case: `defaultCompleted = 'DONE'` (a real keyword) → no warning.
10. **Cross-field override rewrite** — `updateDefaultStateDropdowns()`: populate `defaultStateDropdowns.completed` with a `DropdownComponent` mock whose `getValue()` returns a stored override that is no longer in the keyword set (mirror the dropdown-mock pattern of the existing `populateDefaultStateDropdown` test at tests/settings.test.ts:328), then call `(settingTab as any).updateDefaultStateDropdowns()`. Assert the dropdown was repopulated with the computed default (`DONE`), `settings.stateTransitions.defaultCompleted` was rewritten to `'DONE'`, and `saveSettings` was called. (These two methods — the whole cross-group validation chain — currently have NO unit tests; these pin the behavior this plan must preserve.)

Extend `pluginMock` (settings.test.ts:168–183) with the spies the new tests need (`updateTaskFormatting`, `refreshVisibleEditorDecorations`, `refreshReaderViewFormatter`, `smartDateProcessor`, `vaultScanner` optional). Keep every existing mock entry — existing tests depend on them.

**Verify**: `npm test -- settings.test` → all pass, including the new block.

### Step 4: Confirm no `display()` remains

`rg "display\(" src/settings/settings.ts` → no matches. `getSettingDefinitions` appears exactly once.

### Step 5: Format + lint + full unit suite

**Verify**:

1. `npm run format` → exit 0 (also cleans unused-import lint errors)
2. `npm run lint` → exit 0
3. `npm test` → full suite green

### Step 6: Integration test

Run `npx playwright test --config=tests/integration/playwright.config.ts -g "Settings tab"`. It asserts setting labels inside `.setting-item` (tests/integration/settings-tab.test.ts:31–51), which the declarative renderer produces. If a selector fails, fix the test's selectors to match the declarative DOM — **do not revert to `display()`**.

**Verify**: the "Settings tab" suite passes.

### Step 7: Commit

Commit the four in-scope files (plus `plans/README.md` status update) as `refactor(settings): migrate to declarative settings API`. Do not push.

## Test plan

- New tests: the `describe('declarative settings', ...)` block in `tests/settings.test.ts` (Step 3) — happy path (definitions array shape), regression (persistence routes through `saveSettings`, `app` never saved), named edge cases (cross-field resets `includeCodeBlocks`→`languageCommentSupport`, `enableSmartDateRecognition`→`smartDateRemoveKeywords`; extension add/remove/snapshot behavior for `detectOrgModeFiles`/`scanCodeFiles`), and the **cross-field validation pair** (Step 3 items 9–10) that pins the preserved `validateTransitionSettings`/`updateDefaultStateDropdowns` behavior — default-state-override sibling warning and override rewrite.
- Structural pattern: the existing `beforeEach` in `tests/settings.test.ts:157–186` (settings via `createBaseSettings()`, `pluginMock`, `appMock`), and `installObsidianDomMocks()` in `beforeAll`.
- Existing tests to keep passing: all private-helper tests in `tests/settings.test.ts` (they call preserved methods, so they survive unchanged).
- Verification: `npm test -- settings.test` → all pass including new block; then `npm test` → full suite green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run build` exits 0
- [ ] `npm test` exits 0; `tests/settings.test.ts` contains the new `declarative settings` describe block **and** the two cross-field validation tests (Step 3 items 9–10), and all pass
- [ ] `npm run format` then `npm run lint` exit 0
- [ ] `rg "display\(" src/settings/settings.ts` returns no matches
- [ ] `npx playwright test --config=tests/integration/playwright.config.ts -g "Settings tab"` passes
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 001 is `DONE`

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted since `4ba5e81`).
- A step's verification fails twice after a reasonable fix attempt.
- The migration appears to require touching an out-of-scope file (especially `main.ts` or `plugin-lifecycle.ts`).
- Obsidian's runtime behavior for `setControlValue`/`getSettingDefinitions` contradicts the d.ts (e.g. control values not passed to `setControlValue`) — report the observed behavior instead of working around it blind.
- The declarative renderer does not produce `.setting-item` rows at all, and selector fixes can't be confirmed against a running instance.

## Maintenance notes

- Future settings = one definition (+ a `sideEffectHandlers` entry if it has an `onChange` side effect). There is no side-effect hook on `control` definitions; the dispatcher or a `render` callback is the only place. Never put arbitrary `onChange` logic inside a `control` definition.
- `settings.app` is load-bearing for `search-evaluator.ts` and must never be serialized — `saveSettings()` is the only persist path, which is why `setControlValue` overrides the default write path.
- Behavior changes to flag in review: `number` inputs commit on blur/Enter (not per keystroke) and show native out-of-range errors; `migrateToTodayState` placeholder is now static `'(disabled)'` instead of value-dependent.
- If Obsidian later ships more declarative control types (e.g. moment-format), prefer them only for _single-field_ settings (task detection, search/filter, warning period). The keyword groups and state-transition group must remain `render` callbacks regardless of new control types: their validation is cross-field (warning/error on a _sibling_ setting, re-run on sibling change), which `control`+`validate` cannot express.
- Any future setting whose validity depends on another setting belongs in a `render` callback with its imperative `onChange` body intact — never a `control` + `validate` combo. `validate` cannot attach warnings to other rows or re-run on sibling changes.

## Execution record (2026-08-05, executed in isolated worktree `refactor/settings-declarative-api`)

Verdict: **APPROVED** — the one deferred gate (Step 6 integration) was subsequently cleared on Obsidian 1.13.4 after a harness adaptation (see below). Build, lint, full unit suite (4584 tests), and full integration suite (30/30) all verified by reviewer; scope clean; `plans/README.md` marked DONE.

**Amendments applied during execution (approved, documented):**

1. **`manifest.json` `minAppVersion` bump (1.11.0 → 1.13.0).** The plan's premise that minAppVersion was already 1.13.0 was wrong for the committed tree (it holds only in the main tree's _staged_ 0.19.0 release prep). The Obsidian lint rules (`obsidianmd/no-unsupported-api`, `obsidianmd/settings-tab/require-display`) reject the migration without it. One line; consistent with the plan's intent and the user's staged release. Note for merge: the user's staged `manifest.json` (version 0.19.0) will conflict — prefer their version field.
2. **`setControlValue` ordering fix (settings.ts:237-241).** The plan specified write → `saveSettings()` → side-effect handler, and asserted "the dispatcher already saved" made a second save redundant. That was wrong: the handlers that mutate sibling settings (`includeCodeBlocks`→`languageCommentSupport`, `enableSmartDateRecognition`→`smartDateRemoveKeywords`, `detectOrgModeFiles`/`scanCodeFiles`→`additionalFileExtensions`) run _after_ the save, so the pre-migration persistence of those resets was silently lost. Fixed to save _after_ the handler: `(this.plugin.settings)[key] = value; await this.sideEffectHandlers[key]?.(value); await this.plugin.saveSettings();`. Pinned by four snapshot tests that fail under the old ordering.
3. **Test-harness adaptations** (necessary, minimal): `refreshDomState() {}` added to the inline `MockPluginSettingTab`; `getTasks: jest.fn().mockReturnValue([])` added to `pluginMock` (`refreshAllTaskListViews` calls `this.plugin.getTasks()` unconditionally, contrary to the plan's vaultScanner-guard note); `getKeywordsForGroup` mock made group-aware so the `updateDefaultStateDropdowns` test computes the expected `DONE`.

**Deferred gate — now CLEARED (2026-08-05, after Obsidian 1.13.4 installed).** The Step 6 integration gate was originally blocked twice: (a) installed Obsidian was **1.12.7**, which predates the 1.13.0 declarative API (observed `TypeError: e.display is not a function`; tab pane renders empty on 1.12.7, where only `display()` works), and (b) once 1.13.4 was installed, the harness failed because Obsidian 1.13+ opens Settings in a **separate Electron window** (a second CDP page with no `window.app`), not an in-app `.modal`. The migration itself was confirmed working on 1.13.4 (40 `.setting-item` rows, correct labels/values) — only the harness needed updating.

**Harness adaptation (`15eb442`, "test(integration): support Obsidian 1.13 settings window", committed in the worktree):**

- `session.ts` `connectOverCDP` now selects the page with `window.app` (the main window) instead of blind `pages()[0]`.
- `assertions.ts` `openSettings` returns the settings-window page (polls sibling pages for no `window.app` + `.vertical-tab-nav-item`, 10s timeout); `closeSettings` closes via `app.setting.close()` with `window.close()` fallback; `closeAllModals` prepends `app.setting.close()` so a lingering settings window can't break other suites.
- `settings-tab.test.ts` and `restart.test.ts` capture and use the returned settings page.

Final verification on Obsidian 1.13.4: full integration suite **30/30 pass** (1.3m), including the 2 Settings tab tests and the restart persistence test; `npm run build` exit 0; `npm run lint` exit 0 (only the pre-existing `no-alert` warning). No `src/` or plan files touched by the harness change. **Step 6 gate CLOSED — plan fully complete.**
