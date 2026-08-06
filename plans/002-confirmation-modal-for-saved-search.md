# Plan 002: Replace native `window.confirm` with Obsidian `ConfirmationModal` for saved-search deletion

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat e99a24a..HEAD -- src/view/task-list/task-list-view.ts src/view/components/saved-search-dialog.ts tests/task-list-view.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt / ui
- **Planned at**: commit `e99a24a`, 2026-08-05

## Why this matters

Deleting a saved search uses the native browser `window.confirm()` — the
plugin's _only_ use of a native dialog. Native confirms are unthemed, break
with Obsidian's mobile experience (behavior is inconsistent or blocked on
several platforms), and read as a system prompt rather than an Obsidian
control. The code even carries an explicit TODO asking for the fix
(`task-list-view.ts:1270`). Obsidian 1.13.0 ships `ConfirmationModal`
(`@since 1.13.0`, and `manifest.json` already declares
`minAppVersion: "1.13.0"`), so a themed, accessible, mobile-correct
confirmation is available with no version-gating. The rest of the plugin
already uses Obsidian UI primitives (`Menu`, `Notice`, `setTooltip`) — this
change makes the delete flow consistent with that.

A secondary goal: the confirmation must work with both delete entry points —
the search-options dropdown (fire-and-forget) and the edit dialog (which
must close only after the user confirms).

## Current state

- `src/view/task-list/task-list-view.ts` — the `TaskListView` view class.
  Contains the private `deleteSavedSearch` method (lines 1269–1281) that
  calls `window.confirm`, plus two call sites:
  - line 897–899 (search-options dropdown): `onDelete: (search) => { this.deleteSavedSearch(search); }` — the return value is unused here (`SavedSearchCallbacks.onDelete` is typed `(search: SavedSearch) => void`, see `src/view/components/search-options-dropdown.ts:20`).
  - line 1256–1258 (edit dialog): `onDelete: () => { return this.deleteSavedSearch(search); }` — the boolean return tells `SavedSearchDialog` whether to close itself.
- `src/view/components/saved-search-dialog.ts` — a custom div-based modal for
  create/edit of saved searches (not an Obsidian `Modal` subclass — it
  renders its own backdrop + `.todoseq-saved-search-modal` div into
  `activeDocument.body`). Its `SavedSearchDialogOptions.onDelete` is typed
  `() => boolean` (line 23) and its delete button handler closes the dialog
  when the callback returns truthy (lines 207–218).
- `tests/task-list-view.test.ts` — jsdom unit test for the view. It stubs the
  whole `obsidian` module with `jest.mock('obsidian', ...)` (lines 15–45) and
  must gain a `ConfirmationModal` stub, otherwise `new ConfirmationModal(...)`
  would receive `undefined`. Its shared `pluginMock` (lines 165–184) has no
  `saveSettings` — the delete path calls `this.plugin.saveSettings()`, so the
  new tests must add it.

### Excerpts (confirm these match the live files before editing)

`src/view/task-list/task-list-view.ts:1266-1281`:

```ts
  /**
   * Delete a saved search after confirmation
   */
  private deleteSavedSearch(search: SavedSearch): boolean {
    // TODO use ConfirmationModal in v1.13 - simple confirmation for destructive action
    const confirmed = window.confirm(`Delete saved search "${search.name}"?`);
    if (!confirmed) return false;

    removeSavedSearch(this.plugin.settings, search.id);
    void this.plugin.saveSettings();
    this.refreshSavedSearchesInDropdown();
    // Clear active indicator if the deleted search was active
    this.updateSaveSearchBtnVisibility(this.getSearchQuery());
    new Notice(`Saved search "${search.name}" deleted`);
    return true;
  }
```

`src/view/task-list/task-list-view.ts:1-12` (import block — add `ConfirmationModal`):

```ts
import {
  ItemView,
  WorkspaceLeaf,
  TFile,
  Platform,
  MarkdownView,
  setIcon,
  Notice,
  Menu,
  EventRef,
  setTooltip,
} from 'obsidian';
```

