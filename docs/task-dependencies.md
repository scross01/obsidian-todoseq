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

TODOseq reads these properties:

- `ID` gives a task one exact, case-sensitive identifier.
- `BLOCKER` lists the tasks that must be complete first. Markdown also accepts `previous-sibling`.
- `ARCHIVED_BLOCKER` keeps inactive references after a prerequisite is archived. It does not block completion.
- `ORDERED` makes later task siblings wait for this task.
- `NOBLOCKING` exempts this task from every dependency gate, including explicit, structural and checkbox reasons. A present value other than lowercase `nil` enables it; an empty value enables it.

In the editor and reading view the drawer is shown as quiet metadata: the lines are muted and the property keys are faint, using your theme's colours.

In the editor, a closed drawer with at least one property can be folded from Obsidian's fold gutter: the `:PROPERTIES:` line stays visible while the entries and `:END:` collapse behind the native ellipsis. Click the ellipsis or use Obsidian's unfold control to restore them. The drawer must fit within 60 lines including `:PROPERTIES:` and `:END:`; longer drawers stay unfolded. An empty or unclosed drawer is not foldable. Folding is view-only and never changes the note, so the drawer remains ordinary note text that other tools can read. Reading view has its own property-drawer rendering and is unaffected by the editor fold.

### Org property syntax

TODOseq uses Org's property-drawer conventions. Property names are case-insensitive; values and IDs keep their case. Unknown properties are preserved but not interpreted. A drawer can contain blank lines, and an unclosed drawer is left alone without consuming the following task.

