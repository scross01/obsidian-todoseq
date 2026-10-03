import { defineScript } from 'obsidian-demo-recorder';
import {
  COLLAPSE_SEEDS,
  TOGGLE_VIEW_MODE,
  leaveReadingMode,
  waitForPlugin,
  waitForReadingMode,
} from './helpers';

/**
 * Docs scenarios for collapsible embedded lists (the Collapsible Task Lists
 * section of docs/embedded-task-lists.md).
 *
 * Captures:
 * - todoseq-embedded-collapse-collapsed — the block as it first renders, header
 *   plus the "N matching tasks" footer and no rows (wide crop)
 * - todoseq-embedded-collapse-expanded — the same block after the header is
 *   clicked, chevron rotated and rows shown (wide crop)
 *
 * Two stills of one block rather than one shot of two blocks: the section has
 * to convey that the header *toggles* the list, and a collapsed block beside a
 * plain one shows two different blocks — the plain one has no `collapse:`
 * option at all, so the pair never demonstrates the interaction.
 *
 * The collapse state is also the only place the footer is rendered at all, so
 * the first crop is what proves the count line exists.
 *
 * Clip selectors are scoped to `.markdown-preview-view` for the reason
 * embedded-reader.ts gives: after a mode toggle the stale live-preview render
 * is still in the document at 0x0, and the recorder takes the first DOM match.
 */
export default defineScript({
  id: 'docs-embedded-collapse',
  title: 'docs embedded collapse scenarios',
  format: 'mp4',
  width: 1400,
  height: 900,
  stills: { mode: 'only', scale: 1 },
  setup: {
    // Every shot here is a clipped crop of one embed, so the recorder's chrome
    // hiding (ribbon, sidebars, status bar) does not affect the frame.
    hideLeftSidebar: true,
    hideRightSidebar: true,
    vault: {
      files: Object.entries(COLLAPSE_SEEDS).map(([path, content]) => ({
        path,
        content,
      })),
    },
  },
  scenes: [
    {
      id: 'collapse-toggle',
      name: 'Collapsible list, collapsed then expanded',
      actions: [
        waitForPlugin(),
        { type: 'open-file', name: 'Collapse Demo' },
        { type: 'wait-for', selector: '.cm-editor' },
        TOGGLE_VIEW_MODE,
        waitForReadingMode(),
        // The container carries a state class, so this waits for the collapsed
        // *render* rather than for the container to merely exist.
        {
          type: 'wait-for',
          selector:
            '.markdown-preview-view .todoseq-embedded-task-list-collapsed',
        },
        // The footer only exists while collapsed, so its presence is the
        // strongest signal that the first state is the real one.
        {
          type: 'wait-for',
          selector: '.markdown-preview-view .todoseq-result-count-footer',
        },
        { type: 'wait', ms: 500 },
        {
          type: 'screenshot',
          name: 'collapse collapsed',
          id: 'todoseq-embedded-collapse-collapsed',
          selector:
            '.markdown-preview-view .todoseq-embedded-task-list-container',
          padding: 8,
        },
        // Scoped like the clips above, and for the sharper reason: a bare
        // selector resolves to the stale live-preview header still in the
        // document at 0x0, which Playwright refuses to click as not visible.
        {
          type: 'click',
          selector: '.markdown-preview-view .todoseq-embedded-task-list-title',
        },
        // The toggle updates in place rather than re-rendering, and aria-expanded
        // is what it flips, so wait on that instead of a fixed delay.
        {
          type: 'wait-for',
          selector:
            '.markdown-preview-view .todoseq-embedded-task-list-title[aria-expanded="true"]',
        },
        { type: 'wait', ms: 500 },
        {
          type: 'screenshot',
          name: 'collapse expanded',
          id: 'todoseq-embedded-collapse-expanded',
          selector:
            '.markdown-preview-view .todoseq-embedded-task-list-container',
          padding: 8,
        },
        ...leaveReadingMode(),
      ],
    },
  ],
});
