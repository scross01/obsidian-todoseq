# Experimental Features

This page documents experimental features in TODOseq. These features are provided for advanced users who want to try cutting-edge functionality, but they come with important caveats.

## ⚠️ Important Disclaimer

**Experimental features may:**

- Not be fully functional or polished
- Have bugs or unexpected behavior
- Be changed significantly or removed entirely in future versions
- Receive limited or no support

Experimental features are provided as-is for users who want to test new capabilities. If you encounter issues with an experimental feature, you can disable it in settings to restore normal operation.

## Org-Mode Support

Org-mode support allows TODOseq to parse tasks from Org-mode files (`.org` extension), enabling you to use your existing Org-mode workflow within Obsidian.

### What It Does

When enabled, TODOseq will:

- Scan all `.org` files in your vault for tasks
- Extract tasks from Org-mode headlines with state keywords
- Display Org-mode tasks alongside Markdown tasks in the Task List
- Support Org-mode priorities, scheduled dates, and deadline dates

### How to Enable

1. Open Obsidian Settings
2. Navigate to "Community plugins" → "TODOseq"
3. Scroll to the "Experimental features" section
4. Enable "Detect tasks in org mode files"

Once enabled, `.org` files will be automatically included in vault scans.

### Supported Syntax

TODOseq recognizes standard Org-mode task syntax:

**Headlines with Keywords:**

```org
* TODO Write documentation
** DONE Review pull requests
*** IN-PROGRESS Fix bugs
```

**Priority Cookies:**

```org
* TODO [#A] Critical security patch
** DOING [#B] Medium priority task
*** TODO [#C] Low priority task
```

**Scheduled and Deadline Dates:**

```org
* TODO [#A] Submit quarterly report
  DEADLINE: <2026-02-15 Sun>

** DOING Review documentation
   SCHEDULED: <2026-02-12 Thu>
```

**Inactive Dates:**

```org
* DONE Completed task
  CLOSED: [2026-02-10 Mon]
```

### Supported Keywords

All default TODOseq keywords are recognized in Org-mode files:

| Incomplete States | Completed States |
| ----------------- | ---------------- |
| `TODO`            | `DONE`           |
| `DOING`           | `CANCELED`       |
| `NOW`             | `CANCELLED`      |
| `LATER`           |                  |
| `WAIT`            |                  |
| `WAITING`         |                  |
| `IN-PROGRESS`     |                  |

Custom keywords defined in TODOseq settings also work with Org-mode files.

### Limitations

The following limitations apply to Org-mode support:

- **Editor styling not supported**: Tasks in `.org` files will not have keyword formatting, priority badges, or date decorations in the editor view
- **Reader view styling not supported**: Org-mode tasks are not visually enhanced in the reader/preview view
- **Vault scanning only**: Tasks are detected during vault scans and appear in the Task List, but in-editor interactions are limited
- **Checkbox synchronization not available**: Org-mode uses headlines, not checkboxes, so checkbox state synchronization does not apply
- **File must have `.org` extension**: Files must use the `.org` extension to be parsed as Org-mode

### Example Org-Mode File

```org
* TODO [#A] Project Planning
  DEADLINE: <2026-03-01 Sun>

** DOING Create project timeline
   SCHEDULED: <2026-02-15 Sat>

** TODO Define milestones

** WAIT Budget approval
   Waiting for finance team response

* DONE Initial research
  CLOSED: [2026-02-10 Mon]
```

### Reporting Issues

