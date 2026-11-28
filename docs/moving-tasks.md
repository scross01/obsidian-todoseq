# Moving Tasks

Tasks can be copied, moved or migrated from the [task context menu](task-list.md#task-context-menu), or by [drag and drop](task-list.md#drag-and-drop) from the Task List into an open file.

Some copy/move actions require a daily-note provider: the Daily Notes core plugin, or Periodic Notes with its daily note enabled. When neither provides a daily note, those commands are unavailable in the command palette and nothing is created.

## What travels with a task

Copy, move and drag-and-drop take the whole task block: the task line, its consecutive metadata lines and its indented child tasks. Metadata means `SCHEDULED:`, `DEADLINE:`, `CLOSED:`, `STARTED:` and `DESCRIPTION:` lines directly below the task — no blank line or prose in between. A line that is not one of those ends the block, so a sibling task or paragraph is never dragged along.

Migrate to Today is the exception: the copy keeps the full block, while the source line keeps `STARTED:`, `CLOSED:` and `DESCRIPTION:` and loses only the `SCHEDULED:` and `DEADLINE:` dates it is moving to the new copy.

A task with an `ID` or block anchor keeps it, and the references TODOseq can find are updated to follow the task. See [Task IDs and Anchors](task-ids.md) for how identities work and what [Task Dependencies](task-dependencies.md#moving-and-copying-tasks) does with them.

## Copy

Copy puts the task text on the clipboard and leaves the note unchanged.

## Copy to today

Copy to Today adds a copy to today's daily note and leaves the original where it is.

## Move to today

Move to Today appends the task to today's daily note and deletes it from its original file.

## Migrate to today

Migrate to Today copies the task to today's daily note and replaces the original's keyword with a custom state, marking it as moved or archived in place.

The replacement keyword is configured under [Migrated state keyword](settings.md#migrated-state-keyword). A standard keyword such as `ARCHIVED`, or a custom one such as `MOVED`, shows the task's new status and still counts as a known keyword:

```markdown
# source page

TODO Review project timeline
```

After migrating with `ARCHIVED`:

```markdown
# source page

ARCHIVED Review project timeline
```

```markdown
# today's daily note

TODO Review project timeline
```

The replacement does not have to be a task keyword. Any text works, including a marker that stops TODOseq tracking the line:

A non-keyword marker such as `(migrated)` keeps the task text but removes the line from TODOseq:

```markdown
# source page

(migrated) Review project timeline
```

A keyword plus text, such as `ARCHIVED (moved)`, adds context:

```markdown
# source page

ARCHIVED (moved) Review project timeline
```

## If something goes wrong

A transfer writes the editor's current content, including unsaved changes, and checks the task again just before writing. If the task has moved since the list was drawn, the transfer stops with a notice rather than copying the wrong line.

A failed write to the destination leaves the original untouched. If the destination succeeds but the original cannot be updated, the notice says the task was copied but not updated. A table cell is changed in place: only that cell is cleared, and the row is removed only when it is empty.

Links to the task are updated during the transfer. If any could not be updated, the notice names the notes that could not be read and the links that could not be written, and Retry repeats the link updates only.
