import { orgClosedDate, orgDate } from '../helpers.ts';

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
