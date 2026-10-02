/**
 * Shared helpers for the docs screenshot scenarios (ODR demo scripts).
 *
 * Scenarios need no plugin-load bootstrap: ODR verifies the staged plugin
 * post-launch, sets the Obsidian 1.13+ `enable-plugin-<appId>` localStorage
 * gate, calls loadPlugin, and fails the run naming the plugin if it still did
 * not load. Nothing to set up here.
 *
 * ## Demo content rules
 *
 * These govern every seeded file and every future scenario:
 *
 * 1. **TODOseq syntax only.** Dates live on their own `SCHEDULED:` /
 *    `DEADLINE:` / `CLOSED:` / `STARTED:` line immediately below the task, and
 *    nowhere else. An inline `<2026-10-01>` in the task text is *Tasks* plugin
 *    syntax that TODOseq never parses — it renders as dead literal text that
 *    merely looks like a date, which is worse than no date at all because the
 *    screenshot appears to demonstrate something it does not. Same for
 *    completion emoji: state is carried by the keyword and the checkbox, not
 *    decoration. Priorities are `[#A]`/`[#B]`/`[#C]` after the keyword;
 *    checkboxes are `- [ ]` / `- [x]`.
 *
 * 2. **Keep each demo focused.** A screenshot should make its point in one
 *    glance, so a seed carries only the tasks the scene is actually about. A
 *    list padded with filler rows shrinks every row until the feature is
 *    unreadable and buries what the shot is for. Volume is the exception, not
 *    the default: reach for a long list only in search and filter scenarios,
 *    where having something to narrow is the entire point (see
 *    SEARCH_FILTER_SEEDS).
 *
 * 3. **No H1 in the note body.** Obsidian already renders the file name at H1
 *    size, so an `# Title` line just repeats it — two titles stacked, one
 *    redundant, and it reads as a mistake rather than as documentation. Start
 *    with a line or two of intro content, then use `##` sub-headings to give
 *    the note structure.
 */

/** ODR script action shape (subset used here). */
export interface Action {
  type: string;
  [key: string]: unknown;
}

/**
 * Wait until the plugin object exists.
 *
 * A plain arrow *definition* — ODR normalizes definition-style `fn` strings
 * into an immediate invocation before handing them to Playwright, so the body
 * actually runs and the predicate is polled for real.
 */
export function waitForPlugin(): Action {
  return {
    type: 'wait-for',
    fn: `() => !!(window.app && app.plugins && app.plugins.plugins && app.plugins.plugins.todoseq)`,
    timeout: 15000,
  };
}

/**
 * Wait for the task list view to exist: the leaf content carries
 * data-type="todoseq-view" and the view body carries .todoseq-panel.
 */
export function waitForTaskListView(): Action {
  return {
    type: 'wait-for',
    fn: `() => !!document.querySelector('.workspace-leaf-content[data-type="todoseq-view"] .todoseq-panel')`,
    timeout: 10000,
  };
}

/**
 * Open the TODOseq settings dialog inside the recorder's page.
 *
 * Obsidian 1.13+ renders settings in a *separate Electron window*
 * (`app.setting.win`), but the recorder drives only `contexts[0].pages()[0]` and
 * has no page targeting — so a `wait-for .vertical-tab-nav-item` on the
 * recorder's page can never match. The window is same-origin reachable, so its
 * `.modal` node is adopted into our document and re-anchored into the viewport.
 * Obsidian's own stylesheet is loaded here too, so it renders identically.
 */
export function openSettingsDialog(tabId = 'todoseq'): Action {
  return {
    type: 'evaluate',
    fn: `() => {
      app.setting.open();
      app.setting.openTabById('${tabId}');
      const win = app.setting.win;
      const modal = win && win.document && win.document.querySelector('.modal');
      if (!modal) throw new Error('settings dialog: no .modal in the settings window');
      document.body.appendChild(modal);
      // The adopted node keeps absolute offsets from the other window's
      // viewport (it lands at y=640), so re-anchor it into ours.
      modal.style.position = 'fixed';
      modal.style.left = '50%';
      modal.style.top = '50%';
      modal.style.right = 'auto';
      modal.style.bottom = 'auto';
      modal.style.transform = 'translate(-50%, -50%)';
      modal.style.width = '920px';
      modal.style.height = '560px';
      modal.style.maxWidth = '920px';
      modal.style.maxHeight = '560px';
      return { adopted: true };
    }`,
  };
}

