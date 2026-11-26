import { orgClosedDate, orgDate } from '../helpers.ts';

/**
 * Seeds for the collapse-state docs screenshot (the Collapsible Task Lists
 * section of docs/embedded-task-lists.md).
 *
 * One embed, not two. The section needs to show that a header *toggles* the
 * list, and a note with a collapsed block beside a plain one only shows two
 * different blocks in two states — the plain one has no collapse option at
 * all, so the pair never demonstrates the interaction. The scenario instead
 * captures this one block twice, before and after the click.
 *
 * The block mirrors the example the docs show (a titled `collapse: true`
 * block over a tag search), so the image sits beside the query that produced
 * it. The tasks it matches live in the note itself: five of them, so the
 * collapsed footer has a count worth reading.
 */
export const COLLAPSE_SEEDS: Record<string, string> = {
  'Collapse Demo.md': `A collapsible list keeps a long result set out of the way until it is wanted.

\`\`\`todoseq
title: Phoenix release
collapse: true
search: tag:phoenix
sort: urgency
\`\`\`

## Launch

TODO [#A] Finalize launch checklist #phoenix
SCHEDULED: ${orgDate(0)}

DOING [#A] Implement search filters #phoenix
SCHEDULED: ${orgDate(0)}
DEADLINE: ${orgDate(2)}

TODO [#B] Draft release announcement #phoenix
SCHEDULED: ${orgDate(1)}

WAITING Compliance sign-off from legal #phoenix
DEADLINE: ${orgDate(5)}

DONE Write integration test suite #phoenix
CLOSED: ${orgClosedDate(-1)}
`,
};
