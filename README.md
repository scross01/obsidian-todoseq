# TODOseq for Obsidian

A lightweight task tracker for Obsidian that scans your vault for simple, keyword-based tasks and displays them in a dedicated Task View. It does not require markdown checkboxes; instead, it uses easy-to-type keywords like TODO, DOING, DONE. Inspired by the Task management capability from Logseq. 

## Features
- Scans all Markdown files in your vault for lines that begin with a task keyword (e.g., TODO, DOING, DONE, NOW, LATER, WAIT, WAITING, IN-PROGRESS, CANCELED, CANCELLED).
- Supports tasks inside bullet and numbered lists. Examples:
  - "- TODO write docs", "* DOING refactor", "+ LATER experiment"
  - "1. WAIT update deps", "23) NOW ship", "A. TODO outline", "(a) DONE draft"
  The original list marker (e.g., "- ", "1. ", "(a) ") is preserved when updating.
- Shows all detected tasks in a single Task View, sorted by file path and line number.
- Update tasks in two ways:
  1) Click the state keyword to cycle it using a defined sequence (e.g., TODO -> DOING -> DONE -> TODO).
  2) Use the checkbox to toggle only between DONE and TODO and save that change back to the source file.
- Optional priority tokens immediately after the state keyword: [#A] (high), [#B] (medium), [#C] (low). Displayed as badges in the Task View.
- CANCELED and CANCELLED are treated as completed (checked and styled as completed).
- Ignores tasks inside fenced code blocks (``` or ~~~) by default to avoid false positives. This can be enabled/disbaled in settings.

## Installation
1) From Obsidian’s Community Plugins:
   - Open Settings → Community plugins → Browse.
   - Search for “TODOseq” (or your fork name).
   - Install and enable the plugin.
2) Manual (development build):
   - Clone this repository into your vault’s .obsidian/plugins directory as todo-tracker (or your chosen folder).
   - Run npm install and npm run build in the repository root.
   - In Obsidian, go to Settings → Community plugins and enable the plugin.

## How tasks are recognized
- A task is a line that starts with optional indentation, an optional list marker, then a keyword and at least one space. Examples:
  - TODO Write documentation
  -   DOING Update sync script
  - DONE [#B] Triage customer feedback
  - - TODO inside bullet
  - * DOING inside bullet
  - + LATER inside bullet
  - 1. WAIT numbered list
  - 23) NOW numbered list
  - A. TODO lettered list
  - (a) DONE parenthesized marker
- Supported keywords by default: TODO, DOING, DONE, NOW, LATER, WAIT, WAITING, IN-PROGRESS, CANCELED, CANCELLED.
- You can customize the list of keywords in settings. If you clear the list, the defaults are used at runtime.

## Priority tokens
- Add a single priority token immediately after the state keyword:
  - [#A] = high
  - [#B] = medium
  - [#C] = low
- Only the first occurrence on the line is recognized; any additional tokens are ignored for display.
- Example: TODO [#A] Ship v1

## Task View interactions
- Checkbox
  - Checked means the task is considered completed.
  - Clicking the checkbox:
    - If you check it, the task is changed to DONE in the source file.
    - If you uncheck it, the task is changed to TODO in the source file.
  - The line is rewritten preserving indentation, the original list marker (if any), the priority token (if present), and the remaining text.
- Keyword click
  - Clicking the colored keyword cycles the state using this sequence:
    - TODO -> DOING -> DONE -> TODO
    - LATER -> NOW -> DONE
    - WAIT/WAITING -> IN-PROGRESS -> DONE
    - CANCELED/CANCELLED -> TODO
  - The updated state is written back to the source file with the original list marker preserved.
- Open source location
  - Click anywhere on the task row (except the checkbox or keyword) to jump to the exact file and line.

## Settings
- Refresh Interval: How frequently the vault is scanned for tasks.
- Task Keywords: Customize which keywords are recognized. Leave empty to use defaults.
- Include tasks inside code blocks: When enabled, tasks inside fenced code blocks are included. Disabled by default.

## Notes on completion
- The Task View visually marks tasks as completed when state is DONE, CANCELED, or CANCELLED.
- Sorting is stable by path and then line number.
- The view refreshes when files are changed or when settings are updated.

## Command and Ribbon
- Ribbon: Click the “Open TODO list” icon to open the Task View.
- Command Palette: Run “Show TODO tasks” to open the Task View.

## Credits
- Based on the Obsidian Sample Plugin: https://github.com/obsidianmd/obsidian-sample-plugin/tree/master

## License
- See repository for licensing details.