/** Wait for the adopted settings dialog to be laid out inside the viewport. */
export function waitForSettingsDialog(): Action {
  return {
    type: 'wait-for',
    fn: `() => {
      const modal = document.querySelector('.modal');
      if (!modal || !document.body.contains(modal)) return false;
      const r = modal.getBoundingClientRect();
      if (r.width < 100 || r.height < 100) return false;
      return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
    }`,
    timeout: 10000,
  };
}

/** Scroll the settings sidebar so the active (TODOseq) tab is in view. */
export function revealActiveSettingsTab(): Action {
  return {
    type: 'evaluate',
    fn: `() => {
      const active = document.querySelector('.vertical-tab-nav-item.is-active');
      if (active) active.scrollIntoView({ block: 'center' });
      const title = active && active.querySelector('.vertical-tab-nav-item-title');
      return { scrolledTo: title ? title.textContent.trim() : null };
    }`,
  };
}

/**
 * Switch the active leaf between editing and reading mode.
 *
 * `markdown:toggle-preview` is the real id on current Obsidian — there is no
 * `editor:toggle-preview`. The recorder fails fast on unknown ids, which is how
 * the wrong id surfaced.
 */
export const TOGGLE_VIEW_MODE: Action = {
  type: 'command',
  id: 'markdown:toggle-preview',
};

/** Wait until the active leaf is actually rendering a reading-mode view. */
export function waitForReadingMode(): Action {
  return {
    type: 'wait-for',
    fn: `() => !!document.querySelector('.workspace-leaf.mod-active .markdown-preview-view')`,
    timeout: 10000,
  };
}

/** Wait until the active leaf is back in editing (live preview) mode. */
export function waitForEditingMode(): Action {
  return {
    type: 'wait-for',
    fn: `() => !!document.querySelector('.workspace-leaf.mod-active .cm-editor')`,
    timeout: 10000,
  };
}

/**
 * Actions that leave the active leaf in editing mode again.
 *
 * The recorder's open-file waits for `.cm-editor, .markdown-source-view` to be
 * visible, so a leaf left in reading mode makes the *next* scene's open-file
 * time out. Every scene that enters reading mode must leave it.
 */
export function leaveReadingMode(): Action[] {
  return [TOGGLE_VIEW_MODE, waitForEditingMode()];
}

/** Local YYYY-MM-DD, offset in days from today. */
export function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Org-mode planning date `<YYYY-MM-DD>` with local offset. */
export function orgDate(days: number): string {
  return `<${dateOffset(days)}>`;
}

/**
 * Org-mode CLOSED date `[YYYY-MM-DD Ddd]` with local offset.
 *
 * Square brackets mark an inactive timestamp (CLOSED/STARTED); the day name is
 * optional in the grammar but included so the seeded files match the shape the
 * docs show.
 */
export function orgClosedDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `[${dateOffset(days)} ${weekday}]`;
}

/**
 * Org-mode date carrying a warning period, e.g. `<2026-10-01 -3d>`.
 *
 * The suffix is passed exactly as it is written (`-3d`, `--2d`) rather than
 * derived from a number, so a seed reads the way the docs write it.
 */
export function orgWarningDate(days: number, warning: string): string {
  return `<${dateOffset(days)} ${warning}>`;
}

/**
 * Seed notes for the docs scenarios.
 *
 * No H1 anywhere: Obsidian already renders the file name as the page title at
 * H1 size, and the editor draws it above the note body, so an `# Title` line
 * would just repeat it.
 *
 * Prose sits on one source line per paragraph even when that makes the line
 * long. Obsidian renders each source line as its own block, so wrapping a
 * sentence to keep the seed tidy shows up in the screenshot as a gap straight
 * through the paragraph — the soft wrap is the editor's job, not the seed's.
 *
 * Deliberately small. Phoenix carries the states, priority, tags and all three
 * date kinds the task-list and reader shots need to look real; the other two
 * notes exist only to give the vault some texture. Dates are relative to the
 * capture day, which is what the scenario hash normalizes away.
 */