`src/view/task-list/task-list-view.ts:1256-1258` (edit-dialog caller):

```ts
      onDelete: () => {
        return this.deleteSavedSearch(search);
      },
```

`src/view/components/saved-search-dialog.ts:22-23` and `:207-218`:

```ts
  /** Called when user deletes (only in edit mode). Return true to close dialog. */
  onDelete?: () => boolean;
```

```ts
if (isEdit && this.options.onDelete) {
  const deleteBtn = buttons.createEl('button', {
    text: 'Delete',
    cls: 'todoseq-saved-search-btn-delete',
  });
  deleteBtn.addEventListener('click', () => {
    const shouldClose = this.options.onDelete?.() ?? false;
    if (shouldClose) {
      this.close();
    }
  });
}
```

`src/view/components/saved-search-dialog.ts:306` — `private close(): void {` is the dialog's only close path; `cancel()` (line 301) calls it.

### The 1.13.0 API (verified in `node_modules/obsidian/obsidian.d.ts`)

- `class ConfirmationModal extends Modal` — `constructor(app: App)` (d.ts:1974); `addButton(cb: (btn: ConfirmationButton) => any): this` (d.ts:1989); `addCancelButton(text?: string): this` (d.ts:1994). Inherited from `Modal`: `setTitle(title: string): this` (d.ts:4538), `setContent(content: string | DocumentFragment): this` (d.ts:4542), `open(): void` (d.ts:4519), `close(): void` (d.ts:4525).
- `ConfirmationButton extends ButtonComponent` — `setButtonText(name: string): this` (d.ts:1381); `onClick(handler: (evt: MouseEvent) => unknown | Promise<unknown>): this` (d.ts:1933). Button-click semantics: the modal auto-closes when the `onClick` handler resolves; returning a truthy value keeps it open.
- **Use `setDestructive()` (d.ts:1366, `@since 1.13.0`) — NOT `setWarning()` (d.ts:1358), which is `@deprecated`** for the destructive delete action.

### Repo conventions that apply

- **Test-driven**: write/update unit tests with the code (AGENTS.md). The pattern file for this view is `tests/task-list-view.test.ts` (`@jest-environment jsdom` pragma, `installObsidianDomMocks()` in `beforeAll`).
- **No `any`**: `@typescript-eslint/no-unsafe-assignment` is `warn` in src; in `tests/**/*.ts` type-checked rules are disabled (eslint.config.js:87-89), so test-only `any` is acceptable.
- **No `console.log`**: use `console.debug` or `console.error`; this change adds none.
- **Format before lint**: `npx prettier --write` on the changed files, then `npm run lint`.
- **Commit style**: conventional commits (e.g. `refactor(settings): migrate to declarative settings API`). Suggested: `refactor(ui): use ConfirmationModal for saved search deletion`.
- `obsidianmd/ui/sentence-case` is disabled repo-wide (eslint.config.js:100), so the `"Delete saved search"` title and content sentence casing are lint-safe.

## Commands you will need

| Purpose      | Command                                                                                                                             | Expected on success                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Typecheck    | `npx tsc -p tsconfig.json --noEmit --skipLibCheck`                                                                                  | exit 0, no errors                       |
| Format       | `npx prettier --write src/view/task-list/task-list-view.ts src/view/components/saved-search-dialog.ts tests/task-list-view.test.ts` | exit 0                                  |
| Lint         | `npm run lint`                                                                                                                      | exit 0                                  |
| Unit tests   | `npm test`                                                                                                                          | all pass (existing 4587 + the new ones) |
| Single tests | `npm test -- --testNamePattern="saved search delete"`                                                                               | new tests pass                          |

(`npm run build` also runs `esbuild`, which rewrites the gitignored `main.js`; the `tsc --noEmit` above is the non-mutating typecheck gate. Do not run `npm run format` repo-wide — it would reformat out-of-scope files.)

## Scope

**In scope** (the only files you should modify):

