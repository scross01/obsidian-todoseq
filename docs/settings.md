# Settings

TODOseq provides configuration options to customize the plugin to your workflow. This guide covers all available settings and their impact on functionality.

![TODOseq Settings](./assets/todoseq-settings.png)

## Accessing Settings

Access TODOseq settings through Obsidian's settings interface:

1. Open Obsidian Settings
2. Navigate to "Community plugins"
3. Find "TODOseq" in the list
4. Click on "TODOseq" to view and edit settings

## General Settings

## Editor Integration Settings

### Format Task Keywords

**Setting**: "Format task keywords" toggle (in TODOseq settings)

**Description**: Enable or disable visual formatting of task keywords in both the editor and reader views.

**Default**: Enabled

**Visual Effects When Enabled:**

Task keywords (`TODO`, `DOING`, `DONE`, etc.) appear in bold font. All task states use your Obsidian theme's accent color. See [Editor Integration](editor.md) and [Reader View](reader.md) documentation for full details.

## Task Recognition Settings

### Task Keywords

**Setting**: "Task keywords" section with five keyword groups

**Description**: Define task state keywords for Active, Inactive, Waiting, Completed, and Archived groups. The group controls styling, sorting, search suggestions, and urgency behavior.

#### Built-in keywords

TODOseq starts with built-in keywords in each group:

**Active Keywords**: `DOING`, `NOW`, `IN-PROGRESS`

- Styled with blue/active color
- Highest sort priority for incomplete tasks
- Contribute to urgency score

**Inactive Keywords**: `TODO`, `LATER`

- Styled with default/pending color
- Normal sort priority

**Waiting Keywords**: `WAIT`, `WAITING`

- Styled with yellow/waiting color
- Reduces urgency score

**Completed Keywords**: `DONE`, `CANCELED`, `CANCELLED`

- Styled with green/complete color
- Lowest sort priority

**Archived Keywords**: `ARCHIVED`

- Styled as archived
- Excluded from vault task collection and state search suggestions

#### Adding custom keywords

The normal workflow is to add your own keywords to the group that matches your process. Custom keywords inherit the behavior of that group. For example, custom active states increase urgency, custom waiting states reduce urgency, and custom completed states are treated as done.

Enter comma-separated, capitalized values in the group field. A small setup might look like this:

```txt
Active: STARTED
Inactive: BACKLOG
Waiting: BLOCKED
Completed: FINISHED
```

#### Group behavior

You can add custom keywords to any group:

**Active Keywords**: Tasks currently being worked on

- Highest sort priority among incomplete tasks
- Increases urgency score (same as built-in active keywords)
- Example use cases: `ACTIVE`, `STARTED`, `FOCUS`

**Inactive Keywords**: Tasks waiting to be started

- Normal sort priority
- Example use cases: `BACKLOG`, `PLANNED`, `QUEUED`

**Waiting Keywords**: Tasks blocked by external dependencies

- Reduces urgency score (same as built-in waiting keywords)
- Example use cases: `BLOCKED`, `PAUSED`, `ON-HOLD`

**Completed Keywords**: Tasks that are finished

- Lowest sort priority

- Example use cases: `FINISHED`, `RESOLVED`

#### Rules and Behavior

- **Styling inheritance**: Custom keywords inherit the styling of their group
- **Duplicate prevention**: The same keyword cannot be added to multiple groups
- **State cycling**: Custom keywords follow the same state sequences as their group

#### Advanced: overriding built-in keywords

Advanced users can also override built-in placement and ordering directly in the custom fields.

If you redeclare a built-in keyword in the same group, it is treated as user-defined for ordering in that group. For example:

```txt
Active: URGENT, NOW
```

In this case, `NOW` stays active but is sorted after `URGENT`.

If you redeclare a built-in keyword in a different group, the keyword moves to that group and uses the position where you declared it. For example:

```txt
Waiting: HOLD, LATER
```

Here, `LATER` moves from Inactive to Waiting and is sorted after `HOLD`.

You can remove a built-in keyword from its default group with `-KEYWORD` syntax:

```txt
Inactive: SOMEDAY, -LATER
```

Removed built-ins are not used for scanning, styling, keyword search suggestions, or state selection menus.

When a keyword changes groups, urgency is recalculated using the new group behavior. For example, moving a keyword from Active to Waiting changes its urgency contribution from active bonus to waiting penalty.

Validation rules for advanced syntax are strict. A keyword cannot be duplicated in one group, cannot appear across multiple groups, and a built-in cannot be both added and removed at the same time. Removal is only valid for built-ins that belong to that specific group. Invalid entries are ignored and shown as errors in settings; valid built-in overrides and removals are shown as warnings so the behavior is explicit.

#### Migration from Previous Versions

If you had "Additional task keywords" configured in a previous version, they are automatically migrated to the **Inactive Keywords** group. You can move them to a different group if needed.

#### Keyword Sort Ordering

