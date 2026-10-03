import { defineScript } from 'obsidian-demo-recorder';
import {
  WARNING_PERIOD_SEEDS,
  waitForPlugin,
  waitForTaskListView,
} from './helpers';

/**
 * Docs scenarios for warning periods (docs/warning-periods.md, and the Warning
 * Period Indicators section of docs/task-list.md).
 *
 * Captures:
 * - todoseq-warning-period-arrows — the two task rows carrying a warning
 *   period, one per arrow direction (detail crop of the task list container)
 *
 * The arrows are small glyphs sitting after a date badge, so the asset is a
 * crop of the rows themselves: in a full-window shot the reader cannot see
 * them at all. Its own vault, seeded with nothing but the two rows, so the
 * crop is exactly the pair being demonstrated — the panel lists every task in
 * the vault, so a shared seed would put every other demo task in the frame.
 */
export default defineScript({
  id: 'docs-warning-periods',
  title: 'docs warning period scenarios',
  format: 'mp4',
  width: 1400,
  height: 900,
  stills: { mode: 'only', scale: 1 },
  setup: {
    // A clipped shot of the right dock, so the recorder's chrome hiding does
    // not matter here; the left sidebar is collapsed to give the dock room and
    // the ribbon/status bar are left visible because the panel contributes its
    // own "N tasks" summary there.
    hideRibbon: false,
    hideStatusBar: false,
    hideLeftSidebar: true,
    hideRightSidebar: true,
    vault: {
      files: Object.entries(WARNING_PERIOD_SEEDS).map(([path, content]) => ({
        path,
        content,
      })),
    },
  },
  scenes: [
    {
      id: 'warning-arrows',
      name: 'Warning period arrows',
      actions: [
        waitForPlugin(),
        { type: 'command', id: 'todoseq:show-task-list' },
        waitForTaskListView(),
        { type: 'open-file', name: 'Quarter Close' },
        { type: 'wait-for', selector: '.cm-editor' },
        // Wait on the arrows themselves rather than a fixed delay: a row that
        // fell outside the upcoming window would otherwise be captured as a
        // one-row image that looks merely sparse.
        { type: 'wait-for', selector: '.todoseq-task-date-warning-arrow' },
        { type: 'wait', ms: 600 },
        {
          type: 'screenshot',
          name: 'warning period arrows',
          id: 'todoseq-warning-period-arrows',
          // The inner list, not `.todoseq-task-list-container`: the
          // container fills the dock height, so cropping it leaves a third of
          // the asset empty below the two rows.
          selector: 'ul.todoseq-task-list',
          padding: 6,
        },
      ],
    },
  ],
});