If you encounter issues with Org-mode support, please report them on the [GitHub issue tracker](https://github.com/scross01/obsidian-todoseq/issues) with:

- The Org-mode file content (or a sample that reproduces the issue)
- Expected behavior
- Actual behavior
- Whether the issue persists after disabling and re-enabling the feature

## Checkbox Theming

Checkbox theming allows TODOseq to display special checkbox markers in the markdown editor and task lists based on the active Obsidian theme styling to indicate task state visually.

### What It Does

When enabled, TODOseq will:

- Use the `- [/]` markdown checkbox format for active tasks in the markdown editor
- Use the `- [-]` markdown checkbox for cancelled tasks in the markdown editor
- Style the checkbox marker based on the task's state
- Apply this formatting to markdown task lines in both editor and preview views

### How to Enable

1. Open Obsidian Settings
2. Navigate to "Community plugins" → "TODOseq"
3. Scroll to the "Experimental features" section
4. Enable "Use extended markdown checkbox styles"

### Requirements

**This feature requires a theme with styled checkboxes.** Most themes will display the checkbox marker with appropriate colors or styles based on task state:

- Incomplete tasks: Typically shown with a standard checkbox icon
- Cancelled tasks: Often shown with a dimmed or cross-marked checkbox

Without a theme that supports checkbox styling, the checkbox markers may appear unstyled or plain text.

### Marker Behavior

The `-` and `/` markers are **only added to updated tasks**. Existing checkbox states in your markdown files remain unchanged until the task's state changes:

- If you have an existing task line: `* [ ] My task`, it will appear as-is until you toggle its state
- When you toggle a task to complete or cancel, the marker updates: `* [-] My task` or `* [/] My task`
- The markers are synchronized with the task's current state in the Task List

### Limitations

The following limitations apply to checkbox theming:

- **Theme dependency**: Checkbox styling relies on your active theme's checkbox CSS
- **Default theme**: Only standard markdown checkbox syntax (`[ ]`, `[x]`) is supported
- **Synced markers**: Markers only appear in the editor when task state changes; existing checkboxes remain unmodified
- **Limited format**: Only `-` (cancelled) and `/` (in-progress) markers are supported; completed tasks use standard `[x]` format

### Example

```markdown
- [/] Review pull requests (in progress)
- [ ] Update documentation (not started)
- [-] Fix bugs (cancelled)
- [x] Deploy to production (completed)
```

## Code File Comment Scanning

Code file comment scanning allows TODOseq to detect tasks from TODO-style comments in programming language files across your vault.

### What It Does

When enabled, TODOseq will:

- Scan code files for registered task keywords found in comments
- Detect tasks in single-line comments (`//`, `#`, `--`) and multi-line comments (`/* */`, `''' ''`)
- Skip keywords inside string literals to reduce false positives
- Display code comment tasks alongside Markdown tasks in the Task List
- Allow state transitions from the Task List (e.g., `TODO → DOING → DONE`)
- Support custom keywords configured in TODOseq settings

### How to Enable

1. Open Obsidian Settings
2. Navigate to "Community plugins" → "TODOseq"
3. Scroll to the "Experimental features" section
4. Enable "Scan code files for comments"

Once enabled, code files will be automatically included in vault scans.

### Supported File Types

| Language   | Extensions                    |
| ---------- | ----------------------------- |
| JavaScript | `.js`, `.jsx`, `.mjs`, `.cjs` |
| TypeScript | `.ts`, `.tsx`, `.mts`         |
| Python     | `.py`                         |
| Ruby       | `.rb`                         |
| Java       | `.java`                       |
| Rust       | `.rs`                         |
| Go         | `.go`                         |
| C          | `.c`, `.h`                    |
| C++        | `.cpp`, `.hpp`, `.cc`, `.cxx` |
| C#         | `.cs`                         |
| Swift      | `.swift`                      |
| Kotlin     | `.kt`, `.kts`                 |
| Shell      | `.sh`, `.bash`, `.zsh`        |
| YAML       | `.yaml`, `.yml`               |
| TOML       | `.toml`                       |
| SQL        | `.sql`                        |
| INI        | `.ini`                        |
| R          | `.r`                          |
| Dockerfile | `.dockerfile`                 |
| PowerShell | `.ps1`, `.psm1`, `.psd1`      |

### Supported Comment Syntax

**Single-line comments:**

```javascript
// TODO: implement error handling
```

```python
# TODO: add input validation
```

```sql
-- TODO: optimize this query
```

**Multi-line comments:**

```javascript
/*
 * TODO: refactor this module
 */
```

```python
"""
TODO: update documentation
"""
```

### Mixed Code and Comments

Tasks on lines with both code and comments are detected:

```javascript
const x = 1; // TODO: handle edge case
```

Keywords inside string literals are **not** detected:

```javascript
const msg = 'TODO: not a task'; // NOT detected
// TODO: actual task                    // detected
const msg2 = `TODO: also not a task`; // NOT detected
```

### Supported Keywords

All default and custom TODOseq keywords are recognized in code comments:

| Incomplete States | Completed States |
| ----------------- | ---------------- |
| `TODO`            | `DONE`           |
| `DOING`           | `CANCELED`       |
| `NOW`             | `CANCELLED`      |
| `LATER`           |                  |
| `WAIT`            |                  |
| `WAITING`         |                  |
| `IN-PROGRESS`     |                  |

Custom keywords added via TODOseq settings (e.g., `FIXME`, `HACK`, `REVIEW`) are also supported.

### Limitations

The following limitations apply to code file scanning:

- **No dates or priorities**: Code comments typically don't have scheduled/deadline dates or priority markers
- **No subtask tracking**: Code comments don't support subtask counting
- **False positives possible**: Keywords in certain string contexts may still be detected; string literal filtering covers standard string syntax across all supported languages

## Markdown Table Tasks

Markdown table tasks allow TODOseq to detect and manage tasks inside markdown table cells, enabling structured task tracking within tables.

### What It Does

When enabled, TODOseq will:

- Detect task keywords (e.g., `TODO`, `DOING`, `DONE`) inside table cells
- Display table tasks in the Task List alongside regular tasks
- Support scheduled and deadline dates stored inline within cells
- Support priority markers (e.g., `[#A]`) inside table cells
- Allow state transitions (e.g., toggling `TODO` to `DONE`) from the Task List
- Style task keywords and dates in both editor and reader views

### How to Enable

1. Open Obsidian Settings
2. Navigate to "Community plugins" → "TODOseq"
3. Scroll to the "Experimental features" section
4. Enable "Parse tasks in Markdown tables"

Once enabled, tasks inside table cells will be automatically detected during vault scans.

### Supported Syntax

Tasks in table cells follow the same keyword syntax as regular tasks:

**Basic tasks:**

```markdown
| TODO fix the bug | DOING review code | DONE deploy |
```

**With priorities:**

```markdown
| TODO [#A] critical fix | DOING [#B] refactor | TODO [#C] cleanup |
```

**With dates (inline):**

Dates are stored inside the cell using `<br>` separators:

```markdown
| TODO write docs<br>SCHEDULED: <2026-03-01> | DOING review PRs<br>DEADLINE: <2026-02-28> |
```

**Combined:**

```markdown
| TODO [#A] ship feature<br>SCHEDULED: <2026-03-01><br>DEADLINE: <2026-03-15> |
```

### How Dates Work

Unlike regular tasks where dates appear on separate lines below the task, table task dates are stored inline within the cell, separated by `<br>` tags. This is a limitation of the table format — there are no separate lines available for date entries.

When you add a scheduled or deadline date via the context menu or date picker, the date is appended to the cell content:

```markdown
| TODO submit report<br>SCHEDULED: <2026-03-01> |
```

### Interacting with Table Tasks

- **Toggle state**: Click the checkbox in the Task List to cycle through states
- **Set dates**: Right-click a table task in the Task List to access the date picker
- **Change priority**: Right-click to access priority options
- **Open source**: Click the task location link to jump to the table in the editor

### Limitations

The following limitations apply to Markdown table tasks:

- **Inline dates only**: Dates are stored within the cell using `<br>` separators, not on separate lines
- **Single-line cells**: Each cell is treated as a single task; multi-line content within a cell is not fully supported
- **No subtask support**: Subtask counting does not apply to table tasks
- **Limited navigation**: The goto task action only located the source table, the specific task cell is not highlighted.

### Example

```markdown
| Task            | Status           | Notes                  |
| --------------- | ---------------- | ---------------------- |
| TODO write docs | DOING review PRs | TODO [#A] ship feature |
| DONE deploy     | CANCELED revert  | WAIT [#B] approval     |
```

### Reporting Issues

If you encounter issues with Markdown table tasks, please report them on the [GitHub issue tracker](https://github.com/scross01/obsidian-todoseq/issues) with:

- The markdown table content (or a sample that reproduces the issue)
- Expected behavior
- Actual behavior
- Whether the issue persists after disabling and re-enabling the feature