export const DEMO_SEEDS: Record<string, string> = {
  'Project Phoenix.md': `Tracking the work behind the Phoenix release. Tasks are declared with a state keyword, and each date lives on its own line beneath the task it belongs to.

## Launch

TODO [#A] Finalize launch checklist #phoenix
SCHEDULED: ${orgDate(0)}

DOING [#A] Implement search filters #phoenix #coding
SCHEDULED: ${orgDate(0)}
DEADLINE: ${orgDate(2)}

## Announcements

TODO Draft release announcement #phoenix
SCHEDULED: ${orgDate(1)}

## Closed out

DONE Write integration test suite #phoenix
CLOSED: ${orgClosedDate(-1)}
`,
  'Weekly Review.md': `Recurring coordination work for the week.

## Before the sync

TODO Prepare agenda for team sync #admin
SCHEDULED: ${orgDate(0)}

## Waiting on others

WAITING Compliance sign-off from legal #admin
DEADLINE: ${orgDate(5)}
`,
  'Reading List.md': `Loose threads worth picking up later.

## Writing

TODO Outline essay on tooling #personal
SCHEDULED: ${orgDate(4)}
`,
};

/**
 * Volume seed for search and filter scenarios ONLY.
 *
 * This is the one place a long task list is the point: filtering, sorting and
 * "n of m" counts are only legible when there is something to narrow. Keep it
 * out of the focused seeds — a list this long in a task-list or reader shot
 * shrinks every row until the feature being demonstrated is unreadable.
 */
export const SEARCH_FILTER_SEEDS: Record<string, string> = {
  'Backlog.md': `Everything queued but not yet started, kept in one place so the filters have something to work against.

## Unscheduled backlog

${Array.from({ length: 14 }, (_, i) => {
  const state = i % 4 === 0 ? 'DOING' : i % 7 === 0 ? 'WAITING' : 'TODO';
  const priority = i % 3 === 0 ? '[#A] ' : '';
  return `${state} ${priority}Backlog item ${i + 1} #backlog\nSCHEDULED: ${orgDate(i % 9)}`;
}).join('\n\n')}
`,
};

/**
 * Editor-specific notes: the checkbox/keyword pairing and the bare task the
 * date-autocomplete scene types into.
 */
export const EDITOR_SEEDS: Record<string, string> = {
  'Checkbox Demo.md': `A checkbox and a state keyword can sit on the same line — TODOseq keeps them in sync when you change state from the task list.

## Tasks

- [ ] TODO Task with empty checkbox
SCHEDULED: ${orgDate(0)}

- [x] DONE Task with checked checkbox
CLOSED: ${orgClosedDate(-1)}

TODO Plain keyword task, no checkbox
`,
  'Date Demo.md': `Type a date keyword and the org-mode date is filled in for you.

## Tasks

TODO Book conference flights
`,
};

/** Embedded-list notes: a working embed, an empty result, and a bad option. */
export const EMBED_SEEDS: Record<string, string> = {
  'Embedded Demo.md': `An embedded list is a normal code block, so it can live anywhere a note does — and it keeps itself in step with the tasks it matches.

## Live embed

Tasks matching the embed below update live:

\`\`\`todoseq
search: tag:phoenix
sort: urgency
title: Phoenix Tasks
\`\`\`
`,
  'Empty Demo.md': `When a query matches nothing, the embed says so instead of rendering blank.

## No matches

\`\`\`todoseq
search: tag:nonexistent-tag-xyz
\`\`\`
`,
  'Error Demo.md': `An unusable option is reported in place rather than failing silently.

## Bad sort method

\`\`\`todoseq
sort: not-a-sort-option
\`\`\`
`,
};

/**
 * The note behind the animated task-entry demo (the landing hero).
 *
 * Seeded with a single framing line only — the tasks are typed live, which is
 * the whole point of the recording, so anything pre-filled would defeat it.
 */
export const TASK_ENTRY_SEEDS: Record<string, string> = {
  'examples/TODOseq Task Entry Flow.md': `Example of task entry
`,
};