When using the [Keyword sort option](task-list.md#6-keyword) in the Task List, keywords are sorted by group:

1. **Active keywords** (DOING, NOW, IN-PROGRESS, + custom active)
2. **Inactive keywords** (TODO, LATER, + custom inactive)
3. **Waiting keywords** (WAIT, WAITING, + custom waiting)
4. **Completed keywords** (DONE, CANCELED, CANCELLED, + custom completed)

Within each group, keywords are sorted by effective definition order in settings, including built-in overrides.

### Include Tasks Inside Code Blocks

**Setting**: "Include tasks inside code blocks" (toggle)

**Description**: Enable or disable task detection within fenced code blocks.

**Default**: Disabled

**Impact:**

- **Enabled**: Tasks in code blocks are detected and shown in Task List
- **Disabled**: Code block tasks are ignored (better performance)

**Code Block Examples:**

<pre>
```text
TODO Write unit tests
FIXME Handle edge cases
```
</pre>

### Enable Language Comment Support

**Setting**: "Enable language comment support" (toggle)

**Description**: Enable language-aware commented task detection in code block comments.

**Requirement**: Must have "Include tasks inside code blocks" enabled first

**Default**: Disabled

**Code Block Examples:**

<pre>
```python
# TODO Write unit tests
# FIXME Handle edge cases
```
</pre>

**Supported Languages:**

**C-style languages**: C, C++, C#, Java, JavaScript, TypeScript, Go, Swift, Kotlin, Rust, PowerShell

- Comment syntax: `// TODO task` or `/* TODO task */`

**Scripting languages**: Python, Ruby, Shell/Bash, R

- Comment syntax: `# TODO task`

**Configuration languages**: YAML, TOML, INI

- YAML/TOML: `# TODO task`
- INI: `; TODO task`

**Other**: SQL, Dockerfile

- SQL: `-- TODO task`
- Dockerfile: `# TODO task`

**Language Detection:**

- Automatic based on code block language identifier
- Falls back to generic comment parsing if language unknown
- Supports 20+ programming languages

### Include Tasks Inside Quote and Callout Blocks

**Setting**: "Include tasks inside quote and callout blocks" (toggle)

**Description**: Enable or disable task detection in quoted lines and callout blocks.

**Default**: Enabled

**Supported Formats:**

<pre>
> TODO Task in a quote block

> [!info]
> TODO Task in an info callout

> [!todo]-
> - [ ] TODO Checkbox task in collapsible todo block
</pre>

**Use Cases:**

- Capture tasks from meeting notes in quotes
- Track action items in callout blocks
- Manage tasks in collapsible sections

### Include Tasks Inside Comment Blocks

**Setting**: "Include tasks inside comments" (toggle)

**Description**: Enable or disable task detection inside multiline comment blocks.

**Default**: Disabled

## Task List Search and Filter Settings

### Completed Tasks

**Setting**: "Completed tasks" dropdown

**Description**: Controls how completed tasks are displayed in the Task List view.

**Options:**

- **Show all tasks**: Display all tasks regardless of completion status
- **Sort completed to end**: Show completed tasks at the end of the list
- **Hide completed**: Only show incomplete tasks

**Default**: Show all tasks

### Future Dated Tasks

**Setting**: "Future dated tasks" dropdown

**Description**: Controls how tasks with future scheduled or deadline dates are displayed in the Task List view.

**Options:**

- **Show all**: Display all tasks normally (default behavior)
- **Sort to end**: Show future tasks at the end of the list, after current tasks
- **Show upcoming (7 days)**: Only show future tasks that are within the next 7 days
- **Hide future**: Hide all future tasks completely

**Default**: Show all

### Week Starts On

**Setting**: "Week starts on" (dropdown)

**Description**: Choose which day the week starts on for date filtering.

**Options:**

- **Monday**: Week starts on Monday (default, ISO standard)
- **Sunday**: Week starts on Sunday

**Impact:**

- Affects date-based filtering expressions:
  - `this week`
  - `next week`
- Does not affect absolute date ranges
- Does not change how dates are displayed

**Example Differences:**

With **Monday start**:

- Week 1: Mon Jan 1 - Sun Jan 7
- "this week" on Jan 3 includes Jan 1-7

With **Sunday start**:

- Week 1: Sun Dec 31 - Sat Jan 6
- "this week" on Jan 3 includes Dec 31 - Jan 6

### Default Sort Method

**Setting**: "Default sort method" (dropdown)

**Description**: Choose the default sort method for the task list view.

**Options:**

- **Default (file path)**: Sort by file path and line number
- **Scheduled date**: Sort by scheduled date
- **Deadline date**: Sort by deadline date
- **Priority**: Sort by priority (high → low)
- **Urgency**: Sort by urgency score (high → low)

**Default**: Default (file path)

## Other Settings

### Excluded Files

TODOseq respects Obsidian's built-in file exclusion system ("Files & links" → "Excluded files"). Files and paths matching your exclusion patterns will not be scanned for tasks.

Obsidian does not notify plugins when the "Excluded files" setting has been modified. To update the task list you can use the "Rescan Vault" action from the command palette.

### Hotkeys

The Toggle task state command palette action is bound to `Ctrl+Enter` by default.

Use the Obsidian Hotkeys setting to add or remove hotkeys for command palette actions.

## Experimental Features

The Experimental Features section contains settings for features that are still in development or testing. These features may not be fully functional and could change or be removed in future versions.

### Detect Tasks in Org Mode Files

**Setting**: "Detect tasks in org mode files" (toggle)

**Description**: Enable parsing of tasks from Org-mode files (`.org` extension).

**Default**: Disabled

**When Enabled:**

- `.org` files are scanned for tasks using Org-mode headline syntax
- Tasks appear in the Task List alongside Markdown tasks
- Supports Org-mode priorities, scheduled dates, and deadline dates

**Limitations:**

- Editor styling and decorations are not supported for Org-mode files
- Tasks are detected during vault scanning only

See [Experimental Features](experimental-features.md) for detailed documentation on Org-mode support.
