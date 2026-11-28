import { orgClosedDate, orgDate } from '../helpers.ts';

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
