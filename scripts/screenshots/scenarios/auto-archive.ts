import { defineScript } from 'obsidian-demo-recorder';
import { ARCHIVE_SEEDS, waitForPlugin } from './helpers';

/**
 * Docs scenarios for the Auto-Archive page (docs/auto-archive.md).
 *
 * The page had no imagery, and it describes a dialog: a preview list with
 * per-row include/exclude controls, a criteria section and a mapping section.
 * Prose can enumerate those, but it cannot show what the dialog looks like,
 * which is the thing a reader has to recognise when they run it.
 *
 * Captures:
 * - todoseq-archive-dialog — the preview-and-confirm modal (wide crop)
 *
 * Only one shot. The page's other visual surface is the archive mapping rows
 * in settings, and those are already visible in the full settings-modal capture
 * (`todoseq-settings.png`) on the settings page, so a second crop of the same
 * rows here would add page weight without teaching anything.
 */
export default defineScript({
  id: 'docs-auto-archive',
  title: 'docs auto-archive scenarios',
  format: 'mp4',
  width: 1400,
  height: 900,
  stills: { mode: 'only', scale: 1 },
  setup: {
    // The dialog is the whole subject here, so the window chrome is cropped
    // away rather than framed — but the recorder hides the ribbon and status
    // bar unless told otherwise, and the backdrop dims whatever is behind the
    // modal, so leaving them visible keeps the dimmed window reading as an
    // Obsidian workspace instead of an empty page.
    hideRibbon: false,
    hideStatusBar: false,
    hideLeftSidebar: true,
    hideRightSidebar: true,
    vault: {
      files: Object.entries(ARCHIVE_SEEDS).map(([path, content]) => ({
        path,
        content,
      })),
    },
  },
  scenes: [
    {
      id: 'archive-dialog',
      name: 'Archive preview dialog',
      actions: [
        waitForPlugin(),
        // Open a note first so the dialog has a real workspace behind it.
        { type: 'open-file', name: 'Shipped Work' },
        { type: 'wait-for', selector: '.cm-editor' },
        // A task is only a candidate when its completed keyword has an
        // *enabled* mapping to a valid archived keyword, and that mapping is
        // off by default — with defaults the preview is empty and the shot
        // would show an empty dialog, which is the least representative state
        // of the feature.
        //
        // The keyword is resolved through the KeywordManager rather than
        // hardcoded, so this keeps working if the built-in vocabulary moves.
        // Only the fallbacks name a literal.
        {
          type: 'evaluate',
          fn: `() => {
            const plugin = app.plugins.plugins.todoseq;
            const km = plugin.taskStateManager.getKeywordManager();
            const source = km.getKeywordsForGroup('completedKeywords')[0] ?? 'DONE';
            const target = km.getKeywordsForGroup('archivedKeywords')[0] ?? 'ARCHIVED';
            plugin.settings.taskArchive.stateMappings = [
              { source, enabled: true, target },
            ];
            return { source, target };
          }`,
        },
        { type: 'command', id: 'todoseq:archive-completed-tasks' },
        { type: 'wait-for', selector: '.todoseq-archive-modal' },
        {
          type: 'wait-for',
          // Wait for the preview to actually populate before shooting: the
          // dialog renders its shell first and fills the list after the scan
          // resolves, so an earlier shot would catch `.todoseq-archive-empty`
          // — the empty state, which is the least representative thing the
          // feature can show.
          fn: `() => {
            const modal = document.querySelector('.todoseq-archive-modal');
            return !!modal && modal.querySelectorAll('.todoseq-archive-row').length > 0;
          }`,
          timeout: 15000,
        },
        { type: 'wait', ms: 900 },
        {
          type: 'screenshot',
          name: 'archive dialog',
          id: 'todoseq-archive-dialog',
          selector: '.todoseq-archive-modal',
          padding: 6,
        },
      ],
    },
  ],
});
