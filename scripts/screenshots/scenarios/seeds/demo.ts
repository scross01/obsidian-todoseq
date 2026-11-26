import { orgClosedDate, orgDate } from '../helpers.ts';

/**
 * The general demo vault.
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
