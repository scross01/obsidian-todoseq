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

Use `blocked:true` in the Task List search to find incomplete tasks waiting on a dependency, and `blocked:false` for tasks that are actionable or already complete. The values are lowercase and must be exactly `true` or `false`. Negation and composition work as usual, for example `-blocked:true priority:high` or `state:TODO blocked:false`.

A missing, ambiguous, excluded or temporarily unvalidated reference counts as blocked for an incomplete task. Dashboard cards can group by `blocked`; their two buckets use the same `blocked:true` and `blocked:false` queries.

## Completion enforcement and task actions

Blocked tasks are dimmed with a lock icon in the Task List and embedded task lists. The lock is a focusable button: hovering or focusing it shows the blocking reasons, and clicking it or pressing Enter/Space opens them in a notice. Reader views draw the same lock beside Markdown, heading, bullet and table tasks, with the blocking reasons in its tooltip and the same keyboard/tap activation. The marker is derived at render time and writes nothing.

Live Preview and source-mode editors add a warning icon only for **source diagnostics**: an unresolved, ambiguous or invalid reference, a dependency cycle or duplicate IDs. Ordinary waiting on an incomplete task is normal blocked state and does not show a warning. Repairing the reference removes the icon on the next decoration refresh.

Diagnostics are announced once per changed set, after indexing finishes. A rescan or optimistic update that republishes the same set does not repeat the notice; an empty set stays silent and a later relapse notifies again. The notice names the first issue and counts the rest, while full details go to the developer console. All of these markers are session-local: nothing is persisted to the vault.

When **Enforce blocked tasks** is on (the default), completing a blocked task from a TODOseq checkbox, keyword menu, command or context menu is refused with a notice naming the reasons. Nothing is written and the task stays in its original state. A refused checkbox springs back immediately, and a queued completion is checked again just before the write, so a blocker that reopens in the meantime is still caught. Use **Complete anyway** in the task context menu or the **Complete blocked task** command when you deliberately need to override it. Disabling enforcement in [Settings](/settings) allows normal completion while blocked status remains visible in search, dashboards and row styling.

This gate covers plugin completion actions only. Editing the note text manually, syncing a file or changing it outside Obsidian remains authoritative and is picked up on the next scan.

### Copying identities

The task context menu can copy an `ID` or a Markdown block anchor:

- **Copy ID** reuses the task's authored ID. If it has none, TODOseq writes a UUID to the task's property drawer and then copies it. Scanning or capturing a task never creates an ID by itself.
- **Copy anchor** is available for Markdown task lines. It reuses the task's block anchor or appends a new one, then copies a file-qualified link such as `[[Projects/Plan#^todoseq-a1b2c3d4]]`. Org, code-comment and table tasks are not supported.

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
