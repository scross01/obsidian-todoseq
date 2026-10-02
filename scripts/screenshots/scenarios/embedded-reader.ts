import { defineScript } from 'obsidian-demo-recorder';
import {
  DEMO_SEEDS,
  EMBED_SEEDS,
  TOGGLE_VIEW_MODE,
  leaveReadingMode,
  waitForPlugin,
  waitForReadingMode,
} from './helpers';

/**
 * Docs scenarios for embedded task lists (docs/embedded-task-lists.md), the
 * reader page (docs/reader.md) and the introduction hero (docs/introduction.md).
 *
 * Clip selectors are scoped to `.markdown-preview-view`: the recorder resolves
 * a clip with `document.querySelector` (first DOM match, no visibility filter),
 * and after a mode toggle the stale live-preview render is still in the
 * document at 0×0 — clipping the bare class name resolves to that and fails.
 *
 * Captures:
 * - todoseq-editor-embedded-tasklist — note with embedded list in reading mode (full)
 * - todoseq-embedded-list-example    — the embed container (wide crop)
 * - todoseq-embedded-list-empty      — empty state (wide crop)
 * - todoseq-embedded-list-error      — error state (bare, no sizing class)
 * - todoseq-reader-view              — reading mode with styled tasks (full)
 * - todoseq-screenshot-dark          — intro hero: task list + editor open (full)
 *
 * The search options dropdown lives in its own scenario (search.ts): it needs a
 * long list to filter, which would swamp every shot here.
 */
export default defineScript({
  id: 'docs-embedded-reader',
  title: 'docs embedded + reader scenarios',
  format: 'mp4',
  width: 1400,
  height: 900,
  stills: { mode: 'only', scale: 1 },
  setup: {
    // The recorder hides Obsidian's ribbon and status bar by default
    // (`ScriptSetup`, applied in its resetLayout). That suits the clipped shots
    // here, which ignore chrome entirely, but not the full-window ones — those
    // should show the app as a user sees it, status bar included: the plugin
    // contributes its own "N tasks / N backlinks" summary there, which is worth
    // showing. The left sidebar stays collapsed so the note keeps the width.
    // The right dock is collapsed here too, but every scene below re-opens it
    // with `todoseq:show-task-list`.
    hideRibbon: false,
    hideStatusBar: false,
    hideLeftSidebar: true,
    hideRightSidebar: true,
    vault: {
      files: [
        ...Object.entries(DEMO_SEEDS).map(([path, content]) => ({
          path,
          content,
        })),
        ...Object.entries(EMBED_SEEDS).map(([path, content]) => ({
          path,
          content,
        })),
      ],
    },
  },
  scenes: [
    {
      id: 'embedded',
      name: 'Embedded task list (reading mode)',
      actions: [
        waitForPlugin(),
        { type: 'open-file', name: 'Embedded Demo' },
        { type: 'wait-for', selector: '.cm-editor' },
        TOGGLE_VIEW_MODE,
        waitForReadingMode(),
        {
          type: 'wait-for',
          fn: `() => !!document.querySelector('.todoseq-embedded-task-list-container')`,
          timeout: 10000,
        },
        { type: 'wait', ms: 800 },
        {
          type: 'screenshot',
          name: 'embedded tasklist full',
          id: 'todoseq-editor-embedded-tasklist',
        },
        {
          type: 'screenshot',
          name: 'embedded example crop',
          id: 'todoseq-embedded-list-example',
          selector:
            '.markdown-preview-view .todoseq-embedded-task-list-container',
          padding: 8,
        },
        ...leaveReadingMode(),
      ],
    },
    {
      id: 'embedded-empty',
      name: 'Embedded empty state',
      actions: [
        { type: 'open-file', name: 'Empty Demo' },
        { type: 'wait-for', selector: '.cm-editor' },
        TOGGLE_VIEW_MODE,
        waitForReadingMode(),
        {
          type: 'wait-for',
          fn: `() => !!document.querySelector('.todoseq-embedded-task-list-empty')`,
          timeout: 10000,
        },
        { type: 'wait', ms: 500 },
        {
          type: 'screenshot',
          name: 'embedded empty',
          id: 'todoseq-embedded-list-empty',
          selector:
            '.markdown-preview-view .todoseq-embedded-task-list-container',
          padding: 8,
        },
        ...leaveReadingMode(),
      ],
    },
    {
      id: 'embedded-error',
      name: 'Embedded error state',
      actions: [
        { type: 'open-file', name: 'Error Demo' },
        { type: 'wait-for', selector: '.cm-editor' },
        TOGGLE_VIEW_MODE,
        waitForReadingMode(),
        {
          type: 'wait-for',
          fn: `() => !!document.querySelector('.todoseq-embedded-task-list-error')`,
          timeout: 10000,
        },
        { type: 'wait', ms: 500 },
        {
          type: 'screenshot',
          name: 'embedded error',
          id: 'todoseq-embedded-list-error',
          selector: '.markdown-preview-view .todoseq-embedded-task-list-error',
          padding: 8,
        },
        ...leaveReadingMode(),
      ],
    },
    {
      id: 'reader-view',
      name: 'Reader view styling',
      actions: [
        { type: 'open-file', name: 'Project Phoenix' },
        { type: 'wait-for', selector: '.cm-editor' },
        TOGGLE_VIEW_MODE,
        waitForReadingMode(),
        { type: 'wait', ms: 800 },
        { type: 'screenshot', name: 'reader view', id: 'todoseq-reader-view' },
        ...leaveReadingMode(),
      ],
    },
    {
      id: 'intro-dark',
      name: 'Introduction hero (dark)',
      actions: [
        { type: 'command', id: 'todoseq:show-task-list' },
        { type: 'wait', ms: 800 },
        { type: 'open-file', name: 'Project Phoenix' },
        { type: 'wait-for', selector: '.cm-editor' },
        { type: 'wait', ms: 800 },
        {
          type: 'screenshot',
          name: 'screenshot dark',
          id: 'todoseq-screenshot-dark',
        },
      ],
    },
  ],
});
