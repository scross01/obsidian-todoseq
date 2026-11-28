/**
 * Seeds for the task-dependency docs screenshots (docs/task-dependencies.md).
 *
 * Two separate notes, because the two frames show different states: a task
 * waiting on a live prerequisite, and a task whose reference resolves to
 * nothing. The capture scopes the Task List to one note at a time with a
 * `file:` query, so each crop holds only the rows it is about — the Issues
 * indicator itself is vault-wide, which is why the broken fixture must be the
 * only one contributing an issue.
 *
 * No dates: blocked state comes from the reference alone, and a date badge
 * would only add noise beside the lock.
 */
export const DEPENDENCY_SEEDS: Record<string, string> = {
  'Dependency waiting.md': `The second task waits for the first, and both are ordinary tasks in this note.

TODO Collect source data
:PROPERTIES:
:ID: source-data
:END:

TODO Draft the report
:PROPERTIES:
:BLOCKER: source-data
:END:
`,
  'Dependency issue.md': `This task names a prerequisite that no note defines.

TODO Verify the appendix
:PROPERTIES:
:BLOCKER: missing-review
:END:
`,
};
