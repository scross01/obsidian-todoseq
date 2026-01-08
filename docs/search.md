# Search Functionality

The search field in the TODOseq Task List provides a powerful search system that allows you to quickly find and filter tasks across your entire vault. This guide covers all aspects of the search functionality, from basic filtering to advanced query syntax.

## Basic Search

### Search Field Overview

The search field is located in the Task List toolbar and provides live filtering as you type. Basic search matches the entered text against task text, file path, and filename

### Search Shortcuts

**Focus Search Field:**

- Press `/` to focus the search field (unless already typing in another input)

**Clear Search:**

- Press `Escape` to clear the current search and remove focus

**Toggle Case Sensitivity:**

- Click the "A/a" button in the toolbar to toggle case-sensitive matching

## Advanced Search Syntax

TODOseq supports sophisticated search queries with boolean logic and grouping.

### Exact Phrase Search

Use double quotes to search for exact phrases:

```txt
"write documentation"
```

This will only match tasks containing the exact sequence "write documentation".

### OR Logic

Use `OR` to match either term:

```txt
meeting OR call
```

This will match tasks containing "meeting" OR "call".

### AND Logic (Implicit)

Multiple terms without operators use implicit AND:

```txt
meeting work
```

This will match tasks containing BOTH "meeting" AND "work".

### Exclusion (NOT Logic)

Use `-` to exclude terms:

```txt
meeting -personal
```

This will match tasks containing "meeting" but NOT "personal".

### Grouping with Parentheses

Use parentheses for complex expressions:

```txt
(meeting OR call) -personal
```

This will match tasks containing "meeting" OR "call" but NOT "personal".

### Multiple Exclusions

You can exclude multiple terms:

```txt
project -personal -home
```

This will match tasks containing "project" but excluding both "personal" and "home".

### Advanced Search Examples

```txt
"send email" (projectX OR projectY) -external
```

Find "send email" tasks that mentions either "projectX" or "projectY" but excludes "external".

```txt
(meeting OR call) project -weekend
```

Find project-related meetings or calls that don't mention "weekend".

```txt
work (home OR office) -phone
```

Find work tasks related to home or office, excluding phone related ones.

## Prefix Filters

TODOseq supports filters keywords similar to Obsidians general vault search for targeted searching.

### Available Prefix Filters

| Prefix | Description | Example |
| ------ | ----------- | ------- |
| `path:` | Find tasks in specific file paths | `path:Journal` |
| `file:` | Find tasks in files with matching names | `file:meeting.md` |
| `tag:` | Find tasks containing specific tags | `tag:urgent` |
| `state:` | Find tasks with specific states | `state:DOING` |
| `priority:` | Find tasks with specific priorities | `priority:high` |
| `content:` | Find tasks with specific content | `content:project` |
| `scheduled:` | Find tasks with scheduled dates | `scheduled:due` |
| `deadline:` | Find tasks with deadline dates | `deadline:"this week"` |

### Using Search filters

Search filters can be used alone or combined with other search terms:

```txt
path:projects
```

Find all tasks in the "projects" folder.

```txt
file:meeting content:project
```

Find tasks in with "project" in the task detailns only in files containing "meeting" in the file name.

```txt
state:TODO priority:high
```

Find high priority tasks that are in TODO state.

### Combining Multiple Prefixes

```txt
path:work tag:urgent state:TODO
```

Find #urgent tagged TODO tasks in the work folder.

```txt
file:report scheduled:"this week" priority:high
```

Find high priority tasks scheduled for this week in files with "report" in the file name.

## Date Filter Expressions

TODOseq provides powerful date-based filtering expressions.

### Basic Date Expressions

| Expression | Description |
| ---------- | ----------- |
| `overdue` | Tasks that are past their deadline |
| `due` | Tasks due today or overdue |
| `today` | Tasks due today |
| `tomorrow` | Tasks due tomorrow |
| `this week` | Tasks due this week* |
| `next week` | Tasks due next week* |
| `this month` | Tasks due this month |
| `next month` | Tasks due next month |

*Weeks start on Monday by default, this can be changed in the settings.

### Date Expression Examples

```txt
scheduled:today
```

Find tasks scheduled for today.

```txt
deadline:overdue
```

Find tasks with overdue deadlines.

```txt
scheduled:"this week"
```

Find tasks scheduled for the current week.

```txt
deadline:"next month"
```

Find tasks with deadlines in the next month.

### Next N Days Expression

```txt
scheduled:"next 7 days"
```

Find tasks scheduled in the next 7 days.

```txt
deadline:"next 14 days"
```

Find tasks with deadlines in the next 14 days.

## Date Range Syntax

Use `..` to specify date ranges in `YYYY-MM-DD` format.

### Date Range Examples

```txt
scheduled:2026-01-01..2026-01-31
```

Find tasks scheduled in January 2026.

```txt
deadline:2026-06-01..2026-06-30
```

Find tasks with deadlines in June 2026.

```txt
scheduled:2026-01-01..2026-03-31
```

Find tasks scheduled in Q1 2026.

### Combining Date Ranges with Other Filters

```txt
scheduled:2026-01-01..2026-01-31 priority:high
```

Find high priority tasks scheduled in January 2026.

```txt
deadline:2026-06-01..2026-06-30 state:TODO
```

Find TODO tasks with deadlines in June 2026.

## Priority Filter Values

TODOseq supports multiple ways to filter by priority.

| Value | Description |
| ----- | ----------- |
| `high` | High priority tasks (`[#A]`) |
| `med` | Medium priority tasks (`[#B]`) |
| `low` | Low priority tasks (`[#C]`) |
| `A` | Short form for high priority |
| `B` | Short form for medium priority |
| `C` | Short form for low priority |
| `none` | Tasks without priority |

### Priority Filter Examples

```txt
priority:high
```

Find high priority tasks.

```txt
priority:med -state:DOING
```

Find medium priority tasks excluding those in DOING state.

```txt
priority:a OR priority:b
```

Find high or medium priority tasks.

```txt
priority:none
```

Find tasks without priority assignments.

## Combining Search Techniques

TODOseq allows combining all search features for powerful, targeted filtering.

### Complex Query Examples

```txt
path:projects tag:urgent priority:high scheduled:"this week"
```

Find urgent, high priority tasks scheduled for this week in the projects folder.

```txt
(file:meeting OR file:notes) content:project state:TODO -tag:blocked
```

Find TODO project tasks in meeting or notes files, excluding task with the #blocked tag.

```txt
"code review" (state:TODO OR state:DOING) deadline:"next 7 days"
```

Find code review tasks that are TODO or DOING with deadlines in the next 7 days.

```txt
path:work/ scheduled:2026-01-01..2026-01-31 priority:A OR priority:B
```

Find high or medium priority tasks scheduled in January 2026 in the work folder.

## Search Logic and Behavior

### Search Matching Rules

1. **Case Sensitivity**: Off by default, toggle with A/a button
2. **Whitespace**: Multiple spaces are treated as single space
3. **Punctuation**: Most punctuation is treated as literal characters
4. **Order**: Search terms can appear in any order in results
5. **Proximity**: Terms don't need to be adjacent unless using quotes
