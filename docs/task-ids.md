# Task IDs and Anchors

TODOseq tracks each task by its note and line number. Plain task lines are collected, shown and updated without any extra syntax.

Line numbers change whenever text above them changes, and they are only meaningful inside TODOseq. A link, embed or dependency written elsewhere needs a stable target, so a task can optionally be given a unique anchor or a property ID for reference.

## Block anchors

A block anchor is Obsidian's own way of naming a block: `^task001` at the end of it. **Copy anchor** in the [task context menu](task-list.md#task-context-menu) reuses the task's anchor or creates one, then copies a file-qualified link to it. It is available for Markdown task lines.

The anchor is written at the end of the task's metadata block, the way Obsidian requires:

```markdown
TODO Fix the login redirect
SCHEDULED: <2026-12-01 Tue>
:PROPERTIES:
:EXTRA: testing
:END: ^todoseq-a1b2c3d4
```

A task with no metadata carries the anchor on its own line. Dates, `DESCRIPTION:` lines and properties still read normally with it there.

Anchors you already have on the task line keep working in TODOseq. Running **Copy anchor** moves such an anchor to the end of the metadata block, keeping the same name and copied link, because that is the position Obsidian can resolve. Scanning never rewrites a note, so an existing task-line anchor stays where it is until you run it.

## Linking to a task

An anchor makes the task a target for Obsidian's own links and embeds:

```markdown
![[Tasks.md#^task001]]
```

An embed shows the task block inside the other note and updates in place when you change the task — a new keyword, a new date or new text appears there without you editing the link.

```markdown
[[Tasks.md#^task001]]
```

A link opens the note at the task when you select it.

Because the anchor names the block rather than a line, references survive ordinary editing: retyping the task, changing its state, adding or removing dates. Moving or migrating a task through TODOseq keeps its anchor and updates the `[[Note#^anchor]]` links and `![[Note#^anchor]]` embeds it can find, including in notes with no tasks. Copying a task gives the copy its own new anchor, so the original and the copy do not compete for the same reference. Renaming a note is handled by Obsidian, which updates the file part of these links.

## Property drawer IDs

An `ID` is an Org-style property in a drawer directly below the task:

```markdown
TODO Write the research paper
:PROPERTIES:
:ID: paper-01
:BLOCKER: data-02
:END:
```

The value is exact and case-sensitive, and a task has at most one. **Copy ID** reuses an ID the task already has; if it has none, TODOseq writes a generated UUID into the drawer and copies it.

IDs exist for Org compatibility: the drawer is the same syntax Org uses, so an Org file keeps its IDs when TODOseq reads it, and the values survive outside Obsidian. Today the only feature that reads `ID` is [task dependencies](task-dependencies.md), where it names a `BLOCKER`. If you do not use blockers, you do not need an ID — the Task List, search, sorting and dashboards all work without one.

Unlike a line number, an `ID` does not change when the note is reorganised, and unlike an anchor it is not tied to the note it lives in. Two tasks that share an ID make a reference to that ID ambiguous, so TODOseq does not guess between them; give each task its own value.

## Which one to use

- **A Markdown vault** — an anchor is usually all you need. It also works as a dependency reference, and it powers embeds and links to the task.
- **Org files** — use IDs. Org dependencies are ID-only.
- **A value that should read the same everywhere** — an `ID` such as `paper-01` is easier to recognise in a drawer than a generated UUID, and it does not depend on the note's name.
- **Nothing to link to** — leave both off. A task without an identity is still found, edited and completed like any other.

## Identity during task actions

Move a task and its identity travels with it; copy it and the copy gets a new one. Queued edits also follow the task's `ID` or block anchor, so a change made from the Task List lands on the right task even if an edit moved it first. See [Moving Tasks](moving-tasks.md) and [Task Dependencies](task-dependencies.md#moving-and-copying-tasks) for what each action does to references.