- `src/view/task-list/task-list-view.ts`
- `src/view/components/saved-search-dialog.ts`
- `tests/task-list-view.test.ts`

**Out of scope** (do NOT touch, even though they look related):

- `src/services/saved-search-manager.ts` — the pure `deleteSavedSearch(settings, id)` manager function (tests/saved-search-manager.test.ts) stays unchanged; only the view's private wrapper changes.
- `src/view/components/search-options-dropdown.ts` — the `SavedSearchCallbacks.onDelete` type is already `(search) => void`; no change needed.
- `src/view/components/saved-search-dialog.ts` — only the `onDelete` contract and the delete-button handler change. **Do not** convert this dialog into an Obsidian `Modal` subclass, do not touch its `<select>` elements, do not rename classes — that is a separate, deferred migration (see "Survey appendix").
- `src/view/components/task-context-menu.ts`, `src/view/components/date-picker-menu.ts`, `src/view/components/base-dialog.ts` — deferred custom-UI work; out of scope.
- `docs/`, `ARCHITECTURE.md`, `CHANGELOG.md` — no doc changes required.

## Git workflow

- Branch: `advisor/002-confirmation-modal-saved-search` (matches the naming of prior plan work; confirm against `git branch --list 'advisor/*'` if any exist).
- One commit for the whole change (S-sized), message: `refactor(ui): use ConfirmationModal for saved search deletion`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add `ConfirmationModal` to the obsidian import in `task-list-view.ts`

Edit the import block at `src/view/task-list/task-list-view.ts:1-12` to include `ConfirmationModal` (keep alphabetical order: insert after `Menu`, before `EventRef`):

```ts
  Menu,
  ConfirmationModal,
  EventRef,
```

**Verify**: `npx tsc -p tsconfig.json --noEmit --skipLibCheck` → exit 0.

### Step 2: Rewrite the private `deleteSavedSearch` to use `ConfirmationModal`

Replace the method body at `task-list-view.ts:1266-1281` with:

```ts
  /**
   * Delete a saved search after confirmation via Obsidian ConfirmationModal
   */
  private deleteSavedSearch(search: SavedSearch, onDeleted?: () => void): void {
    const modal = new ConfirmationModal(this.app);
    modal.setTitle('Delete saved search');
    modal.setContent(
      `Are you sure you want to delete the saved search "${search.name}"?`,
    );
    modal.addButton((btn) => {
      btn.setButtonText('Delete');
      btn.setDestructive();
      btn.onClick(() => {
        removeSavedSearch(this.plugin.settings, search.id);
        void this.plugin.saveSettings();
        this.refreshSavedSearchesInDropdown();
        // Clear active indicator if the deleted search was active
        this.updateSaveSearchBtnVisibility(this.getSearchQuery());
        new Notice(`Saved search "${search.name}" deleted`);
        onDeleted?.();
      });
    });
    modal.addCancelButton();
    modal.open();
  }
```

Notes:

- `this.app` is the `App` from `ItemView` — it is available (the constructor of `ConfirmationModal` requires an `App`).
- The `onDeleted` callback lets the edit dialog close itself only after a confirmed delete (Step 3).
- The `window.confirm` call and the `TODO` comment are removed entirely. After this step, `window.confirm` no longer appears anywhere in `src/` (see Done criteria).

**Verify**: `grep -n "window.confirm" src/view/task-list/task-list-view.ts` → no match. `npx tsc -p tsconfig.json --noEmit --skipLibCheck` → exit 0.

### Step 3: Change `SavedSearchDialog`'s `onDelete` contract and update the edit-dialog caller

In `src/view/components/saved-search-dialog.ts`:

1. Change the option type (lines 22–23) from `() => boolean` to `() => void`, and update the doc comment:

   ```ts
   /** Called when user deletes (only in edit mode). Opens the confirmation flow; dialog is closed by the caller on confirmed delete. */
   onDelete?: () => void;
   ```

