---
name: TODOseq
description: Obsidian plugin UI design system. Theme-native Operate surface; docs brand lives in docs/DESIGN.md.
---

# Design System: TODOseq (plugin UI)

## Overview

**Scope:** This file governs the **Obsidian plugin UI** — Task List panel, toolbar/search, task rows, context menus, date pickers, editor and reader formatting, embedded task lists, settings and dialogs, and `styles.css`. It is the default design context for coding tasks in this repo.

**Docs/marketing visual system is out of scope here.** The VitePress site uses a separate branded world in [`docs/DESIGN.md`](docs/DESIGN.md). Do not load or apply docs tokens (`--ts-*`, Journal Violet, Inter marketing type) when changing plugin UI.

**Creative North Star: "Theme-native Operate"**

The plugin is a view inside someone else's shell. It inherits fonts, density, accent, hover, focus, and surface language from the active Obsidian theme. Brand lives in precise task affordances — keyword state, priority, dates, subtask progress — not in a second product palette.

Aesthetic philosophy: **Obsidian-native, scanable, and quiet under load.** Prefer Obsidian patterns (search chrome, menus, tooltips, tags, settings rows) over invented components. TODOseq-specific UI must still read as Obsidian components that happen to understand keywords.

**Key Characteristics:**

- Color, type, radius, and spacing come from Obsidian CSS variables — never fixed brand hexes
- Search mirrors Obsidian search conventions (input chrome, clear, match-case, suggestions, history)
- Context menus use `BaseDialog` (intended shell) with Obsidian `.menu` visual language: icons, keyboard nav, single instance, mobile long-press
- Task list is dense, scannable, and performance-minded (`content-visibility`, chunked render)
- Unique features (keywords, priorities, dates, subtask progress) are theme-native tokens, not marketing chips
- Desktop and mobile both first-class

**The Two-World Rule.** Never port docs brand chrome into the plugin. Inside Obsidian, accent is always the user's theme (`--interactive-accent`).

**The Theme-Variable Rule.** Plugin CSS references Obsidian variables (with safe fallbacks only where a variable may be absent). Never inject Journal Violet or docs `--ts-*` tokens into `styles.css`.

**The No-Second-Accent Rule.** Accent in plugin chrome is `--interactive-accent`. Keyword color follows the theme; it is not a fixed TODO/DOING/DONE marketing palette.

## Colors

Palette character: **whatever the user's theme is.** TODOseq does not define a brand palette inside Obsidian. Frontmatter omits fixed color tokens on purpose — they would contradict theme inheritance.

### Authority tokens (use these; do not hardcode hex)

| Role                       | Obsidian variable                                                                   | Plugin use                                                    |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Body text                  | `--text-normal`                                                                     | Task text, titles                                             |
| Secondary text             | `--text-muted`                                                                      | File paths, dates, completed text, meta                       |
| Interactive accent         | `--interactive-accent` (fallback `#7f6df2`)                                         | Keywords, medium priority, focus rings, active accents        |
| On-accent text             | `--text-on-accent`                                                                  | Filled accent badges                                          |
| Link                       | `--link-color`                                                                      | In-text task links                                            |
| Hover / active / selection | `--background-modifier-hover` / `--active` / `--selection`                          | Row hover, pressed states                                     |
| Borders                    | `--background-modifier-border`                                                      | Separators, dashed empty states                               |
| Focus border               | `--background-modifier-border-focus`                                                | Keyboard focus outlines                                       |
| Surfaces                   | `--background-primary` / `--background-secondary`                                   | Panel, drag overlay, embedded list well                       |
| Semantic                   | `--color-red`, `--color-orange`, `--color-green`, `--error-color`, `--text-warning` | Overdue / today / soon dates, priority A, settings validation |
| Tags                       | `--tag-background`, `--tag-color`, `--tag-radius`, …                                | Task tags inherit full Obsidian tag chip styling              |

### TODOseq semantic mapping (theme-native)

- **State keywords** (panel, editor, reader): bold, `--interactive-accent`; hover underline + `--background-modifier-hover`
- **Priority A / B / C badges:** A `--color-red`, B `--interactive-accent`, C muted border + `--text-muted`
- **Date rails:** 3px left border + low-alpha `color-mix` fill — overdue red, today orange, soon green, closed muted
- **Completed tasks:** `--text-muted` + line-through; archived slightly dimmer
- **Active-task checkbox tint:** `color-mix` of `--interactive-accent` (~33%)

