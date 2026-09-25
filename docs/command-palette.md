# Command Palette

TODOseq provides several commands that can be accessed through Obsidian's Command Palette. These commands allow you to interact with the plugin without using the mouse or opening settings.

## Available Commands

- TODOseq: Show task list
- TODOseq: Open task list in new tab
- TODOseq: Rescan vault
- TODOseq: Archive completed tasks
- TODOseq: Undo last archive run
- TODOseq: Toggle task state _(editor only)_
- TODOseq: Cycle task state _(editor only)_
- TODOseq: Copy task to today _(editor only)_
- TODOseq: Move task to today _(editor only)_
- TODOseq: Migrate task to today _(editor only)_
- TODOseq: Add scheduled date _(editor only)_
- TODOseq: Add deadline date _(editor only)_
- TODOseq: Add description _(editor only)_
- TODOseq: Set priority high _(editor only)_
- TODOseq: Set priority medium _(editor only)_
- TODOseq: Set priority low _(editor only)_
- TODOseq: Open context menu _(editor only)_
- TODOseq: Open scheduled date picker _(editor only)_
- TODOseq: Open deadline date picker _(editor only)_

### Show task list

Opens the TODOseq Task List view. By default, Task List view is opened in the right sidebar.

### Open task list in new tab

Opens the TODOseq Task List view in a new tab in the main workspace area. This is useful when you want to view the task list alongside your notes, rather than in a side panel.

### Rescan vault

Manually triggers a full vault scan to update the task list with the latest changes.

A full rescan is not typically required, unless the vault level setting for Excluded files has been updated. General file changes (create, modify, delete) trigger automatic incremental updates.

### Archive completed tasks

Opens the archive preview dialog. Choose a criterion ("Closed more than" N days ago with presets, or "Closed before" a date), adjust the state mappings, review the matching tasks, and confirm. Nothing is written until you apply. See [Auto-Archive](auto-archive.md).

### Undo last archive run

Reverts the most recent archive run. Each line is verified before restoring; lines that changed since the run are skipped and reported. Undo is session-scoped — it stays available until Obsidian restarts.

**Availability**: Only when there is something to undo; the command is greyed out otherwise.

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

### Copy task to today

Copy the task at the current cursor position to today's daily note while keeping the original task in place. This command requires the Daily Notes core plugin to be enabled.

### Move task to today

Move the task at the current cursor position to today's daily note, removing it from its original location. This command requires the Daily Notes core plugin to be enabled.

### Migrate task to today

Copy the task at the current cursor position to today's daily note and update the original task with a custom state keyword. The keyword used is configured in settings (see [Migrated state keyword](settings.md#migrated-state-keyword)). This command requires both the Daily Notes core plugin to be enabled and a migrated state keyword to be configured.

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

### Add description

Add a description line to the task at the current cursor position. If the task already has a description, the cursor moves to the end of the existing description text for editing.

```txt
TODO example task
DESCRIPTION:
```

After typing:

```txt
TODO example task
DESCRIPTION: Pick up milk, eggs, and bread
```

The description line is inserted immediately after the task line.

### Set priority high/medium/low

Set the priority of the task at the current cursor position to high `[#A]`, medium `[#B]` or low `[#C]`.

### Open context menu

Opens the task context menu at the current cursor position in the Markdown editor. This command provides quick access to common task actions without using the mouse.

**Availability**: Only appears when the cursor is on a valid task line.

**Features**:

- Go to task (navigation)
- Priority selection (high, medium, low, or none)
- Scheduled date shortcuts (today, tomorrow, next week, etc.)
- Deadline date picker with calendar interface
- Copy task to today's daily note
- Move task to today's daily note
- Migrate task to today's daily note

**Implementation**: Uses CodeMirror editor API to get screen coordinates for positioning the menu at the cursor location.

### Open scheduled date picker

Opens a date picker dialog for setting the scheduled date of the task at the current cursor position. The date picker provides a calendar interface for selecting dates.

**Availability**: Only appears when the cursor is on a valid task line.

**Features**:

- Calendar-based date selection
- Quick date shortcuts (today, tomorrow, next week, etc.)
- Support for recurring dates with repeat patterns
- Integration with task update coordinator for immediate task updates

**Example**:

```txt
TODO example task
SCHEDULED: <2026-01-16>
```

### Open deadline date picker

Opens a date picker dialog for setting the deadline date of the task at the current cursor position. The date picker provides a calendar interface for selecting dates.

**Availability**: Only appears when the cursor is on a valid task line.

**Features**:

- Calendar-based date selection
- Quick date shortcuts (today, tomorrow, next week, etc.)
- Support for recurring dates with repeat patterns
- Integration with task update coordinator for immediate task updates

**Example**:

```txt
TODO example task
DEADLINE: <2026-01-16>
```
