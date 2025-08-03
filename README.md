# TODOseq for Obsidian

TODOseq ("to-do-seek") is a lightweight, keyword-based task tracker for Obsidian. It scans your vault for task lines that begin with simple state keywords (e.g., TODO, DOING, DONE) and presents them in a dedicated Task View. It preserves your original Markdown formatting and does not require checkbox syntax. Inspired by [Logseq Tasks](https://docs.logseq.com/#/page/tasks).

![screenshot of obsidian showing the page editor and the TODOseq panel in a separate tab showing the list of tasks found in the vault.](screenshot.png)

*Why use task keyworks instead of markdown checkboxes?*
Personal preference. It can be easiler and quicker to type `TODO`, `DOING` or `DONE` when making notes or journaling than ackwardliy typing `- [ ]` to create a task checkbox.

## Features

- Scans all Markdown files in your vault for lines beginning with a task keyword (e.g., TODO, DOING, DONE, NOW, LATER, WAIT, WAITING, IN-PROGRESS, CANCELED, CANCELLED).
- Supports tasks inside bullet and numbered lists and preserves the original list marker (e.g., "- ", "1. ", "(a) ") on update.
- Displays all detected tasks in a single Task View, sorted by file path and line number.
- Toolbar search field filters tasks live by matching raw text and file path/filename (case-insensitive).
- View modes: Default, Sort completed last, Hide completed (toggle via toolbar icons).
- Update tasks in two ways:
  1. Click the state keyword to cycle it using defined sequences.
  2. Use the checkbox to toggle only between DONE and TODO, saving back to the source file.
- Optional Logseq style priority tokens immediately after the state keyword: [#A] high, [#B] medium, [#C] low. Displayed as badges in the Task View.
- Ignores tasks inside fenced code blocks by default to avoid false positives (configurable in the settings).

## Installation

1) From Obsidian Community Plugins
   - Open Settings → Community plugins → Browse.
   - Search for TODOseq.
   - Install and enable the plugin.

2) Manual (development build)
   - Clone this repository into your vaults .obsidian/plugins directory (folder name can be anything, e.g., todoseq).
   - Run `npm install` and `npm run build` in the repository root.
   - In Obsidian, go to Settings → Community plugins and enable the plugin.

## Quick Start

- Open the TODOseq Task View via the ribbon icon or command palette.
- Click a tasks keyword to cycle its state, or tick the checkbox to toggle TODO/DONE.
- Click a task row (not the checkbox or keyword) to jump to its source file and line.

## How Tasks Are Recognized

A task is a line that starts with optional indentation, an optional list marker, then a keyword and at least one space. Examples:

- `TODO Write documentation`
- `DOING Update sync script`
- `DONE Triage customer feedback`
- `- TODO inside bullet`
- `(a) TODO in parenthesized marker`

Supported keywords by default:

- TODO, DOING, DONE, NOW, LATER, WAIT, WAITING, IN-PROGRESS, CANCELED, CANCELLED.

### Additional Task Keywords

You can add extra capitalised keywords that are treated as tasks. Enter a comma‑separated list under "Additional Task Keywords", for example:

- `FIXME, HACK`

Notes:

- Matching is case-sensitive. Only capitalised forms match.
- Additional Task Keywords are additive; they do not replace or disable default keywords.
- Completion is determined only by the built-in completed states: `DONE`, `CANCELED`, `CANCELLED`.

## Priority Tokens

Add a single priority token immediately after the state keyword:

- `[#A]` = high
- `[#B]` = medium
- `[#C]` = low

Only the first occurrence on the line is recognized for display.
Example:

- `TODO [#A] Ship v1`

## Task View Interactions

The state of a task can be modified directly in the task view. The line is rewritten in the source page preserving indentation, the original list marker (if any), the priority token (if present), and the remaining text.

The task view visually marks tasks as completed when state is DONE, CANCELED, or CANCELLED.

Sorting is stable by path and then line number.

The view refreshes when files are changed or when settings are updated.

**Search**: Use the search field in the toolbar (top of the Task View) to filter tasks as you type.

- Matches against the task’s raw text, the full file path, and the file name (case-insensitive).
- Slash (/) focuses the search field unless you are already typing in another input.
- Escape clears the current search and removes focus.
- The search field expands to fill available toolbar space.

**View modes (toolbar icons)**: Adjust the sort and filter.

- Default: Show all tasks in detected order.
- Sort completed last: Completed tasks are moved to the end of the list; pending tasks remain on top.
- Hide completed: Completed tasks are hidden from the list.

**Checkbox**: Checked means the task is considered completed.

- If you check it, the task is changed to DONE in the source file.
- If you uncheck it, the task is changed to TODO in the source file.

**Keyword click**: Clicking the colored keyword cycles the state using these sequences:

- TODO → DOING → DONE → TODO
- LATER → NOW → DONE
- WAIT or WAITING → IN-PROGRESS → DONE
- CANCELED or CANCELLED → TODO

**Open source location**: Click anywhere on the task row (except the checkbox or keyword) to jump to the exact file and line.

## Settings

**Refresh Interval**: How frequently the vault is scanned for tasks.

**Additional Task Keywords**: Capitalised, comma-separated extra keywords to treat as tasks (not completed). Examples: `FIXME, HACK`. These are additive and do not replace built-in keywords.

**Include tasks inside code blocks**: When enabled, tasks inside fenced code blocks are included. Disabled by default.

## Commands and Ribbon

- Ribbon: Click the "Open TODOseq" icon to open the task view.
- Command Palette: Run "TODOseq: Show TODO tasks" to open the task view.

## Development

Requirements:

- Node.js and npm

Scripts:

- `npm run dev` — run the esbuild bundler in watch mode for development.
- `npm run build` — type-check and build for production.

Contributing:

- Issues and pull requests are welcome. Please describe changes clearly and include steps to reproduce when filing bugs.
