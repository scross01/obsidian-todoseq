# Task Entry Structure

This guide covers everything you need to know about how TODOseq recognizes, parses, and manages tasks in your Obsidian vault.

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

TODOseq automatically syncs checkbox state with task keywords when updated from the Task List\*:

- Empty checkbox `[ ]` = Incomplete task (TODO, DOING, etc.)
- Checked checkbox `[x]` = Completed task (DONE, CANCELED, etc.)
- When you toggle state, both keyword and checkbox are updated
- Proper spacing is maintained (e.g., `- [x] DONE`)

\*Note: If you modify the checkbox directly on the page in the Obsdian editor, the task state keyword will not be automatically updated accordingly.

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
- `CANCELLED` - Alternative spelling of cancelled

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

You can add additional task keywords in the plugin settings:

1. Go to TODOseq settings
2. Find "Additional Task Keywords" field
3. Enter comma-separated capitalized keywords (e.g., `FIXME, HACK, REVIEW`)

**Examples:**

```markdown
FIXME Broken functionality
HACK Temporary workaround
REVIEW Needs code review
```

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

### Date Usage Rules

1. **Placement**: Date lines must be immediately after the task line
2. **Indentation**: Must match or be more indented than the task
3. **Format**: Must use angle brackets `<>` with valid date format
4. **Limit**: Only first occurrence of each type (SCHEDULED/DEADLINE) is recognized

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
