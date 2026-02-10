# Command Palette

TODOseq provides several commands that can be accessed through Obsidian's Command Palette. These commands allow you to interact with the plugin without using the mouse or opening settings.

## Available Commands

- TODOseq: Show task list
- TODOseq: Rescan vault
- TODOseq: Toggle task state _(editor only)_
- TODOseq: Cycle task state _(editor only)_
- TODOseq: Add scheduled date _(editor only)_
- TODOseq: Add deadline date _(editor only)_
- TODOseq: Set priority high _(editor only)_
- TODOseq: Set priority medium _(editor only)_
- TODOseq: Set priority low _(editor only)_

### Show task list

Opens the TODOseq Task List view. By default the Task List view is opened in the right sidebar.

### Rescan vault

Manually triggers a full vault scan to update the task list with the latest changes.

A full rescan is not typically required, unless the vault level setting for Excluded files has been updated. General file changes (create, modify, delete) trigger automatic incremental updates.

### Toggle task state

Toggle the state of the task at the current cursor position in the Markdown editor.

**State Cycle**:

- `TODO` → `DOING` → `DONE`
- `LATER` → `NOW` → `DONE`
- `DONE` → `TODO` (cycles back)

**Default Shortcut**: `Ctrl + Enter`

### Cycle task state

Cycle the state of any task line between task states and no task keyword. This command is available on any line that can contain a task.

**State Cycle**:

- No task keyword → `TODO` → `DOING` → `DONE` → No task keyword (cycles back)

**Example**:

```markdown
- test new cycle task state command
```

After using the command:

```markdown
- TODO test new cycle task state command
```

### Add scheduled date

Add a scheduled date to the task at the current cursor position, defaulted to the current date.

```txt
TODO example task
SCHEDULED: <2026-01-16>
```

### Add deadline date

Add a deadline date to the task at the current cursor position, defaulted to the current date.

```txt
TODO example task
DEADLINE: <2026-01-16>
```

### Set priority high/medium/low

Set the priority of the task at the current cursor position to high `[#A]`, medium `[#B]` or low `[#C]`.
