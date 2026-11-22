# Task Dependencies

TODOseq can read Org-style property drawers under a task. The drawer stays in your Markdown or Org file, so dependencies remain ordinary text and do not create a second task database.

## Declaring properties

Put the drawer directly below the task and its date or `DESCRIPTION:` lines:

```markdown
TODO Write the research paper
:PROPERTIES:
:ID: paper-01
:BLOCKER: data-02 literature-03
:END:
```

The same drawer works under a plain keyword task, a bullet task, a checkbox task, a heading task, or a quoted task. A property drawer on a table cell or code-comment task is not supported.

TODOseq reads three properties:

- `ID` gives a task one exact, case-sensitive identifier.
- `BLOCKER` lists the tasks that must be complete first.
- `ARCHIVED_BLOCKER` keeps inactive references after a prerequisite is archived. It does not block completion.

Property names are case-insensitive. Values and IDs keep their case. Unknown properties are preserved but not interpreted. A drawer can contain blank lines. An unclosed drawer is left alone and does not consume the following task.

### Appending references

`BLOCKER+` and `ARCHIVED_BLOCKER+` add more references to the property:

```markdown
TODO Write the research paper
:PROPERTIES:
:ID: paper-01
:BLOCKER: data-02
:BLOCKER+: literature-03
:END:
```

References are separated by whitespace, deduplicated, and kept in source order. Commas are not separators.

## Markdown links as dependencies

In Markdown, a reference can also be a file-qualified block link:

```markdown
TODO Write the research paper
:PROPERTIES:
:BLOCKER: [[Research Notes#^collect-data]]
:END:
```

The link names a note and a block anchor. A bare anchor such as `^collect-data`, an embed, an aliased link, and a link without a file path are not dependency references. Org files use IDs only.

## When a task is blocked

A task is blocked while it is incomplete and any dependency it names is not complete. Blocking is derived from the current note contents; TODOseq never writes a `BLOCKED` keyword. Completing the last prerequisite makes the task actionable immediately, and reopening a prerequisite blocks it again.

Only direct references count. In `A → B → C`, C names B and is unblocked when B completes, even if A is still incomplete. A completed intermediary therefore releases its dependents. Completing a blocked task releases its own dependents. A completed task is never shown as blocked, and dependencies on completed tasks do not affect urgency or sorting.

A missing, malformed, ambiguous or unavailable dependency also blocks an incomplete task until the reference is fixed or removed. A task with no dependency properties is never blocked.

While TODOseq is rebuilding its task index, an incomplete task that names dependencies shows `Checking dependencies…`. This is temporary and is not reported as a broken reference. Tasks without dependencies are not affected.

### ID and link resolution

IDs resolve against the complete collected task set, so forward and cross-file references work. IDs are exact and case-sensitive. If two tasks declare the same ID, a reference to that ID is ambiguous and neither task is selected.

A Markdown block link resolves the note first and then the anchor in that note. Two notes can both contain `^same` without colliding, while a broken note link never falls back to a same-named ID or an anchor in another file. The target block must belong to a collected TODOseq task. Org dependencies remain ID-only.

Dependencies on files excluded from TODOseq scanning are unavailable, not deleted. They block until the reference is removed, the task completes, or the target becomes scannable again.

### Cycles

Cycles are reported as diagnostics, but they do not replace the direct completion check. In an incomplete `A ↔ B` cycle both tasks are blocked; if B completes, A becomes actionable while completed B remains unblocked. A task that names itself is blocked while it is incomplete.

## Archived references

`ARCHIVED_BLOCKER` is inactive history. It does not block completion while the archived task is absent. If the exact ID or file-plus-anchor target reappears in the scanned tasks, TODOseq treats the relationship as active immediately using the target's current state: an incomplete restored target blocks, and a completed one does not. The next reconciliation can move the reference back to `BLOCKER`.

## Local properties only

TODOseq reads dependency properties from the task's own drawer. Parent tasks and file-level defaults do not add an `ID`, `BLOCKER`, or `ARCHIVED_BLOCKER` to another task. Task hierarchy alone never blocks a task in this release.