2. Replace the delete-button handler (lines 207–218) with:

   ```ts
   if (isEdit && this.options.onDelete) {
     const deleteBtn = buttons.createEl('button', {
       text: 'Delete',
       cls: 'todoseq-saved-search-btn-delete',
     });
     deleteBtn.addEventListener('click', () => {
       this.options.onDelete?.();
     });
   }
   ```

3. Change `private close(): void {` (line 306) to `public close(): void {` so the view can close the dialog after a confirmed delete. (`cancel()` at line 301 is unchanged and still calls `close()`.)

In `src/view/task-list/task-list-view.ts`, update the edit-dialog caller (lines 1256–1258) so the dialog closes only when the delete is confirmed:

```ts
      onDelete: () => {
        this.deleteSavedSearch(search, () => dialog.close());
      },
```

`dialog` is the `SavedSearchDialog` local declared at line 1235 (`const dialog = new SavedSearchDialog({...})`); the closure runs only after `dialog` is assigned, so this is safe.

The dropdown call site at lines 897–899 needs **no change** — `deleteSavedSearch` now returns `void` and the optional `onDeleted` is simply not passed.

**Verify**: `npx tsc -p tsconfig.json --noEmit --skipLibCheck` → exit 0. `grep -n "return this.deleteSavedSearch" src/view/task-list/task-list-view.ts` → no match.

### Step 4: Update the obsidian mock and add unit tests

In `tests/task-list-view.test.ts`:

1. Add a `ConfirmationModal` stub to the `jest.mock('obsidian', ...)` factory (lines 15–45). It must capture the button callback so tests can simulate the confirm click:

   ```ts
   ConfirmationModal: jest.fn().mockImplementation(() => {
     const instance: any = {
       setTitle: jest.fn().mockReturnThis(),
       setContent: jest.fn().mockReturnThis(),
       addButton: jest.fn(function (this: any, cb: (btn: any) => void) {
         const btn: any = {
           setButtonText: jest.fn().mockReturnThis(),
           setDestructive: jest.fn().mockReturnThis(),
           onClick: jest.fn(function (this: any, handler: () => void) {
             this._clickHandler = handler;
             return this;
           }),
         };
         cb(btn);
         this._lastButton = btn;
         return this;
       }),
       addCancelButton: jest.fn().mockReturnThis(),
       open: jest.fn(),
     };
     return instance;
   }),
   ```

2. Add `saveSettings: jest.fn().mockResolvedValue(undefined)` to the shared `pluginMock` object (lines 165–184) — the delete path calls it.

3. Add two `describe` blocks (see "Test plan" for exact cases). The test file does NOT currently import anything from `'obsidian'` — access the mock in each new test like this (put this line at the top of the new `describe` block, or import once at file top):

   ```ts
   const { ConfirmationModal } = jest.requireMock('obsidian') as {
     ConfirmationModal: jest.Mock;
   };
   ```

   To simulate the confirm click on the last modal the view constructed:

   ```ts
   const modal = ConfirmationModal.mock.results.at(-1)!.value;
   modal._lastButton._clickHandler(new MouseEvent('click'));
   ```

**Verify**: `npm test -- --testNamePattern="saved search delete"` → the new tests pass. Then `npm test` → the full suite still passes.

### Step 5: Format, lint, and full verification

1. `npx prettier --write src/view/task-list/task-list-view.ts src/view/components/saved-search-dialog.ts tests/task-list-view.test.ts` → exit 0.
2. `npm run lint` → exit 0, no errors/warnings in the three changed files.
3. `npm test` → all pass.
4. `npx tsc -p tsconfig.json --noEmit --skipLibCheck` → exit 0.

**Verify**: all four commands exit 0.

## Test plan

New tests in `tests/task-list-view.test.ts`, modeled on the existing structure (create the view in `beforeEach`, call private methods via `(view as any).<method>` as existing tests already do with `view['getViewMode']()`).

