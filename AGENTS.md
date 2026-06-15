# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## IMPORTANT

- **ALWAYS** consider the performance impact of any changes and prioritise performance without sacrificing functionality
- **REMEMBER** this is an Obsidian plugin and should be treated as such, it is not a generic web app.
- **DO NOT** use Unsafe assignment of an `any` value.
- **TEST DRIVEN DEVELOPMENT** write or update unit tests before making changes to the codebase where unit test are appropriate (without significant mocking).
- **DO NOT** use `console.log` for debugging, use `console.debug` instead.
- **ALWAYS** use obsidian editor and vault APIs for file operations, do not use node.js file APIs for direct file manipulation.
- **ALWAYS** use the `TaskWriter` to write tasks to files, do not use the editor or vault APIs directly.

## Guidelines

- Think holistically about the problem, how do the changes fit with the rest of the plugin architecture.
- Never use hard coded keyword checks, always use the KeywordManager.

## Build & Test

- **Build**: `npm run build`
- **Test**: `npm test`
- **Format**: `npm run format` - runs prettier on all files.
- **Lint**: `npm run lint` - run format first to reduce lint errors.
- **Single test**: `npm test -- --testNamePattern="pattern"` (Jest with regex match)
- **Coverage excludes**: `src/main.ts` excluded from coverage (line 9 in jest.config.json)
- **Test console**: Tests mock console methods to reduce noise (lines 10-21 in tests/test-setup.ts)
- **Test window mock**: `tests/test-setup.ts` provides a mock `window` global (with timers) for tests running in Node.js environment; does not override jsdom's window
- **Test DOM mocks**: Use `installObsidianDomMocks()` from `tests/helpers/obsidian-dom-mock.ts` in jsdom tests — adds `createEl`, `createDiv`, `createSpan`, `instanceOf()`, and `activeDocument` to DOM prototypes
- **Test environments**: Jest config defaults to `node`; jsdom tests use `@jest-environment jsdom` pragma
- **Eslint for tests**: Some Obsidian-specific rules are disabled for tests — see `tests/**/*.ts` block in `eslint.config.js`
- **Timezone independence**: Always use local time methods (`getFullYear()`, `getMonth()`, `getDate()`) when working with dates in tests. Never use `Date.now()` or UTC dates in tests to avoid test failures in timezones ahead of UTC.

## Architecture

- **REVIEW `ARCHITECTURE.md`** to understand the architecture of this Obsidian plugin.
- **Single source of truth**: `TaskStateManager` maintains tasks; all views subscribe to changes
- **Parser lifecycle**: All parsers created in `PluginLifecycleManager` and registered with `ParserRegistry`; `VaultScanner` receives fully configured `ParserRegistry` via constructor
- **Event-driven**: `VaultScannerEvents` interface defines events; listeners stored in Map
- **Embedded lists**: `TodoseqCodeBlockProcessor` registers as markdown processor; separate from main plugin lifecycle
- **Update coordination**: `TaskUpdateCoordinator` provides single entry point for all state updates with optimistic UI updates
- **Recurrence management**: `RecurrenceCoordinator` coordinates delayed recurrence updates (50ms delay); `RecurrenceManager` handles recurrence date calculations
- **State transitions**: `TransitionParser` parses declarative state transition syntax; `TaskStateTransitionManager` manages state cycling
- **Context menus**: `TaskContextMenu` provides right-click task actions (priority, scheduled date, deadline, copy/move to today)
- **Smart dates**: `SmartDateProcessor` and `NaturalDateParser` handle auto-conversion of natural language dates (see ARCHITECTURE.md)
- **Code scanning**: `CodeCommentTaskParser` conditionally scans code files for TODO comments (see ARCHITECTURE.md)

## Critical Patterns

- **Yield to event loop**: `yieldToEventLoop()` called during vault scans to prevent UI freezing
- **Task ordering**: `taskComparator` sorts by path then line; used consistently across all views
- **Editor refresh**: `refreshVisibleEditorDecorations()` uses `requestMeasure()` + `dispatch()` + `setTimeout` sequence to force decoration updates
- **Reader view refresh**: `refreshReaderViewFormatter()` iterates leaves and calls `previewMode.rerender(true)`
- **Regex caching**: `RegexCache` utility caches compiled regex patterns to avoid repeated compilation during vault scans and searches

## Mobile Compatibility

