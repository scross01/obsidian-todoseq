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

## Local properties only

TODOseq reads dependency properties from the task's own drawer. Parent tasks and file-level defaults do not add an `ID`, `BLOCKER`, or `ARCHIVED_BLOCKER` to another task.
