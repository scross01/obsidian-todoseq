Dependency examples. A lock marks a task waiting on an incomplete prerequisite; a warning replaces it when a reference cannot be resolved.

## Block link

TODO Collect source material
SCHEDULED: <2026-11-24 Tue>
:PROPERTIES:
:ID: 719ed122-9c69-4ed8-beb8-79db828ddce0
:END: ^source-notes

TODO Draft the summary
:PROPERTIES:
:BLOCKER: [[Test Blocked Tasks#^source-notes]]
:EXTRA: unknown properties are preserved
:END:

## Multiple IDs

TODO Prepare the outline
:PROPERTIES:
:ID: outline
:END:

DONE Approve the outline
:PROPERTIES:
:ID: approval
:END:

TODO Write the draft
:PROPERTIES:
:BLOCKER: outline approval
:END:

## Appended references

`BLOCKER+` adds another reference without replacing the first.

TODO Review the draft
:PROPERTIES:
:BLOCKER: [[Test Blocked Tasks#^source-notes]]
:BLOCKER+: outline
:END:

## Archived history

An archived reference is history: it does not block while the target is absent, and the completed active blocker releases the task.

ARCHIVED Review the report
:PROPERTIES:
:ID: review
:END:

TODO Publish the report
:PROPERTIES:
:BLOCKER: approval
:ARCHIVED_BLOCKER: review
:END:

## NOBLOCKING

`NOBLOCKING` suppresses every reason for this task, including an incomplete explicit blocker.

TODO Tidy the workspace
:PROPERTIES:
:BLOCKER: outline
:NOBLOCKING: true
:END:

## Structural order

With ordered dependencies enabled, the later tasks wait for the `ORDERED` first step. The third task also names its previous sibling, which stays active when that setting is off.

TODO Finish the first step
:PROPERTIES:
:ORDERED: true
:END:

TODO Start the second step

TODO Start the third step
:PROPERTIES:
:BLOCKER: previous-sibling
:END:

## Broken reference

An unresolved ID shows a warning marker instead of a lock.

TODO Import the dataset
:PROPERTIES:
:BLOCKER: missing-task-id
:END:


TODO test again
:PROPERTIES:
:BLOCKER: previous-sibling
:END:

TODO another task


## Embedded task list

Blocked and warning indicators show in task lists.

```todoseq
search: file:"Test Blocked Tasks"
```

## Blocked report

The card groups this note's tasks by blocked state, so waiting work and actionable work are visible together.

```todoseq-dashboard
title: Blocked work in this note
search: file:"Test Blocked Tasks"
group-by: blocked
display: bar
```