`BLOCKER` and its `previous-sibling` value follow the [org-depend contrib](https://orgmode.org/worg/org-contrib/org-depend.html) convention rather than being core Org dependency keys. The `+` suffix is Org's general [property append syntax](https://orgmode.org/manual/Property-Syntax.html), not a dependency-specific keyword: `:BLOCKER+: literature-03` adds a second entry to `BLOCKER`, and is not a separate `BLOCKER+` property. Org defines multiple entries per property only when the extra keys use `+`; multiple plain entries are ambiguous, so TODOseq uses the first plain entry and reports a duplicate-property diagnostic.

Dependencies are read from the task's own drawer only. Parent tasks and file-level defaults do not pass them down; see [Local properties only](#local-properties-only).

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

The example above describes the same blockers as `:BLOCKER: data-02 literature-03`: the first form has one entry with two references, while the second has a base entry and an appended entry. The `+` form is useful when adding a reference without rewriting the existing line.

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

`ARCHIVED_BLOCKER` is inactive history. It does not block completion while the archived task is absent. If the exact ID or file-plus-anchor target reappears in the scanned tasks, TODOseq treats the relationship as active immediately using the target's current state: an incomplete restored target blocks, and a completed one does not.

Archiving a task that others depend on moves their active `BLOCKER` references into `ARCHIVED_BLOCKER` automatically, so archiving a prerequisite does not strand its dependents as permanently blocked. Restoring the prerequisite moves those references back to `BLOCKER`. Each dependent is re-read before it is changed; if its note no longer matches, the reference is left alone, the dependent is reported, and the next restore or dependency change retries it. All of this is session-scoped bookkeeping — the only durable change is the property text in your notes.

## Optional structural dependencies

Two independent settings are off by default:

- **Respect parent and ordered task dependencies** blocks an incomplete parent while an indented or heading child is unfinished, and makes a task wait for an `ORDERED` previous sibling. Markdown nesting can come from headings or indentation; plain keyword tasks do not need a list marker or checkbox.
- **Require checkboxes to be complete** blocks an incomplete parent while an unchecked descendant checkbox exists. In Markdown this covers the bounded task subtree, excluding the parent's own checkbox. In Org it follows the current entry body and stops at the next headline.

Both settings only add reasons; explicit `BLOCKER` references and `previous-sibling` remain active with either setting off. Turning the global **Enforce blocked tasks** setting off changes only whether completion is refused, not the derived blocked state used by search, dashboards and row styling.

### Markdown boundaries

A heading without a task keyword is a hard boundary. It does not pass ancestry or sibling continuity to the tasks below it:

```markdown
# TODO Launch

## Research

TODO Gather evidence
```

`Gather evidence` does not block `Launch`, and `ORDERED` or `previous-sibling` does not reach across the `Research` heading. A task heading is different: `## TODO Research` under `# TODO Launch` is a child. Explicit IDs and file-qualified block links still cross either boundary.

For indented task groups, blank lines preserve the group, and a prose line at the parent's indent or shallower closes it. Later indentation alone does not reconnect:

```markdown
TODO Parent

TODO Child
```

`Child` is nested above. Below, `Later task` is not:

```markdown
TODO Parent
A separate paragraph.
TODO Later task
```

Deeper prose and task metadata or drawers do not close the group. A heading section's ownership is not ended by ordinary prose; only another heading ends it.

A checkbox row without a task keyword is a structural checkbox, not a task. It can block a bounded ancestor when **Require checkboxes to be complete** is on, appears in the reason details with its source line, and is never collected as a task or shown in search.

An archived task and its branch are outside an outer task's structural obligations. An active task nested inside that branch still has its own local children, checkboxes and explicit references, but its incompleteness does not leak back to an outer ancestor.

### Org checkbox scope

Org checkbox checks stay inside the current headline's body and stop at the next headline, including a child or non-task headline, matching Org's own entry scope:

```org
* TODO Parent
  - [X] Entry checkbox complete
** TODO Child
   - [ ] Child entry checkbox incomplete
```

`Parent` is not checkbox-blocked by the child entry's checkbox; `Child` is blocked by its own. The same shape in Markdown is recursive: an unchecked checkbox under a nested task does block the ancestor. Checked `[X]` counts as complete; partial `[-]` and unchecked `[ ]` do not.

`NOBLOCKING` is a local, durable declaration, not a one-time override. It suppresses all reasons for that task but does not change other tasks that reference it; an incomplete `NOBLOCKING` task still blocks its own dependents. Use **Complete anyway** for a single completion override.

## Previous sibling and ORDERED

`BLOCKER: previous-sibling` names the immediately preceding task sibling in the same file and section. It is not an ID and never searches another file. `ORDERED` on a task makes every later task sibling in the same file and section wait until it completes. Both follow the same direct completion rule as IDs: complete the target and the dependent is released.

## Searching by blocked status

Use `blocked:true` in the Task List search to find incomplete tasks waiting on a dependency, and `blocked:false` for tasks that are actionable or already complete. The values are lowercase and must be exactly `true` or `false`; an invalid value is rejected with a message naming both accepted forms. Negation and composition work as usual, for example `-blocked:true priority:high` or `state:TODO blocked:false`.

A missing, ambiguous, excluded or temporarily unvalidated reference counts as blocked for an incomplete task. Dashboard cards can group by `blocked`; their two buckets use the same `blocked:true` and `blocked:false` queries.

## Completion enforcement and task actions

Blocked tasks carry a lock immediately before the keyword in the Task List, embedded task lists, reading view and editor, and the row keeps its normal text colour instead of being dimmed. In task lists and embedded lists the lock is a focusable button: hovering or focusing it shows the blocking reasons, and clicking it or pressing Enter/Space opens them in a notice. Reader views draw the same lock before the keyword of Markdown, heading, bullet and table tasks; Live Preview and source-mode editors draw it before the keyword on plain, heading and bullet task lines. The reading view's lock opens the reasons, while the editor marker shows them in its tooltip. The marker is derived at render time and writes nothing. Markers update when the current file's task snapshot publishes, so adding or removing a `BLOCKER` reference takes effect without another edit.

A **source diagnostic** — an unresolved, ambiguous or invalid reference, a dependency cycle or duplicate IDs — replaces the lock with a warning triangle in the Task List, embedded task lists, reading view and editor. Its tooltip carries the first diagnostic and any remaining count, and repairing the reference removes it on the next render or decoration refresh. Ordinary waiting on an incomplete task is normal blocked state and shows only the lock; a task never carries both markers.

Diagnostics are shown quietly. The affected task carries a warning triangle whose tooltip names the first problem, and the Task List toolbar shows an **Issues** count. Select it, or run **Show task issues** from the command palette, to open the list with each problem's source task; select a row to jump to that task. Property problems are labelled **Property problem** and dependency-graph problems are labelled **Dependency problem**. The panel has a close button and shows **Checking task diagnostics…** while the index is still rebuilding. TODOseq does not show a notice for each edit; notices are reserved for actions you take and for failures that need your attention. All of these markers are session-local: nothing is persisted to the vault.

When **Enforce blocked tasks** is on (the default), completing a blocked task from a TODOseq checkbox, keyword menu, command or context menu is refused. The notice explains that the task cannot be completed yet, names the blocking reasons, and points to **Complete anyway** in the task context menu or the **Complete blocked task** command. Nothing is written and the task stays in its original state. A refused checkbox springs back immediately, and a queued completion is checked again just before the write, so a blocker that reopens in the meantime is still caught. Use that override when you deliberately need to complete the task anyway. Disabling enforcement in [Settings](/settings) allows normal completion while blocked status remains visible in search, dashboards and row styling.

This gate covers plugin completion actions only. Editing the note text manually, syncing a file or changing it outside Obsidian remains authoritative and is picked up on the next scan.

### Copying identities

The task context menu can copy an `ID` or a Markdown block anchor:

- **Copy ID** reuses the task's authored ID. If it has none, TODOseq writes a UUID to the task's property drawer and then copies it. Scanning or capturing a task never creates an ID by itself.
- **Copy anchor** is available for Markdown task lines. It reuses the task's block anchor or creates one, then copies a file-qualified link such as `[[Projects/Plan#^todoseq-a1b2c3d4]]`. The anchor goes on the last line of the task's recognised metadata block, because Obsidian only resolves a block reference at the end of that block:

  ```markdown
  TODO Test another
  SCHEDULED: <2026-11-23 Mon>
  :PROPERTIES:
  :EXTRA: testing
  :END: ^todoseq-a1b2c3d4
  ```

  A task with no metadata carries the anchor on its own line. A trailing anchor is ignored by date, `DESCRIPTION:` and property parsing, so the metadata still reads normally. The anchor also keeps Obsidian's own faint block-anchor styling: TODOseq's muted date, description and drawer styling stops before it, and an anchored `:END:` still closes the drawer. Only the recognised metadata block is anchored: a blank line ends it, and an indented continuation paragraph is not covered. Org, code-comment and table tasks are not supported.

  Older notes may still have the anchor on the task line. TODOseq reads that anchor as before, and running **Copy anchor** moves it to the end of the block while keeping the same identifier and copied link. Repeated **Copy anchor** reuses the anchor without writing again. Scanning never rewrites notes, so an existing task-line anchor stays where it is until you run **Copy anchor**; references to it remain unresolvable in Obsidian until then.

**Add copied link as blocker** reads one ID or file-qualified block link from the clipboard, resolves it to exactly one collected task, and appends it to the current task's `BLOCKER` list. Ambiguous or invalid clipboard content is rejected without writing.

## Moving and copying tasks

Moving, copying or migrating a task through TODOseq keeps its block references working:

- **Move and migrate keep identity.** The task keeps its `ID` and block anchor at the destination, and every reference TODOseq can find is updated: `BLOCKER` and `ARCHIVED_BLOCKER` links, ordinary `[[Note#^anchor]]` links and `![[Note#^anchor]]` embeds, including in notes with no tasks.
- **Copy forks identity.** A copied task with an `ID` gets a new UUID and a copied task with a block anchor gets a new anchor. References inside the copied block are remapped to the copy; references elsewhere stay attached to the original. A task with neither identity is copied without one.
- **Migrate cleans the history entry.** The destination keeps the original `ID` and anchor; the migrated line left behind drops both so it is not a second owner of the same identity.

If a reference cannot be rewritten, the transfer stays in place and the plugin reports how many links failed. The notice includes a **Retry** button, and **Retry failed task reference repairs** in the command palette retries exactly those links during the current session. A failed block move makes no reference changes at all. Moves repair references to every anchored task in the transferred block, including nested rows.

Renaming a note in Obsidian is handled by Obsidian; TODOseq does not chase file renames. Moving text outside TODOseq is best-effort: a stale reference is reported by the existing broken-reference warning after the next scan, and TODOseq never guesses a new target.

## Local properties only

TODOseq reads dependency properties from the task's own drawer. Parent tasks and file-level defaults do not add an `ID`, `BLOCKER`, `ARCHIVED_BLOCKER`, `ORDERED` or `NOBLOCKING` to another task. Implicit hierarchy blocking is opt-in; explicit dependencies are not inherited.
