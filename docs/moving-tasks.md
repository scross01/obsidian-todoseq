# Moving Tasks

TODOseq provides several ways to move tasks between locations in your vault. Whether you want to copy a task to today's note, move it entirely, or migrate it with a custom state marker, these actions help you manage task flow without losing context.

All moving tasks actions require the Daily Notes core plugin to be enabled in Obsidian.

## Copy

Copy the task content to the clipboard. This is useful when you want to duplicate a task without changing its original location.

## Copy to Today

Copy to Today duplicates a task into today's daily note while keeping the original in place. This is useful when you want to review a task in today's context without removing it from its original location.

## Move to Today

Move to Today transfers a task to today's daily note and removes it from its original location. This is useful when you want to consolidate tasks into your daily workflow and remove them from their original context. When you move a task, it appears at the end of today's daily note and is deleted from its original file.

## Migrate to Today

Migrate to Today combines copying with state transformation. It copies the task to today's daily note and replaces the original task's keyword with a custom state. This is particularly useful for marking tasks as moved, archived, or otherwise completed in the original location when moving the task to today's note.

The replacement keyword is configurable in settings under [Migrated state keyword](settings.md#migrated-state-keyword). Here are several approaches to using this feature:

Using a standard keyword like `ARCHIVED` or a custom keyword liek `MOVED` to clearly indicates the task's new status while maintaining compatibility with TODOseq's state system:

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

The replacement text does not need to be a valid task keyword. You can use any text to indicate the task's new status

Using a non-keyword marker such as `(migrated)` or `(moved)` can be used to retain to original task content while removing from being tracked by TODOseq:

```markdown
# source page

(migrated) Review project timeline
```

Combining a keyword with custom text e.g. `ARCHIVED (moved)` helps to provide additional context about the task's new status:

```markdown
# source page

ARCHIVED (moved) Review project timeline
```