1. **Direct path — confirmed delete removes the search** (`describe('saved search delete')`):
   - Arrange: a view instance, `pluginMock.settings.savedSearches` seeded with one search via `createBaseSettings({ savedSearches: [createSavedSearch('Agenda', 'state:active')] })` (import `createSavedSearch` from `../src/services/saved-search-manager`, as `saved-search-manager.test.ts` does).
   - Act: `(view as any).deleteSavedSearch(search)`; assert `ConfirmationModal` mock was constructed and `open()` was called; invoke `modal._lastButton._clickHandler(...)`.
   - Assert: `pluginMock.settings.savedSearches` no longer contains the search; `pluginMock.saveSettings` was called; `Notice` was called with `` `Saved search "Agenda" deleted` ``.
   - Also assert the mock `setTitle('Delete saved search')` and `setContent` were called — verifies the dialog content.

2. **Direct path — cancel (no confirm) does nothing**:
   - Act: `(view as any).deleteSavedSearch(search)` but do NOT invoke the captured handler.
   - Assert: `pluginMock.settings.savedSearches` still contains the search; `saveSettings` NOT called.

3. **Edit-dialog integration — confirm closes the dialog and deletes** (regression for the re-wired `onDelete` contract):
   - Arrange: seed one saved search; call `(view as any).openEditSavedSearchDialog(search)` — this renders the real `SavedSearchDialog` DOM (jsdom + `installObsidianDomMocks()` provide `activeDocument.body.createDiv`).
   - Act: click the rendered delete button (`document.querySelector('.todoseq-saved-search-btn-delete')`) via `.click()`; assert the `ConfirmationModal` mock was constructed; invoke the captured `_lastButton._clickHandler(...)`.
   - Assert: `document.querySelector('.todoseq-saved-search-modal')` is `null` (dialog closed via the new `onDeleted` → `dialog.close()` path); search removed from settings; `saveSettings` called.

4. **Edit-dialog integration — cancel keeps both the dialog and the search**: repeat the above but skip the confirm handler; assert `.todoseq-saved-search-modal` is still present and the search remains.

**Verification**: `npm test -- --testNamePattern="saved search delete"` → all pass; `npm test` → full suite green.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc -p tsconfig.json --noEmit --skipLibCheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0; the 4 new tests in `tests/task-list-view.test.ts` exist and pass
- [ ] `grep -rn "window.confirm" src/` returns no matches
- [ ] `grep -rn "TODO use ConfirmationModal" src/` returns no matches
- [ ] `SavedSearchDialogOptions.onDelete` is typed `() => void` and `SavedSearchDialog.close()` is `public`
- [ ] The only files modified are the three in Scope (check `git status`; ignore `main.js` if a build ran — it is gitignored and does not appear)
- [ ] `plans/README.md` status row for 002 updated to `DONE`

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted since this plan was written).
- `ConfirmationModal`, `ConfirmationButton.setDestructive()`, or `ButtonComponent.onClick` are missing from the installed `obsidian` types (they should not be — verified against `node_modules/obsidian/obsidian.d.ts`).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file.
- `dialog.close()` cannot be called from the `onDelete` closure (e.g. `close` was renamed or made private again) — then the edit-dialog contract cannot be satisfied without a larger refactor.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **The `onDelete` contract is now fire-and-forget.** Any future caller of `SavedSearchDialog` in edit mode must pass an `onDelete` that owns the confirmation + dialog closing (the current pattern is `this.deleteSavedSearch(search, () => dialog.close())`). A future caller that forgets the close callback will leave the edit dialog open after deletion.
- **`SavedSearchDialog.close()` is now public** solely so the view can close it post-confirmation. If the dialog is later migrated to an Obsidian `Modal` subclass (see Survey appendix), `onDelete` can stay `() => void` and the view can call the modal's own `close()`.
- **`setDestructive()` (not `setWarning()`)** is deliberate: `setWarning()` is deprecated and the obsidianmd lint rules flag deprecated API usage. If the plugin ever bumps `minAppVersion` below 1.13.0, the whole plugin's settings migration (plan 001) already requires 1.13.0, so this needs no re-gating.
- A reviewer should verify: the two call sites (dropdown at line ~898, edit dialog at line ~1257) both still compile and behave — the dropdown path now shows the confirmation modal too (previously it also called `window.confirm`, so behavior is preserved).
- Follow-up explicitly deferred: migrating `SavedSearchDialog` to an Obsidian `Modal` subclass with `Setting.addDropdown`, and migrating `TaskContextMenu` to Obsidian `Menu` — see the survey appendix; both are larger, independent changes.