/**
 * Workload behind the dashboard cards (docs/dashboards.md).
 *
 * Every card in the page is captured next to the code block it demonstrates,
 * so this data has to satisfy those specific queries rather than merely look
 * plausible. Concretely:
 *
 * - **Basic Usage** filters `tag:project scheduled:due OR scheduled:overdue`
 *   and groups by priority, so `#project` needs overdue and due-today work
 *   spread across High/Medium/Low.
 * - **Example 1** filters `tag:work` and groups by state, so `#work` spans
 *   active, inactive, waiting and completed keywords.
 * - **Example 2** groups *everything* by scheduled with empty buckets shown,
 *   so all five date buckets — overdue, today, this week, later, none — need
 *   at least one task.
 * - **Example 3** groups by deadline over a 12-week window, so deadlines are
 *   scattered across many distinct days rather than clustered.
 * - **Example 4** filters `tag:project` and groups by priority, including
 *   tasks with no priority at all.
 *
 * Volume is the point here, and it is the documented exception to "keep demos
 * focused": a card aggregating three tasks teaches nothing, and bars sized
 * against each other only mean something when the groups actually differ.
 *
 * Tasks live across three notes so the tag groups read as real projects
 * rather than one scratch file.
 */
export const DASHBOARD_SEEDS: Record<string, string> = {
  'Project Atlas.md': `The launch itself, tracked tightly enough that the due and overdue work is visible at a glance.

## Before launch

TODO [#A] Confirm the launch date #project
SCHEDULED: ${orgDate(-2)}

TODO [#C] Chase the venue deposit #project
SCHEDULED: ${orgDate(-4)}

DOING [#A] Draft the migration plan #project
SCHEDULED: ${orgDate(0)}
DEADLINE: ${orgDate(3)}

TODO [#B] Book the venue #project
SCHEDULED: ${orgDate(0)}

TODO [#B] Send the press kit #project
SCHEDULED: ${orgDate(5)}

WAITING Legal review of the launch terms #project
DEADLINE: ${orgDate(9)}

LATER Explore a second venue #project
SCHEDULED: ${orgDate(25)}

## Wrap-up

TODO Write the launch retrospective #project

DONE Close out the beta cohort #project
CLOSED: ${orgClosedDate(-30)}
`,
  'Platform Work.md': `Engineering work feeding the launch, tagged both ways so the tag cards have overlap to show.

## API

TODO [#A] Rate-limit the public API #work #project
SCHEDULED: ${orgDate(1)}
DEADLINE: ${orgDate(12)}

DOING [#B] Backfill request metrics #work #platform
SCHEDULED: ${orgDate(2)}
DEADLINE: ${orgDate(19)}

TODO [#C] Deprecate the v1 responses #work
SCHEDULED: ${orgDate(6)}
DEADLINE: ${orgDate(33)}

## Tooling

TODO Move off the legacy queue #work
SCHEDULED: ${orgDate(14)}
DEADLINE: ${orgDate(47)}

WAITING Vendor confirmation on the SLA #work
DEADLINE: ${orgDate(26)}

DONE Ship the audit log #work
CLOSED: ${orgClosedDate(-9)}
`,
  'Operations.md': `Everything that is neither the launch nor the code, kept light so the tag totals differ.

## Finance

TODO [#B] Reconcile September invoices #work
SCHEDULED: ${orgDate(4)}
DEADLINE: ${orgDate(17)}

TODO Month-end close checklist #work
SCHEDULED: ${orgDate(8)}

TODO [#C] Renew the insurance #work
SCHEDULED: ${orgDate(45)}
DEADLINE: ${orgDate(52)}

DONE Issue the Q3 summary #work
CLOSED: ${orgClosedDate(-20)}
`,
  'Dashboard Basic.md': `The card matches the query above it line for line.

\`\`\`todoseq-dashboard
search: tag:project scheduled:due OR scheduled:overdue
group-by: priority
display: bar
title: Due & overdue
\`\`\`
`,
  'Dashboard Donut.md': `\`\`\`todoseq-dashboard
search: tag:work
group-by: state
display: donut
title: Work pipeline
\`\`\`
`,
  'Dashboard Tiles.md': `\`\`\`todoseq-dashboard
group-by: scheduled
display: tiles
title: Scheduled workload
show-empty: show
\`\`\`
`,
  'Dashboard Heatmap.md': `\`\`\`todoseq-dashboard
group-by: deadline
display: heatmap
heatmap-window: 12
title: Due dates — next 3 months
\`\`\`
`,
  'Dashboard Strip.md': `\`\`\`todoseq-dashboard
search: tag:project
group-by: priority
display: strip
\`\`\`
`,
};

