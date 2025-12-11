# Change Log

## 0.5.2

- Added new action and keyboard shortcut to toggle the state of the task on the current line in the Markdown editor. Default hotkey `Ctrl-Enter`. #7
- Fixed issue with tasks not being collected when the task content starts with a multibyte character. #6

## 0.5.1

- Fixed issue with tasks not being collected when the task content starts with a #tag

## 0.5.0

- Added support for collecting tasks with language specific comments in code blocks
- Added support to optionally collect tasks in quotes and callouts blocks
- Fixed issue with scheduled or deadline time was not shown.
- Reworked and refactored task parser logic for improved maintainability.

## 0.4.3

- Fixed regression causing the TODOseq panel to steal focus during periodic refresh

## 0.4.2

- Addresses community plugin review feedback

## 0.4.1

- Fixed issue with date parser missing dates with day of week value after the date
- Fixed issue with tasks getting removed when a page renamed or moved

## v0.4.0

- Added collection of tasks where the keyword follows a markdown checkbox, e.g. `- [ ] TODO example task`
- Added support for SCHEDULED: and DEADLINE: dates for tasks following Logseq style
- Updated search input to follow Obsidian styles and theaming
- Added Match Case and Clear Search options
- Added result count showing total and filtered task count
- Added sort options to sort by scheduled/deadline date or priority
- Added styling for tags within the task descriptions

## v0.3.2

- Removes markdown symbols for highlight and math blocks in task display
- Fixed Dependabot alert #1 Obsidian before 0.12.12 does not require user confirmation for non-http/https URLs.

## v0.3.1

- Address ObsidianReviewBot review feedback
- Highlight selected task on page

## v0.3.0

- Added right click (long press on mobile) context menu on keyword to change task state
- Added search field to fitler task list
- Added empty list guidance
- Changed settings behavior for adding additional task keywords
- Refactoring and optimization

## v0.2.1

- Use editor and vault.process to update task lines files

## v0.2.0

- First public release

## v0.1.0

- Initial development
