# Task Entry Structure

This guide covers how TODOseq recognizes, parses, and manages tasks in your Obsidian vault.

## Task Recognition Patterns

TODOseq identifies tasks based on specific patterns in your Markdown files. A task must match the following structure:

```txt
[optional indentation][optional list marker][state keyword][space][task text]
```

### Basic Task Structure

```markdown
TODO Write documentation
DOING Update sync script
DONE Triage customer feedback
```

### Task with Indentation

```markdown
  TODO Indented task
    DOING Double indented task
```

### Task with List Markers

```markdown
- TODO Task in bullet list
+ TODO Task in bullet list using plus marker

1. DOING Task in numbered list
   * DONE Task with indented bullet
```

## Supported Task Formats

TODOseq supports two main task formats:

### 1. Traditional Keyword Format

The primary format using state keywords:

```markdown
TODO Simple task
DOING Task in progress
DONE Completed task
```

**Examples with context:**

```markdown
- TODO Write documentation
  - DONE Update README
  - DOING Fix typos

1. DONE First step
2. DOING Second step
3. TODO Final step
```

### 2. Markdown Checkbox Format

Combines checkboxes with state keywords:

```markdown
- [ ] TODO Task with empty checkbox
- [ ] DOING In progress task with checkbox
- [x] DONE Completed task with checked checkbox
```

**Checkbox State Synchronization:**

TODOseq automatically syncs checkbox state with task keywords when updated from the Task List:

- Empty checkbox `[ ]` = Incomplete task (TODO, DOING, etc.)
- Checked checkbox `[x]` = Completed task (DONE, CANCELED, etc.)
- When you toggle state, both keyword and checkbox are updated
- Proper spacing is maintained (e.g., `- [x] DONE`)

\*Note: If you modify the checkbox directly in the Obsidian editor, the task state keyword will not be automatically updated.

**Additional formats** may be available through [Experimental Features](experimental-features.md).

## Task Keywords

### Default Supported Keywords

TODOseq recognizes these task state keywords by default:

**Incomplete States:**

- `TODO` - Task needs to be done
- `DOING` - Task is currently in progress
- `NOW` - Task should be done immediately
- `LATER` - Task is deferred for later
- `WAIT` - Task is waiting on external dependencies
- `WAITING` - Alternative form of WAIT
- `IN-PROGRESS` - Alternative form of DOING

**Completed States:**

- `DONE` - Task is completed
- `CANCELED` - Task was cancelled
- `CANCELLED` - Alternative spelling

### Task State Sequences

Tasks progress through defined state sequences when you click the state keyword:

**Basic Workflow:**

```txt
TODO → DOING → DONE → TODO
```

**Deferred Workflow:**

```txt
LATER → NOW → DONE
```

**Waiting Workflow:**

```txt
WAIT → IN-PROGRESS → DONE
WAITING → IN-PROGRESS → DONE
```

**Cancelled Workflow:**

```txt
CANCELED → TODO
CANCELLED → TODO
```

### Adding Custom Keywords

You can add custom task keywords in the plugin settings. Keywords are organized into four groups, each with specific styling and behavior:

1. Go to TODOseq settings
2. Find the "Task Keywords" section
3. Enter comma-separated capitalized keywords in the appropriate group field

**Keyword Groups:**

- **Active Keywords**: Tasks currently being worked on (e.g., `ACTIVE`, `STARTED`, `FOCUS`)
  - Styled with blue/active color like DOING
  - Highest sort priority among incomplete tasks
  - Increases urgency score

- **Inactive Keywords**: Tasks waiting to be started (e.g., `BACKLOG`, `PLANNED`, `QUEUED`)
  - Styled with default/pending color like TODO
  - Normal sort priority

- **Waiting Keywords**: Tasks blocked by external dependencies (e.g., `BLOCKED`, `PAUSED`, `ON-HOLD`)
  - Styled with yellow/waiting color like WAIT
  - Reduces urgency score

- **Completed Keywords**: Tasks that are finished (e.g., `FINISHED`, `RESOLVED`, `ARCHIVED`)
  - Styled with green/complete color like DONE
  - Lowest sort priority

**Examples:**

```markdown
ACTIVE Currently working on this
BACKLOG Task for later
BLOCKED Waiting for review
FINISHED All done
```

**Rules:**

- Keywords must be capitalized
- Built-in keywords (TODO, DOING, DONE, etc.) are always available
- Custom keywords inherit the styling and behavior of their group
- The same keyword cannot be added to multiple groups

