# Change Log

## 0.9.0

- Added task keyword styling in the reader view with interactive state updates. #22
- Added new embedded task lists to add customer filtered lists with a page. #21
- Centralized task state management across all views (task list view, page editor, page reader).
- Fixed issues with changing settings not updating task collection and display.
- Fixed task selection navigation for consistent behavior with cmd-/ctrl- and shift- select modifiers.
- Fixed file change handling check to honor the global excludes settings, improves startup performance.

## 0.8.1

- Added new "Cycle task state" command, similar to the "Toggle task state" but also works on non-task lines to add the TODO task keyword, and the final transition from DONE removes the task keyword rather than cycling stright back to TODO. i.e. "no keyword" -> TODO -> DOING -> DONE -> "no keyword". #20

## 0.8.0

- Scanning for tasks now honors the vaults "Excluded files" setting.
- Added new Urgency sort option that applies a multi-factor algorithm to calculate task urgency (see docs).
- Added task view option to limit or hide display of future dated tasks.
- Added new settings option to persist the preferred task list sort.
- Added new "Rescan vault" action to command palette.
- Updated styling of completed tasks in editor view to striketrough the full task line.
- Updated vault scanner to use cached reads when collecting tasks.
- Reorganized settings using Obsidian 1.11's new Setting Groups for better organization.

## 0.7.0

This release introduces formatting and interactivity for tasks in the editor view. Task state keywords are now highlighted automatically and can be interacted with to update the taske atate similar to the task list view. The default location of the task list panel has been moved to the right sidebar. New actions have been added to the command palette to add scheduled and deadline dates to tasks and set priority.

- Addded task formatting in the editor with settings option to disable (enabled by default).
- Added a right click option on the task keyword in the editor to change the state of the task.
- Added a single click action to the task keyword in the editor to cycle through the task states (TODO -> DOING -> DONE).
- Added task state update when a task checkbox is toggled in the editor.
- Added auto completion helpers for entering scheduled and deadline dates.
- Added command palette commands to add scheduled and deadline dates to tasks.
- Added command palette commands to set task priority.
- Moved the default location of the task list panel to the right sidebar.
- Refined the task count and search suggestions when completed tasks are hidden.
- Added status bar entry to show task count (not completed tasks) for the current page.

## 0.6.2

- Fixed issue with custom keywords not shown in search suggestions. #12
- Fixed issue with search suggestions dropdown not being removed on focus change. #16
- Fixed selected task not always scrolled into view in the editor. #14

## 0.6.1

- Fixed issue with file and path suggestion dropdown not showing new files.
- Fixed issue with file and path search not handing names with hyphens correctly.
- Added dynamic filtering of search keyword dropdown to matching keyword on text input.

## 0.6.0

- Added advanced search keyword filters to match specific task attributes, e.g. `status:TODO` or `priority:high`, and enhanced the search evaluator to support complex queries with AND/OR logic, negated search terms (`-word`, or `-priority:none`), date ranges (`scheduled:2026-01-01..2026-03-31`), and keyword combinations (e.g. `(status:DOING OR priority:high) AND tag:projectX`).
- Introduced a search suggestion dropdown to provide real-time suggestions as users type their queries.
- Added support for detecting tasks in footnote definitions (e.g., `[^1]: TODO task in footnote`). #4
- Added optional support for collecting tasks inside comment blocks (`%%` syntax). Disabled by default. #2
- Updated the styling for active tasks (DOING/NOW) in the Task List to highlight status vs inactive tasks.
- Added plugin usage documentation in the /docs folder.
- Fixed potential security ReDoS vulnerability in regex parsing
- Improved custom keyword validation to prevent invalid characters in keyword names.

## 0.5.2

- Added new action and keyboard shortcut to toggle the state of the task on the current line in the Markdown editor. Default hotkey `Ctrl-Enter`. #7
- Fixed issue with tasks not being collected when the task content starts with a multibyte character. #8

## 0.5.1

- Fixed issue with tasks not being collected when the task content starts with a #tag

## 0.5.0

- Added support for collecting tasks with language specific comments in code blocks
- Added support to optionally collect tasks in quotes and callouts blocks
- Fixed issue where scheduled or deadline time was not shown.
- Reworked and refactored task parser logic for improved maintainability.

## 0.4.3

- Fixed regression causing the TODOseq panel to steal focus during periodic refresh

## 0.4.2

- Addresses community plugin review feedback

## 0.4.1

- Fixed issue with date parser missing dates with day of week value after the date
- Fixed issue with tasks getting removed when a page renamed or moved

## 0.4.0

- Added collection of tasks where the keyword follows a markdown checkbox, e.g. `- [ ] TODO example task`
- Added support for SCHEDULED: and DEADLINE: dates for tasks following Logseq style
- Updated search input to follow Obsidian styles and theming
- Added Match Case and Clear Search options
- Added result count showing total and filtered task count
- Added sort options to sort by scheduled/deadline date or priority
- Added styling for tags within the task descriptions

## 0.3.2

- Removes markdown symbols for highlight and math blocks in task display
- Fixed Dependabot alert #1 Obsidian before 0.12.12 does not require user confirmation for non-http/https URLs.

## 0.3.1

- Address ObsidianReviewBot review feedback
- Highlight selected task on page

## 0.3.0

- Added right click (long press on mobile) context menu on keyword to change task state
- Added search field to filter task list
- Added empty list guidance
- Changed settings behavior for adding additional task keywords
- Refactoring and optimization

## 0.2.1

- Use editor and vault.process to update task lines files

## 0.2.0

- First public release

## 0.1.0

- Initial development
