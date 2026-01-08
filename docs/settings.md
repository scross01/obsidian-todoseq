# Settings

TODOseq provides configuration options to customize the plugin to your workflow. This guide covers all available settings and their impact on functionality.

## Accessing Settings

Access TODOseq settings through Obsidian's settings interface:

1. Open Obsidian Settings
2. Navigate to "Community plugins"
3. Find "TODOseq" in the list
4. Click on "TODOseq" to view and edit settings

## General Settings

### Refresh Interval

**Setting**: "Refresh Interval" (10-300 seconds, default: 60)

**Description**: Controls how frequently TODOseq rescans your vault for tasks. While the Task List should generally update automatically when files change, this setting ensures periodic rescans to catch any missed updates.

**Impact**:

- Lower values = More frequent updates, higher resource usage
- Higher values = Less frequent updates, better performance
- Set to 60 seconds (1 minute) by default for balanced performance

## Editor Integration Settings

### Format Task Keywords

**Setting**: "Format task keywords" toggle (in TODOseq settings)

**Description**: Enable or disable visual formatting of task keywords in the editor.

**Default**: Enabled

**Visual Effects When Enabled:**

Task keywords (`TODO`, `DOING`, `DONE`, etc.) appear in bold font.
All task states use your Obsidian theme's accent color.
See [Editor Integration documentation](editor.md) for full details.

### Editor Command: Toggle Task State

**Setting**: Keyboard shortcut configuration (in Obsidian Hotkeys)

**Description**: Toggle task states directly from the Markdown editor.

**Default Shortcut**: `Ctrl+Enter`

**Behavior:**

- Works when cursor is on any valid task line
- Follows same state cycling logic as Task List
- Preserves indentation, list markers, and priority tokens
- Updates both state keyword and checkbox simultaneously
- Only available when editing Markdown files

**Customization:**

1. Open Obsidian Settings
2. Go to "Hotkeys"
3. Find "TODOseq: Toggle task state"
4. Assign your preferred keyboard shortcut

## Task Recognition Settings

### Additional Task Keywords

**Setting**: "Additional Task Keywords" (comma-separated list)

**Description**: Add custom keywords to be identified as tasks.

**Format**: Comma-separated list of capitalized words (e.g., `FIXME, HACK, REVIEW`)

**Rules:**

- Keywords must be capitalized
- Are additive (doesn't replace default keywords)
- Only the active state keyword can be added - completion still uses DONE/CANCELED states

**Examples:**

```txt
FIXME, HACK, REVIEW, BLOCKED, IDEA
```

**Suggested Use Cases:**

- Software development: `FIXME`, `HACK`, `REVIEW`
- Research: `QUESTION`, `HYPOTHESIS`, `EXPERIMENT`
- Writing: `DRAFT`, `EDIT`, `REVISE`
- Project management: `BLOCKED`, `DEPENDENCY`, `APPROVAL`

**Custom Keyword Behavior:**

- Appear in Task List like default keywords
- Can be clicked to cycle states
- Follow same state sequences as similar default keywords

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

**Default**: Disabled

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

**Setting**: "Include tasks inside comment blocks" (toggle)

**Description**: Enable or disable task detection inside multiline comment blocks.

**Default**: Disabled

## Task List Settings

### Task List Mode

**Setting**: "Task List mode" (dropdown)

**Description**: Choose how completed items are shown by default.

**Options:**

1. **Default**: Show all tasks in detected order
   - Completed and incomplete tasks mixed
   - Sorted by file path and line number
   - Good for overall task overview

2. **Sort completed to end**: Move completed tasks to the end
   - Pending tasks appear first
   - Completed tasks grouped at bottom
   - Both groups sorted by selected sort method
   - Ideal for focusing on active work

3. **Hide completed**: Completely hide completed tasks
   - Only shows incomplete tasks
   - Reduces visual clutter
   - Best for focused work sessions

**Default**: Default mode

**Behavior:**

- Setting applies to initial Task List opening
- Can also be updated directly in the Task List settings menu
- User preference is remembered across sessions

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