### Named Rules

**The Theme-Variable Rule.** (See Overview.) Prefer an Obsidian variable over a literal.

**The No-Hardcoded-Brand Rule.** No Journal Violet, no `#6D28D9` / `#7C3AED` brand pair, no `--ts-*` in plugin styles or view chrome.

## Typography

**Font authority:** Active theme — `--font-text`, `--font-text-size`, `--font-ui-small`, `--font-smallest`, `--font-monospace` / `--font-mono`, `--font-normal` / `--font-medium` / `--font-semibold` / `--font-bold`. Do not load Inter or any CDN face in the plugin.

**Character:** Editor-adjacent list density. Task body uses editor text metrics; chrome and meta use UI/small sizes. Keywords slightly smaller than body (~0.85–0.9rem) so they read as state tokens, not headings.

### Hierarchy

- **Task title:** `--font-text` / `--font-text-size`; completed muted + strike
- **Keyword:** bold, accent, ~0.85–0.9rem; heading keywords scale to 0.9em of heading size
- **File info / date meta / subtask progress:** ~0.75–0.8rem, `--text-muted` or mono for counts
- **Priority badge:** ~0.7em, `--font-medium`
- **Empty state:** title `--font-bold` 1rem; subtitle 0.875rem muted
- **Settings messages:** 0.7rem; error / warning / info use theme semantic colors

### Named Rules

**The Inherit-Type Rule.** Never override theme font stacks. Size and weight may be tuned; family does not change.

## Layout

Spatial model is **Obsidian panel + editor page**, not a web marketing grid.

- **Task List panel:** flex column, full height; toolbar on top; scrollable list (`overflow-y: auto`) below
- **Main-tab mode:** page margins from `--file-margins`; optional readable line length caps toolbar + list at `700px` centered
- **Task row:** relative row, hover fill via `::before`, hairline separator via `::after`; virtualization-friendly (`content-visibility: auto`)
- **Embedded lists:** well with `--background-secondary`, `--code-radius`, 1px border; lives in note context, not a floating brand card
- **Density:** Obsidian size scale (`--size-2-*`, `--size-4-*`); mobile rows get larger hit targets and suppress text selection / callouts
- **Drag:** opacity on dragged row; fixed overlay chip using `--background-secondary` + menu shadow, not docs media lift

## Elevation & Depth

Depth is **tonal and theme-native**: hover/active/selection backgrounds, 1px borders, and Obsidian menu/dialog elevation where the shell already provides it. Avoid large marketing-style drop shadows on task rows or list wells. Small functional shadows are allowed only when they match existing menu/drag affordances (e.g. drag overlay).

## Shapes

Corner language follows theme radii: `--radius-s` (rows, badges, chips), `--radius-l` / `--input-radius` (dialogs, inputs), `--code-radius` (embedded well), `--tag-radius` (tags). Borders are `--background-modifier-border` hairlines. Empty state may use a dashed border — functional, not decorative.

## Components

### Search (Obsidian-consistent)

Search is a first-class Operate surface and must **feel like Obsidian search**, not a custom web filter bar.

- **Input chrome:** reuse Obsidian classes (`search-input-container`, `global-search-input-container`, `search-input-clear-button`) so theme, focus, and clear affordances match core search
- **Labeling:** visible or `sr-only` label; `aria-label` on icon-only controls (clear, save search, match case, settings)
- **Match case / clear / options:** icon buttons in the input or immediately adjacent; tooltips via Obsidian `setTooltip`
- **Suggestions:** dropdown under the field (`--layer-menu`), grouped like search suggest (options / history / saved); selected and hovered rows use `--background-modifier-hover`; truncation on long titles
- **Saved searches + history:** bookmark affordance; apply/edit/delete without leaving the panel
- **Feedback:** results count bar (`N of M tasks`); invalid query shows a short error without restyling the whole panel
- **Behavior:** debounced filter (~250ms), Enter applies immediately, mobile keyboard `search` event supported
- **Don't** invent a brand-colored search pill or floating glass filter UI

