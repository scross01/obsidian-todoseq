import { defineScript } from 'obsidian-demo-recorder';
import {
  DEMO_SEEDS,
  EDITOR_SEEDS,
  waitForPlugin,
  waitForTaskListView,
} from './helpers';

/**
 * Docs scenarios for the Editor Integration page (docs/editor.md).
 *
 * Captures:
 * - todoseq-editor-view                 — editor + task list sidebar (full)
 * - todoseq-editor-task-styling         — styled keywords close-up (.cm-editor clip)
 * - todoseq-editor-checkbox-interaction — checkbox tasks in live preview
 * - todoseq-editor-date-autocomplete    — SCHEDULED: autocomplete popup
 */
export default defineScript({
  id: 'docs-editor',
  title: 'docs editor scenarios',
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
        ...Object.entries(EDITOR_SEEDS).map(([path, content]) => ({
          path,
          content,
        })),
      ],
    },
  },
  scenes: [
    {
      id: 'editor-view',
      name: 'Editor with task list',
      actions: [
        waitForPlugin(),
        { type: 'command', id: 'todoseq:show-task-list' },
        waitForTaskListView(),
        { type: 'open-file', name: 'Project Phoenix' },
        { type: 'wait-for', selector: '.cm-editor' },
        { type: 'wait', ms: 800 },
        { type: 'screenshot', name: 'editor view', id: 'todoseq-editor-view' },
        {
          type: 'screenshot',
          name: 'task styling',
          id: 'todoseq-editor-task-styling',
          selector: '.cm-editor',
          padding: 8,
        },
      ],
    },
    {
      id: 'checkbox',
      name: 'Checkbox interaction',
      actions: [
        { type: 'open-file', name: 'Checkbox Demo' },
        { type: 'wait-for', selector: '.cm-editor' },
        { type: 'wait', ms: 800 },
        {
          type: 'screenshot',
          name: 'checkbox interaction',
          id: 'todoseq-editor-checkbox-interaction',
          selector: '.cm-editor',
          padding: 8,
        },
      ],
    },
    {
      id: 'date-autocomplete',
      name: 'Date autocomplete',
      actions: [
        { type: 'open-file', name: 'Date Demo' },
        { type: 'wait-for', selector: '.cm-editor' },
        // Click to the end of the task line, then type the date keyword to
        // trigger the SCHEDULED: autocomplete.
        { type: 'click', selector: '.cm-line' },
        { type: 'press', key: 'End' },
        { type: 'type', selector: '.cm-content', text: ' SCHEDULED:' },
        { type: 'wait', ms: 600 },
        {
          type: 'screenshot',
          name: 'date autocomplete',
          id: 'todoseq-editor-date-autocomplete',
          selector: '.cm-editor',
          padding: 8,
        },
      ],
    },
  ],
});
