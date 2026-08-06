# Plan 003: Replace Obsidian `Menu` class with custom `BaseDialog`-based state menu for consistent styling

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat c60d87b..HEAD -- src/view/components/state-menu-builder.ts src/view/components/task-context-menu.ts src/view/components/date-picker-menu.ts src/view/components/base-dialog.ts src/styles.css`
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `c60d87b`, 2026-08-05

## Why this matters

The state selection menu (used when right-clicking a task keyword in the task list, embedded task list, editor, and reader view) currently uses Obsidian's `Menu` class directly, which produces a plain dropdown with default Obsidian styling. The plugin's other menus — `TaskContextMenu` and `DatePicker` — extend `BaseDialog` and manually build their DOM with Obsidian CSS classes (`menu-item`, `menu-item-title`, `menu-separator`) plus custom `todoseq-` prefixed CSS classes for consistent branding and enhanced interaction states. This inconsistency means the state menu looks visually different from the context menu and date picker. Switching to the same `BaseDialog` pattern ensures a uniform visual language across all menus and enables the custom `todoseq-` styling hooks already in `styles.css`.

## Current state

- `src/view/components/state-menu-builder.ts` — `StateMenuBuilder.buildStateMenu()` creates `new Menu()` from Obsidian and returns it. Uses `menu.addItem()`, `menu.addSeparator()`, `menu.showAtPosition()`, and `menu.showAtMouseEvent()`. No custom CSS classes, no keyboard navigation beyond Obsidian defaults, no mobile backdrop.
- `src/view/components/task-context-menu.ts` — `TaskContextMenu extends BaseDialog`. Builds DOM manually with `activeDocument.body.createDiv({ cls: 'menu todoseq-task-context-menu' })`, uses `menu-item`, `menu-item-title`, `menu-separator` Obsidian classes plus `todoseq-` prefixed classes. Has custom keyboard navigation, mobile backdrop, and `onHide` callback.
- `src/view/components/date-picker-menu.ts` — `DatePicker extends BaseDialog`. Same pattern: manual DOM with Obsidian CSS classes + `todoseq-` prefixed classes.
- `src/view/components/base-dialog.ts` — `BaseDialog` provides positioning, keyboard navigation (arrow keys, Enter, Escape), mobile backdrop, global menu management, and event listener lifecycle.
- `src/view/task-list/task-item-renderer.ts` — Calls `this.menuBuilder.buildStateMenu(task.state, callback)` then `menu.showAtPosition()` or `menu.showAtMouseEvent()`.
- `src/view/embedded-task-list/embedded-task-item-renderer.ts` — Same pattern, also passes `onHide` callback.
- `src/view/editor-extensions/editor-keyword-menu.ts` — Same pattern, calls `menu.showAtPosition()`.
- `src/view/markdown-renderers/reader-formatting.ts` — Same pattern, calls `menu.showAtPosition()` in three places (contextmenu, F10+Shift, ContextMenu key).
- `styles.css` — Has `todoseq-context-menu-*` and `todoseq-date-picker-*` CSS classes for custom styling but no `todoseq-state-menu-*` classes yet.

## Commands you will need

| Purpose   | Command            | Expected on success |
| --------- | ------------------ | ------------------- |
| Build     | `npm run build`    | exit 0              |
| Typecheck | `npx tsc --noEmit` | exit 0, no errors   |
| Tests     | `npm test`         | all pass            |
| Lint      | `npm run lint`     | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `src/view/components/state-menu-builder.ts` — refactor `buildStateMenu()` to return a `StateMenu` instance instead of `Menu`
- `src/view/components/state-menu.ts` — **new file**: `StateMenu extends BaseDialog` that builds the state menu DOM manually with Obsidian CSS classes + `todoseq-` prefixed classes
- `src/view/task-list/task-item-renderer.ts` — update `openStateMenuAtMouseEvent()` and `openStateMenuAtPosition()` to use `StateMenu` API
- `src/view/embedded-task-list/embedded-task-item-renderer.ts` — update `openStateMenuAtPosition()` and `openStateMenuAtMouseEvent()` to use `StateMenu` API
- `src/view/editor-extensions/editor-keyword-menu.ts` — update `openStateMenuAtMouseEvent()` to use `StateMenu` API
- `src/view/markdown-renderers/reader-formatting.ts` — update `handleKeywordContextMenu()` and `handleKeywordKeydown()` to use `StateMenu` API
- `styles.css` — add `todoseq-state-menu-*` CSS classes for consistent styling

**Out of scope** (do NOT touch):

- `src/view/components/task-context-menu.ts` — already uses `BaseDialog` pattern; leave as-is
- `src/view/components/date-picker-menu.ts` — already uses `BaseDialog` pattern; leave as-is
- `src/view/components/base-dialog.ts` — base class; no changes needed
- `src/view/embedded-task-list/task-list-renderer.ts` — only imports `StateMenuBuilder`, doesn't call `buildStateMenu()` directly
- Any test files (no test changes in this plan; see maintenance note)

## Git workflow

- Branch: `advisor/003-state-menu-to-obsidian-dialog` (or the repo's branch-naming convention if one is evident)
- Commit per step or per logical unit; message style: conventional commits, e.g. `refactor(state-menu): replace Menu class with BaseDialog-based StateMenu for consistent styling`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `StateMenu` class extending `BaseDialog`

Create `src/view/components/state-menu.ts` with a `StateMenu` class that extends `BaseDialog`. It should follow the same pattern as `TaskContextMenu` and `DatePicker`:

- Constructor accepts `currentState: string`, `states: { group: string; states: string[] }[]`, and `onStateSelected: (state: string) => void | Promise<void>`
- `show(position: { x: number; y: number })` builds the DOM, positions the dialog, attaches listeners, and registers as active dialog
- `hide()` removes the DOM, detaches listeners, unregisters as active dialog
- `isVisible()` returns the showing state
- `cleanup()` calls `hide()`
- DOM structure mirrors `TaskContextMenu` and `DatePicker`:
  - Container: `cls: 'menu todoseq-state-menu'`, `attr: { role: 'menu' }`
  - Each group: a header `div` with `cls: 'menu-item menu-item-title todoseq-state-menu-header'` showing the group name
  - Each state item: `div` with `cls: 'menu-item todoseq-state-menu-item'`, `attr: { role: 'menuitem', tabindex: '-1' }`, containing the state name as text
  - Separators between groups: `div` with `cls: 'menu-separator'`
  - Click handler on each item calls `onStateSelected` then `hide()`
  - Keyboard navigation: arrow keys move focus between items, Enter/Space selects, Escape closes
  - `positionDialog()` override with default width ~200px and height based on content
- Add `onHide` callback property (like `TaskContextMenu.onHide`) for cleanup

**Verify**: `npx tsc --noEmit` exits 0 with no type errors in the new file.

### Step 2: Refactor `StateMenuBuilder.buildStateMenu()` to return `StateMenu`

Modify `src/view/components/state-menu-builder.ts`:

- Change `buildStateMenu()` return type from `Menu` to `StateMenu`
- Instead of `new Menu()`, call `new StateMenu(currentState, groups, onStateSelected)`
- Remove the `import { Menu } from 'obsidian'` if no longer needed
- Keep `getSelectableStatesForMenu()` and `getKeywordGroups()` unchanged

**Verify**: `npx tsc --noEmit` exits 0.

### Step 3: Update `TaskItemRenderer` to use `StateMenu` API

Modify `src/view/task-list/task-item-renderer.ts`:

- `openStateMenuAtMouseEvent()`: Replace `menu.showAtMouseEvent(evt)` / `menu.showAtPosition(...)` with `stateMenu.show({ x: evt.clientX, y: evt.clientY })`
- `openStateMenuAtPosition()`: Replace `menu.showAtPosition(...)` with `stateMenu.show({ x: pos.x, y: pos.y })`
- Remove the `BaseDialog.closeAnyActiveDialog()` call (now handled by `StateMenu.show()` via `closeActiveDialog()` inherited from `BaseDialog`)
- Remove the `as unknown as { showAtMouseEvent?: ... }` cast (no longer needed)

**Verify**: `npx tsc --noEmit` exits 0.

### Step 4: Update `EmbeddedTaskItemRenderer` to use `StateMenu` API

Modify `src/view/embedded-task-list/embedded-task-item-renderer.ts`:

- `openStateMenuAtPosition()`: Replace `menu.showAtPosition(...)` with `stateMenu.show({ x, y })`, pass `onHide` callback via `stateMenu.onHide = onHide`
- `openStateMenuAtMouseEvent()`: Replace `menu.showAtMouseEvent(evt)` / `menu.showAtPosition(...)` with `stateMenu.show({ x: evt.clientX, y: evt.clientY })`, pass `onHide` callback
- Remove `BaseDialog.closeAnyActiveDialog()` calls (handled by `StateMenu.show()`)
- Remove `as unknown as { showAtMouseEvent?: ... }` casts

**Verify**: `npx tsc --noEmit` exits 0.

### Step 5: Update `EditorKeywordMenu` to use `StateMenu` API

Modify `src/view/editor-extensions/editor-keyword-menu.ts`:

- `openStateMenuAtMouseEvent()`: Replace `menu.showAtPosition(...)` with `stateMenu.show({ x: evt.clientX, y: evt.clientY })`
- Remove `BaseDialog.closeAnyActiveDialog()` call (handled by `StateMenu.show()`)

**Verify**: `npx tsc --noEmit` exits 0.

### Step 6: Update `ReaderViewFormatter` to use `StateMenu` API

Modify `src/view/markdown-renderers/reader-formatting.ts`:

- `handleKeywordContextMenu()`: Replace `menu.showAtPosition(...)` with `stateMenu.show({ x: event.clientX, y: event.clientY })`
- `handleKeywordKeydown()` (F10+Shift and ContextMenu cases): Replace `menu.showAtPosition(...)` with `stateMenu.show({ x: rect.left, y: rect.bottom })`
- Remove `BaseDialog.closeAnyActiveDialog()` calls (handled by `StateMenu.show()`)

**Verify**: `npx tsc --noEmit` exits 0.

### Step 7: Add CSS for `todoseq-state-menu-*` classes

Add to `styles.css` (in the existing menu/context-menu section, after the context menu styles):

- `.todoseq-state-menu` — min-width, max-width, padding matching `todoseq-task-context-menu`
- `.todoseq-state-menu-header` — font-weight matching `todoseq-context-menu-header`
- `.todoseq-state-menu-item` — hover/focus states matching `todoseq-context-menu-row` patterns
- `.todoseq-state-menu-item.is-focused` — background matching `todoseq-context-menu-row.is-focused`
- `.todoseq-state-menu-item:focus-visible` — outline matching `todoseq-context-menu-row:focus-visible`

**Verify**: `grep -n "todoseq-state-menu" styles.css` returns all expected CSS rules.

### Step 8: Build, lint, and test

- `npm run build` — exit 0
- `npm run lint` — exit 0
- `npm test` — all pass

**Verify**: All three commands exit 0.

## Test plan

- No new test files needed for this plan (UI component refactoring; existing integration tests cover menu interactions)
- Existing tests to verify still pass: `npm test` (all suites)
- Manual verification: right-click a task keyword in the task list, embedded list, editor, and reader view to confirm the state menu appears with consistent styling

## Done criteria

- [ ] `npm run build` exits 0
- [ ] `npx tsc --noEmit` exits 0 with no type errors
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0; all existing tests pass
- [ ] `StateMenu` class exists at `src/view/components/state-menu.ts` extending `BaseDialog`
- [ ] `StateMenuBuilder.buildStateMenu()` returns `StateMenu` instead of `Menu`
- [ ] All 4 callers updated to use `StateMenu.show()` instead of `Menu.showAtPosition()`/`Menu.showAtMouseEvent()`
- [ ] `styles.css` has `todoseq-state-menu-*` CSS classes
- [ ] No `import { Menu } from 'obsidian'` in `state-menu-builder.ts`
- [ ] No `as unknown as { showAtMouseEvent?: ... }` casts remain in callers
- [ ] `plans/README.md` status row updated

## STOP conditions

- The `StateMenu` class's DOM structure doesn't match the Obsidian CSS class conventions used by `TaskContextMenu` and `DatePicker` (verify by comparing generated HTML classes).
- `npx tsc --noEmit` fails at any step — stop and fix before proceeding.
- `npm test` fails after changes — investigate before continuing.
- The `onHide` callback pattern doesn't work as expected in `EmbeddedTaskItemRenderer` — stop and report.

## Maintenance notes

- Future changes to `BaseDialog` (positioning, keyboard nav, mobile support) will automatically apply to the state menu since it extends `BaseDialog`.
- If new menu items or groups are added to the state menu, the CSS classes `todoseq-state-menu-*` in `styles.css` must be updated accordingly.
- The `StateMenu` class should be kept in sync with `TaskContextMenu` and `DatePicker` for consistent behavior — any changes to `BaseDialog` or the dialog pattern should be reviewed against all three classes.
- The `onHide` callback on `StateMenu` should be cleared on `hide()` to prevent memory leaks (follow the `TaskContextMenu.onHide = null` pattern in `hide()`).