/**
 * Workload behind the archive dialog (docs/auto-archive.md).
 *
 * The preview list is empty unless the vault actually holds archivable tasks,
 * and "archivable" means three things at once: a completed-state keyword, a
 * CLOSED date older than the criterion (default 90 days), and an enabled
 * mapping to a valid archived keyword. Two mechanisms are therefore in play —
 *
 * - the DONE tasks carry CLOSED dates 100-190 days back, comfortably past the
 *   default 90-day criterion, so nothing has to be reconfigured to see them;
 * - the scenario enables the DONE → ARCHIVED mapping through the plugin
 *   settings rather than by driving the settings dialog, because the dialog
 *   lives in Obsidian's separate settings window and reaching it would add a
 *   fragile click path to a shot whose subject is the archive dialog itself.
 *
 * The near-miss tasks are deliberate: one closed inside the window and one
 * with no CLOSED date at all, so the preview shows the boundary rather than a
 * uniform list, and the "never archived without a closed date" rule in the
 * docs is visible.
 */
export const ARCHIVE_SEEDS: Record<string, string> = {
  'Shipped Work.md': `Work that finished a while ago, sitting in the notes until an archive run collects it.

## Closed long ago

DONE Rebuild the import pipeline #platform
CLOSED: ${orgClosedDate(-190)}

DONE Write the migration guide #docs
CLOSED: ${orgClosedDate(-160)}

DONE Retire the legacy exporter #platform
CLOSED: ${orgClosedDate(-140)}

DONE Audit third-party licenses #admin
CLOSED: ${orgClosedDate(-120)}

DONE Tune the search index #platform
CLOSED: ${orgClosedDate(-100)}

## Too recent, and undated

DONE Fix the flaky export test #platform
CLOSED: ${orgClosedDate(-20)}

DONE Tidy the changelog #docs
`,
  'Still Open.md': `Work that is not finished, and so is not a candidate for archiving at all.

TODO Rotate the staging credentials #platform
SCHEDULED: ${orgDate(1)}

DOING Review the dependency bump #platform
SCHEDULED: ${orgDate(3)}

WAITING Vendor confirmation on the SLA #admin
DEADLINE: ${orgDate(7)}
`,
};

/**
 * Seeds for the warning-period docs screenshot (docs/warning-periods.md and the
 * Warning Period Indicators section of docs/task-list.md).
 *
 * Exactly two tasks, one per arrow direction, and nothing else in the vault:
 * the asset is a detail crop of the task list rows, so a third task would
 * appear in it and shrink the two that are being demonstrated.
 *
 * The offsets are chosen so each task's *effective* visibility date lands inside
 * the default 7-day upcoming window. That is the constraint that is easy to
 * miss: the task list filters on the effective date, not the raw one, so
 * "a scheduled date in the past" does not by itself keep a row on screen —
 * add a delay long enough and it has moved out of the window and vanished.
 * tests/screenshot-seed-visibility.test.ts pins it.
 */
export const WARNING_PERIOD_SEEDS: Record<string, string> = {
  // Named for the demo rather than for the feature: every panel row ends with
  // a `file:line` provenance line, so a seed called "Warning Periods.md"
  // stamped that name under both rows in the crop. "Quarter Close" reads as
  // the note the tasks actually live in.
  'Quarter Close.md': `Work that has to land before the quarter closes.

TODO [#B] Chase the vendor invoice
SCHEDULED: ${orgWarningDate(-1, '-3d')}

TODO [#B] File the quarterly report
DEADLINE: ${orgWarningDate(10, '-7d')}
`,
};
