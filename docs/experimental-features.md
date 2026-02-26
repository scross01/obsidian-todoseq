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
3. Scroll to the "Experimental Features" section
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
