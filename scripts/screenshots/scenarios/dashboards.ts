import { defineScript } from 'obsidian-demo-recorder';
import {
  DASHBOARD_SEEDS,
  TOGGLE_VIEW_MODE,
  leaveReadingMode,
  waitForPlugin,
  waitForReadingMode,
} from './helpers';

/**
 * Docs scenarios for the Dashboards page (docs/dashboards.md).
 *
 * This page is the one place prose genuinely cannot carry the content: six
 * display forms distinguished only by how they draw the same counts. But the
 * images are only useful if each one sits next to the exact query that
 * produced it, so every scene below mirrors one documented example verbatim
 * rather than showing a generic card.
 *
 * Captures — one per code block in the page:
 * - todoseq-dashboard-basic-usage      — the Basic Usage card (bar)
 * - todoseq-dashboard-example-donut    — "Work pipeline"
 * - todoseq-dashboard-example-tiles    — "Scheduled workload"
 * - todoseq-dashboard-example-heatmap  — "Due dates — next 3 months"
 * - todoseq-dashboard-example-strip    — the compact project strip
 *
 * Each card lives in its own note so the crop is the card and nothing else.
 * The Display Forms section deliberately has no image of its own: it lists
 * the six shapes in prose, and showing them stacked there duplicated what
 * the per-example shots already teach.
 *
 * Clip selectors are scoped to `.markdown-preview-view` because the recorder
 * resolves a clip with `document.querySelector` (first match, no visibility
 * filter) and the stale live-preview render is still in the document at 0×0
 * after a mode toggle.
 */
export default defineScript({
  id: 'docs-dashboards',
  title: 'docs dashboard scenarios',
  format: 'mp4',
  width: 1400,
  height: 900,
  stills: { mode: 'only', scale: 1 },
  setup: {
    // Same reasoning as the other full-window scenarios: the recorder hides
    // the ribbon and status bar unless told otherwise, which makes a card shot
    // look like a floating fragment instead of something inside Obsidian. The
    // status bar also carries the plugin's own task/backlink summary. Both
    // sidebars stay collapsed so the cards keep the note's full width.
    hideRibbon: false,
    hideStatusBar: false,
    hideLeftSidebar: true,
    hideRightSidebar: true,
    vault: {
      files: Object.entries(DASHBOARD_SEEDS).map(([path, content]) => ({
        path,
        content,
      })),
    },
  },
  scenes: [
    {
      id: 'basic-usage',
      name: 'Basic usage card',
      actions: [
        waitForPlugin(),
        { type: 'open-file', name: 'Dashboard Basic' },
        { type: 'wait-for', selector: '.cm-editor' },
        // Reading mode: cards render at their final size with no live-preview
        // gutter or active-line highlight competing with them.
        TOGGLE_VIEW_MODE,
        waitForReadingMode(),
        {
          type: 'wait-for',
          fn: `() => !!document.querySelector('.markdown-preview-view .todoseq-dashboard-bar')`,
          timeout: 10000,
        },
        { type: 'wait', ms: 900 },
        {
          type: 'screenshot',
          name: 'dashboard basic usage',
          id: 'todoseq-dashboard-basic-usage',
          selector: '.markdown-preview-view .todoseq-dashboard-container',
          padding: 8,
        },
        ...leaveReadingMode(),
      ],
    },
    {
      id: 'donut',
      name: 'Work pipeline donut',
      actions: [
        { type: 'open-file', name: 'Dashboard Donut' },
        { type: 'wait-for', selector: '.cm-editor' },
        TOGGLE_VIEW_MODE,
        waitForReadingMode(),
        {
          type: 'wait-for',
          fn: `() => !!document.querySelector('.markdown-preview-view .todoseq-dashboard-donut')`,
          timeout: 10000,
        },
        { type: 'wait', ms: 900 },
        {
          type: 'screenshot',
          name: 'dashboard donut',
          id: 'todoseq-dashboard-example-donut',
          selector: '.markdown-preview-view .todoseq-dashboard-container',
          padding: 8,
        },
        ...leaveReadingMode(),
      ],
    },
    {
      id: 'tiles',
      name: 'Scheduled workload tiles',
      actions: [
        { type: 'open-file', name: 'Dashboard Tiles' },
        { type: 'wait-for', selector: '.cm-editor' },
        TOGGLE_VIEW_MODE,
        waitForReadingMode(),
        {
          type: 'wait-for',
          fn: `() => !!document.querySelector('.markdown-preview-view .todoseq-dashboard-tiles')`,
          timeout: 10000,
        },
        { type: 'wait', ms: 900 },
        {
          type: 'screenshot',
          name: 'dashboard tiles',
          id: 'todoseq-dashboard-example-tiles',
          selector: '.markdown-preview-view .todoseq-dashboard-container',
          padding: 8,
        },
        ...leaveReadingMode(),
      ],
    },
    {
      id: 'heatmap',
      name: 'Deadlines heatmap',
      actions: [
        { type: 'open-file', name: 'Dashboard Heatmap' },
        { type: 'wait-for', selector: '.cm-editor' },
        TOGGLE_VIEW_MODE,
        waitForReadingMode(),
        {
          type: 'wait-for',
          fn: `() => !!document.querySelector('.markdown-preview-view .todoseq-dashboard-heatmap')`,
          timeout: 10000,
        },
        { type: 'wait', ms: 900 },
        {
          type: 'screenshot',
          name: 'dashboard heatmap',
          id: 'todoseq-dashboard-example-heatmap',
          selector: '.markdown-preview-view .todoseq-dashboard-container',
          padding: 8,
        },
        ...leaveReadingMode(),
      ],
    },
    {
      id: 'strip',
      name: 'Compact strip',
      actions: [
        { type: 'open-file', name: 'Dashboard Strip' },
        { type: 'wait-for', selector: '.cm-editor' },
        TOGGLE_VIEW_MODE,
        waitForReadingMode(),
        {
          type: 'wait-for',
          fn: `() => !!document.querySelector('.markdown-preview-view .todoseq-dashboard-strip')`,
          timeout: 10000,
        },
        { type: 'wait', ms: 700 },
        {
          type: 'screenshot',
          name: 'dashboard strip',
          id: 'todoseq-dashboard-example-strip',
          selector: '.markdown-preview-view .todoseq-dashboard-container',
          padding: 8,
        },
        ...leaveReadingMode(),
      ],
    },
  ],
});