## Survey appendix — other places Obsidian menus/dialogs should replace system UI

Requested exploration: "other areas where Obsidian menus and dialogs should be used in place of system menu/dialog." Full sweep of `src/` for native/system UI and hand-rolled Obsidian-UI substitutes:

| Location                                                                                                            | What it uses                                                                                                                                                | Verdict                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/view/task-list/task-list-view.ts:1271`                                                                         | `window.confirm` — the only native system dialog in the plugin                                                                                              | **FIXED by this plan.**                                                                                                                                                                                                                                                                                                                     |
| `src/view/components/search-options-dropdown.ts:180`                                                                | `window.open(DOCS_SEARCH_URL, '_blank')` — opens external docs in a new tab                                                                                 | **Keep.** Browser navigation, not a dialog; no Obsidian equivalent.                                                                                                                                                                                                                                                                         |
| `window.prompt` / `window.alert` / Electron `showOpenDialog` / `showSaveDialog`                                     | —                                                                                                                                                           | **None present.** Nothing to migrate.                                                                                                                                                                                                                                                                                                       |
| `src/view/components/saved-search-dialog.ts`                                                                        | Custom div-based modal (own backdrop, `.todoseq-saved-search-*` styles) with native `<select>` elements; `activeDocument.body.createDiv`                    | **Deferred.** Could be an Obsidian `Modal` subclass with `Setting.addDropdown`, gaining native theming/focus-trap/mobile for free. M-sized; independent of this plan. Deliberately NOT part of plan 002.                                                                                                                                    |
| `src/view/components/task-context-menu.ts:201`                                                                      | Custom context menu (`cls: 'menu todoseq-task-context-menu'`) reimplementing Obsidian `Menu` on `BaseDialog` (positioning, keyboard nav, mobile long-press) | **Deferred (recommend against now).** The plugin already uses Obsidian `Menu` elsewhere (`state-menu-builder.ts:100`, `reader-formatting.ts:2840`, `editor-keyword-menu.ts:40`, `task-list-view.ts:2350`), but this menu's rich item rows (icons, priority flags, nested date-picker launch) make migration L-effort/risk for a working UI. |
| `src/view/components/date-picker-menu.ts`                                                                           | Custom calendar/time/repeat popover                                                                                                                         | **Keep.** Obsidian exposes no public date-picker modal API; there is no system dialog to replace.                                                                                                                                                                                                                                           |
| `src/view/task-list/task-list-view.ts:571,659,715,776` + `saved-search-dialog.ts` + `date-picker-menu.ts:1058,1340` | Native `<select>` elements                                                                                                                                  | **Keep.** `Setting.addDropdown` only applies inside a settings-style `Setting` row; these are in-view controls where native `<select>` is acceptable and accessible.                                                                                                                                                                        |
| `src/view/components/base-dialog.ts` / `base-dropdown.ts`                                                           | Custom dialog/dropdown lifecycle infra                                                                                                                      | **Keep** (foundation for the custom menus above; see verdicts there).                                                                                                                                                                                                                                                                       |
| Already-idiomatic usage                                                                                             | Obsidian `Menu`, `Notice`, `setTooltip`, `setIcon` used across `state-menu-builder`, `task-item-renderer`, `reader-formatting`, `editor-keyword-menu`       | **No change.**                                                                                                                                                                                                                                                                                                                              |

Net: `window.confirm` was the only genuine native/system UI. The rest is custom UI with no Obsidian primitive to adopt cheaply, recorded here so it isn't re-audited.
