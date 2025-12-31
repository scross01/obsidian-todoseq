# Change Log

## 0.6.1

- Fixed issue with file and path suggestion dropdown not showing new files.
- Fixed issue with file and path search not handing names with hyphens correctly.
- Added dynamic filtering of search keyword dropdown to matching keyword on text input.

## 0.6.0

- Added advanced search keyword filters to match specific task attributes, e.g. `status:TODO` or `priority:high`, and enhanced the search evaluator to support complex queries with AND/OR logic,  negated search terms (`-word`, or `-priority:none`), date ranges (`scheduled:2026-01-01..2026-03-31`), and keyword combinations (e.g. `(status:DOING OR priority:high) AND tag:projectX`).
- Introduced a search suggestion dropdown to provide real-time suggestions as users type their queries.
- Added support for detecting tasks in footnote definitions (e.g., `[^1]: TODO task in footnote`). #4
- Added optional support for collecting tasks inside comment blocks (`%%` syntax). Disabled by default. #2
- Updated the styling for active tasks (DOING/NOW) in the Task View to highlight status vs inactive tasks.
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