- **Support desktop and mobile**: Obsidian mobile has some differnences that need to be handled correctly, and misses some node.js apis.

## Code Style

- **Obsidian Plugins Code**: Follow Obsidian Plugins Code Review guidelines.

## Integration Tests

Playwright-based E2E tests that launch a real isolated Obsidian instance via Electron, connect over CDP, and run against the actual plugin.

### Commands

- **Run all**: `npm run test:integration` (builds plugin first)
- **Skip build**: `npm run test:integration:fast`
- **Single test**: `npx playwright test --config=tests/integration/playwright.config.ts -g "test name"`

### Architecture

- **Isolation**: `--user-data-dir` points at an ephemeral `fixtures/obsidian-user-data/` directory. Vault registry (`obsidian.json`) points ONLY at the test vault.
- **Trust bypass**: `vaultTrust` is set in `obsidian.json` registry, but Obsidian 1.12+ still shows the trust dialog. The launcher (`obsidian-launcher.ts`) clicks the "Trust author and enable plugins" button.
- **Plugin loading**: Plugin is pre-enabled via `community-plugins.json` in the test vault. After trust is accepted, the plugin loads automatically.
- **Shared instance**: `globalSetup` launches one Obsidian instance; all test files reconnect via CDP (`session.ts`). `obsidian-restart` project manages its own lifecycle.
- **Between-test reset**: `test-reset.ts` closes lingering modals, restores baseline `data.json`, and triggers a vault rescan.

### Critical Gotchas

- **NO keyboard shortcuts**: Never use `page.keyboard.press('Meta+...')` or `page.keyboard.type()`. All Obsidian commands must be invoked via `page.evaluate(() => app.commands.executeCommandById(...))`. Keyboard events go to the focused element and can trigger unintended Obsidian actions (e.g. theme toggle via `theme:toggle-light-dark`).
- **DOM selectors are version-specific**: Obsidian 1.12+ uses `.vertical-tab-nav-item` (NOT `.vertical-tab-list-item`) for settings sidebar tabs, with a `.vertical-tab-nav-item-title` child for the label text.
- **Editor live preview**: Task items in the editor render as native `<input type="checkbox">` inside `<div>` containers — NOT with `.task-list-item` class. Use `div:has-text('task text')` + `input[type="checkbox"]` to find them.
- **Reading mode toggle**: `leaf.openFile(file, { mode: 'preview' })` doesn't reliably open in reading mode. Use the view mode toggle button (`button[aria-label*="read"]`) or `editor:toggle-preview` command.
- **Editor content reads stale data**: `app.vault.read(file)` may return pre-edit content. Use `app.workspace.activeLeaf.view.editor.getValue()` to read the live editor buffer.
- **Theme locking**: Write `appearance.json` with `{"theme": "obsidian"}` in the test vault's `.obsidian/` to prevent light/dark toggling during tests.
- **Window resize**: Use `page.evaluate(() => require('electron').remote.getCurrentWindow().setSize(1400, 900))` to resize the actual Electron window. `page.setViewportSize()` only changes the web content area.
- **Strict mode violations**: Multiple `.markdown-source-view` or `.markdown-preview-section` elements may exist from previous file opens. Scope to `.workspace-leaf.mod-active` or use `.first()`.
- **Modal interception**: Lingering modals and dropdowns (e.g. `.todoseq-dropdown.show`) can intercept pointer events. Close them in `resetVaultState` or before clicking.

### Live Debugging via CDP

Connect Playwright to a running test Obsidian instance:

```typescript
const browser = await chromium.connectOverCDP('http://127.0.0.1:9333');
const page = browser.contexts()[0].pages()[0];

// Inspect DOM
const info = await page.evaluate(() => {
  const modal = document.querySelector('.modal');
  const tabs = modal?.querySelectorAll('.vertical-tab-nav-item');
  return Array.from(tabs ?? []).map(t => t.textContent?.trim());
});

// Run Obsidian commands
await page.evaluate(() => {
  app.commands.executeCommandById('app:open-settings');
});

// Check plugin state
await page.evaluate(() => {
  return Object.keys(app.plugins.plugins);
});
```

Or use the inspection script pattern: bootstrap fixtures, launch Obsidian via the test harness, connect via CDP, then `closeObsidian(browser)` when done. See `obsidian-launcher.ts` for the full setup sequence.