Custom keywords appear in the Task List like default keywords and can be clicked to cycle states. When using the [Keyword sort option](task-list.md#6-keyword) in the Task List, keywords are sorted by group (Active → Inactive → Waiting → Completed), with custom keywords sorted by definition order within each group.

## Priority System

TODOseq supports Logseq-style priority tokens to indicate task importance.

### Priority Tokens

Add priority tokens immediately after the state keyword:

- `[#A]` - High priority
- `[#B]` - Medium priority
- `[#C]` - Low priority

**Examples:**

```markdown
TODO [#A] Critical bug fix
DOING [#B] Feature implementation
DONE [#C] Documentation update
```

## Date Management

TODOseq supports Logseq-style SCHEDULED and DEADLINE dates for task organization.

TODOseq treats all dates and times as timezone-independent values that assume local time. When you schedule a task for "2026-01-31 22:00", TODOseq interprets this in your local timezone rather than UTC. If your device changes timezone, "2026-01-31 22:00" represents Jan 31st 10pm in your new timezone. TODOseq does not make timezone adjustments and does not currently support timezone-aware date handling.

### Date Formats

#### Date Only

```markdown
TODO Write documentation
SCHEDULED: <2025-01-15>
DEADLINE: <2025-01-20>
```

#### Date with Time

```markdown
TODO Write documentation
SCHEDULED: <2025-01-15 14:30>
DEADLINE: <2025-01-20 17:00>
```

#### Date with Day of Week and Time

```markdown
TODO Write documentation
SCHEDULED: <2025-01-15 Wed 14:30>
DEADLINE: <2025-01-20 Mon 17:00>
```

### CLOSED Date

TODOseq supports a CLOSED date that records when a task was marked as completed, following Org-mode syntax.

#### CLOSED Date Format

```markdown
TODO Write documentation
SCHEDULED: <2025-01-15>
DEADLINE: <2025-01-20>
CLOSED: [2025-01-18 Fri 14:30]
```

The CLOSED date uses square brackets `[]` instead of angle brackets `<>` to distinguish it from scheduled and deadline dates. It includes the date, day of week, and time when the task was completed.

#### CLOSED Date Behavior

- **Automatic Addition**: When you mark a task as completed (e.g., transition from TODO to DONE), a CLOSED date is automatically added if the "Track closed date" setting is enabled.
- **Automatic Removal**: When you reactivate a completed task (e.g., transition from DONE to TODO), the CLOSED date is automatically removed.
- **Recurring Tasks**: CLOSED dates are not removed from recurring tasks when they are reactivated, as they preserve a record of when the task was last completed.
- **Manual Editing**: You can manually add or remove CLOSED dates directly in your notes.

#### Date Usage Rules

1. **Placement**: Date lines must be immediately after the task line
2. **Indentation**: Must match or be more indented than the task
3. **Format**: Must use angle brackets `<>` for SCHEDULED/DEADLINE or square brackets `[]` for CLOSED
4. **Limit**: Only first occurrence of each type (SCHEDULED/DEADLINE/CLOSED) is recognized

**Correct Date Usage:**

```markdown
TODO Write documentation
SCHEDULED: <2025-01-15>

- DOING Review pull requests
  DEADLINE: <2025-01-20 17:00>
```

**Incorrect Date Usage:**

```markdown
TODO Write documentation
Some text between
SCHEDULED: <2025-01-15> # Not immediately after task

TODO Another task
SCHEDULED: <2025-01-15>
DEADLINE: <2025-01-20>
SCHEDULED: <2025-01-16> # Only first SCHEDULED is used
```

### Date Parsing Details

- Dates are parsed in local time (timezone independent)
- Invalid date formats are ignored and logged to console
- Time component is optional
- Day of week is optional but must be valid if present

### Repeating Dates (Org-Mode Repeaters)

TODOseq supports org-mode compatible repeating date syntax for SCHEDULED and DEADLINE dates. When you mark a repeating task as DONE, the date automatically advances to the next occurrence.

#### Repeater Syntax

Repeaters use the format `<type><value><unit>` appended to the date:

```markdown
SCHEDULED: <2026-03-05 Wed 07:00 .+1d>
DEADLINE: <2026-03-01 Sun ++1w>
```

#### Repeater Types

| Type | Symbol | Behavior |
|------|--------|----------|
| Strict repeat | `+` | If you finish a task late, it still schedules the next one based on the original date |
| From done | `.+` | Schedules the next instance exactly one interval from the moment you hit "DONE" |
| Catch up | `++` | If you missed several intervals, it will jump to the next future date from today so you don't have a massive backlog |

#### Time Units

| Unit | Meaning |
|------|--------|
| `y` | Year |
| `m` | Month |
| `w` | Week |
| `d` | Day |
| `h` | Hour |

#### Practical Examples

The type of repeater you use affects how the next date is calculated after you "close" the current one:

**Strict repeat (+1w):**
```markdown
TODO Weekly team meeting
SCHEDULED: <2026-03-05 Wed 10:00 +1w>
```
- If you finish a task late, it still schedules the next one based on the original date
- Example: If you complete the task on March 8 (3 days late), the next occurrence will be March 12 (original date + 1 week)

**Catch up (++1w):**
```markdown
TODO Weekly team meeting
SCHEDULED: <2026-03-05 Wed 10:00 ++1w>
```
- If you missed several weeks, it will jump to the next future date from today so you don't have a massive backlog
- Example: If you complete the task on March 20 (2 weeks late), the next occurrence will be March 22 (next Wednesday from today)

**From done (.+1w):**
```markdown
TODO Weekly team meeting
SCHEDULED: <2026-03-05 Wed 10:00 .+1w>
```
- It schedules the next instance exactly one week from the moment you hit "DONE"
- Example: If you complete the task on March 8 (3 days late), the next occurrence will be March 15 (completion date + 1 week)

#### Auto-Advance Behavior

When you mark a task with a repeating date as completed (default completed state, i.e. DONE):

1. The date automatically advances to the next occurrence
2. The new date is written back to the file
3. The task is reset to an inactive state (default inactive state, i.e. TODO)

Tasks with repeating dates display a repeat icon in the task list to indicate they will advance when completed.

## Tasks in Different Contexts

### Tasks in Lists

TODOseq preserves list structure and markers:

```markdown
- TODO Task in bullet list
  - DOING Subtask with indentation
    - DONE Deeply nested subtask

1. TODO First numbered task
2. DOING Second numbered task
3. DONE Third numbered task
```

### Tasks in Quotes and Callouts

When "Include tasks inside quote and callout blocks" is enabled:

```markdown
> TODO Task in a quote block

> > TODO Task in a nested quote block

> > > TODO Task in three level nested quote block

> [!info]
> TODO Task in an info callout

> [!todo]-
>
> - [ ] TODO Checkbox task in collapsible todo block
```

### Tasks in Comment Blocks

When "Include tasks inside comment blocks" is enabled:

```markdown
%% TODO Task in single-line comment block %%

%%
TODO Task in multi-line comment block
DEADLINE: <2025-11-01>
%%
```

### Tasks in Code Blocks

When "Include tasks inside code blocks" is enabled:

<pre>
```txt
TODO task in code block
TODO another task in code block
```
</pre>

### Tasks in Footnotes

TODOseq can detect tasks in footnote definitions:

```markdown
This text has a footnote[^1]

[^1]: TODO task in the footnote
```

### Language-Aware Comment Tasks

TODOseq supports extracting tasks from comments in 20+ programming languages:

**Python, Ruby, Shell, YAML, TOML, Dockerfile:**

```python
# TODO Write documentation
# FIXME Handle edge cases
```

**JavaScript, Java, C++, C#, Go, Swift, Kotlin, Rust, PowerShell:**

```javascript
// TODO Implement feature
// HACK Temporary fix
```

**SQL:**

```sql
-- TODO Optimize query
-- DOING Add indexes
```

**INI:**

```ini
; TODO Configure settings
; FIXME Broken config
```

## Subtasks

TODOseq supports subtasks by detecting indented checkbox items under a task line. Subtasks are displayed in the task list with a progress indicator showing completed and total count.

### How Subtasks Work

A subtask is a checkbox item that is indented more than its parent task. The minimum indentation difference is one space or tab:

```markdown
TODO Parent task
  - [ ] subtask 1
  - [ ] subtask 2
```

The parent task displays the subtask count: `TODO Parent task [0/2]`

### Subtask Completion

When you check a subtask checkbox from the task list, the parent's subtask count updates automatically:

```markdown
TODO Parent task
  - [x] subtask 1 (completed)
  - [ ] subtask 2
```

Now displays as: `TODO Parent task [1/2]`

### Subtasks with Keywords

If a subtask contains its own task keyword, it becomes an independent task that appears in the task list separately. The parent task still counts it:

```markdown
TODO Parent task
  - [ ] regular subtask
  - [ ] TODO this becomes a task
```

- Parent shows: `TODO Parent task [0/2]`
- "this becomes a task" also appears as its own task

### Tasks with Dates and Subtasks

Subtasks work with scheduled and deadline dates. The date must appear immediately after the task line:

```markdown
TODO Project task
SCHEDULED: <2025-03-15>
  - [ ] initial step
  - [ ] final step
```

### What Doesn't Count as a Subtask

Checkboxes at the same indentation level as the task are not subtasks:

```markdown
TODO Not a parent
- [ ] not a subtask
- [ ] also not a subtask
```

Quoted tasks do not support subtasks:

```markdown
> TODO Not supported
>   - [ ] not detected
```

## Task Updates and Preservation

When a task state is updated, TODOseq preserves:

- **Indentation**: Original whitespace is maintained
- **List markers**: `-`, `+`, `*`, `1.`, etc. are kept
- **Priority tokens**: `[#A]`, `[#B]`, `[#C]` remain, but will be moved to the start of the task line
- **Task text**: Everything after the state keyword is preserved
- **File structure**: Task stays in original location

**Before Update:**

```markdown
- TODO Write documentation for new feature [#A]
```

**After Clicking TODO:**

```markdown
- DOING [#A] Write documentation for new feature
```