### Task list rows

- Hover: `--background-modifier-hover` on a rounded inset layer
- Focus: `--background-modifier-border-focus` or accent outline with offset
- Separator: 1px `--background-modifier-border` inset under the row
- Checkbox: native/theme checkbox alignment; active tint via accent `color-mix`
- Keyword: clickable state control (not a static badge); keyboard focus ring in accent
- Meta line: path + line, source chip (org/code) in mono at reduced opacity
- Priority / tags / dates / subtask progress: compact secondary affordances on the row, not marketing chips
- Empty state: dashed well, short title + guidance subtitle, theme surfaces only

### Context menus

- **Shell is `BaseDialog` on purpose.** Obsidian's `Menu` API cannot express the needed UX (icon rows, date shortcuts, nested pickers, keyboard model, mobile long-press density). `BaseDialog` is the intended enhancement over base Obsidian capabilities — **not** tech debt to migrate to `Menu`.
- Still **theme-native**: render as `.menu` / `.menu-item` visual language, Obsidian spacing/focus/hover vars, not a web-app card
- Icon + label rows; priority A/B/C use semantic colors on icon buttons
- Date shortcuts (Today, Tomorrow, Next week, weekend, clear) then a full date picker submenu/dialog
- Keyboard: Escape closes, arrows/Enter select; single open menu at a time
- Mobile: long-press opens the same menu; larger hit targets under `.is-mobile`
- Focus styles match plugin focus language (`:focus-visible` / `.is-focused`)

### Editor & reader formatting

- Keywords: bold + `--interactive-accent`; source mode stays simpler (no size jump)
- Completed / archived: strike + muted opacity; archived slightly dimmer without inventing a new gray
- Date lines (`SCHEDULED` / `DEADLINE` / `CLOSED` / `STARTED`): muted, ~0.9rem, keyword vs value weight split
- Smart-date highlight: low-alpha accent fill + thin outline — a temporary cursor cue, not a brand marker
- Never recolor note prose beyond task-related tokens

### Embedded task lists

- Container reads as a code-block sibling: secondary background, theme border, `--code-radius`
- Header chips for active search/sort/completed/future/limit use selection background + mono
- Rows match panel hover/active language
- Truncation footer stays muted and quiet

### Settings & dialogs

- Use Obsidian Setting API rows, toggles, textareas
- Validation: `--error-color` border on invalid inputs; warning/info messages in theme semantic colors at small size
- Dialogs inherit theme modal chrome; do not re-skin with docs cards

## Do's and Don'ts

### Do:

- **Do** style everything with Obsidian theme variables and component classes first; add TODOseq-specific CSS only for task semantics the shell does not provide.
- **Do** keep search consistent with Obsidian search UX (input classes, clear, match case, suggestions, history, saved searches).
- **Do** keep context menus on the intentional `BaseDialog` shell, styled as Obsidian `.menu` (icons, keyboard nav, mobile long-press).
- **Do** preserve theme under custom themes and light/dark — including accent, tags, hover, and focus.
- **Do** prioritize scanability and performance in the Task List (density, virtualization-friendly rows, no heavy shadows).
- **Do** test desktop and mobile (`.is-mobile`) behaviors for any new interactive chrome.

### Don't:

- **Don't** hardcode Journal Violet or any `--ts-*` docs token in plugin CSS.
- **Don't** paint task UI with fixed marketing hexes for TODO/DOING/DONE.
- **Don't** invent non-Obsidian search/filter chrome or web-app card shells inside the panel.
- **Don't** break mobile: no hover-only affordances, no tiny targets, no desktop-only overlays without `.is-mobile` handling.
- **Don't** restyle native editor chrome beyond task keyword/date decorations.
- **Don't** apply docs-site composition rules (CTA hierarchy, media lift, Inter display type) to plugin UI.

### Boundary checklist (any plugin UI change)

1. Confirm this is plugin surface (`styles.css`, `src/view/**`, settings UI) — not `docs/`.
2. Does Obsidian already have a variable or component for this? Reuse it.
3. Would this look correct under a non-default theme and on mobile? If not, fix before shipping.
4. Docs screenshots must show this real theme-native UI — never a branded mock (see [`docs/DESIGN.md`](docs/DESIGN.md)).
