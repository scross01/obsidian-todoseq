import { defineScript } from 'obsidian-demo-recorder';
import { DEMO_SEEDS, waitForPlugin, waitForTaskListView } from './helpers';

/**
 * Docs scenarios for the Task List page (docs/task-list.md).
 *
 * Captures:
 * - todoseq-editor-sidepanel-with-context-menu — editor + task list + row context menu (full)
 * - todoseq-task-context-menu                  — the row context menu on its own (detail crop)
 * - todoseq-command-palette                    — command palette, "Show task list" highlighted (full)
 * - todoseq-search-and-settings-toolbar        — toolbar close crop (wide)
 * - todoseq-task-list-example                  — task list rows (wide)
 * - todoseq-context-menu                       — state keyword menu (detail crop)
 * - todoseq-date-picker                        — date picker popup (detail crop)
 */
export default defineScript({
  id: 'docs-task-list',
  title: 'docs task list scenarios',
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
      files: Object.entries(DEMO_SEEDS).map(([path, content]) => ({
        path,
        content,
      })),
    },
  },
  scenes: [
    {
      id: 'sidepanel-context-menu',
      name: 'Sidepanel with context menu',
      actions: [
        waitForPlugin(),
        { type: 'command', id: 'todoseq:show-task-list' },
        waitForTaskListView(),
        { type: 'open-file', name: 'Project Phoenix' },
        { type: 'wait-for', selector: '.cm-editor' },
        // Right-click a task row in the task list to open the row context menu.
        { type: 'right-click', selector: '.todoseq-task-item' },
        { type: 'wait', ms: 600 },
        {
          type: 'screenshot',
          name: 'sidepanel with context menu',
          id: 'todoseq-editor-sidepanel-with-context-menu',
        },
        // The same menu again, cropped to itself. The full-window shot above
        // shows the menu in context but too small to read its sections, and
        // the "Task Context Menu" section walks through them one by one — so
        // it needs a shot the reader can actually resolve.
        //
        // Distinct from `todoseq-context-menu` below, which is the *state*
        // menu opened from the keyword. The two are easy to confuse and the
        // docs treat them as separate sections.
        {
          type: 'screenshot',
          name: 'task context menu',
          id: 'todoseq-task-context-menu',
          selector: '.todoseq-task-context-menu',
          padding: 4,
        },
      ],
    },
    {
      id: 'command-palette',
      name: 'Command palette',
      actions: [
        // Obsidian's command palette: open, type filter, shoot full window.
        //
        // The query is the command's own name, which is what the docs tell
        // readers to type. Filtering on the bare plugin name instead ranked
        // "Rescan vault" first, so the image highlighted a command the
        // section is not about.
        { type: 'command', id: 'command-palette:open' },
        { type: 'wait-for', selector: '.prompt' },
        { type: 'type', selector: '.prompt-input', text: 'show task list' },
        { type: 'wait', ms: 600 },
        // Hover the suggestion rather than trusting the default highlight, so
        // the shot shows the pointer on the command the prose names. The
        // three TODOseq palette commands are "Show task list", "Open task
        // list in new tab" and "Rescan vault", so this text is unambiguous.
        { type: 'hover', text: 'Show task list', scope: '.prompt' },
        { type: 'wait', ms: 500 },
        {
          type: 'screenshot',
          name: 'command palette',
          id: 'todoseq-command-palette',
        },
        { type: 'press', key: 'Escape' },
      ],
    },
    {
      id: 'toolbar-and-list',
      name: 'Toolbar and task list',
      actions: [
        { type: 'wait-for', selector: '.todoseq-toolbar' },
        { type: 'wait', ms: 600 },
        {
          type: 'screenshot',
          name: 'search and settings toolbar',
          id: 'todoseq-search-and-settings-toolbar',
          selector: '.todoseq-toolbar',
          padding: 6,
        },
        {
          type: 'screenshot',
          name: 'task list example',
          id: 'todoseq-task-list-example',
          selector: '.todoseq-task-list-container',
          padding: 6,
        },
      ],
    },
    {
      id: 'keyword-context-menu',
      name: 'State keyword context menu',
      actions: [
        // Right-click the state keyword badge on a task item.
        {
          type: 'right-click',
          selector: '.todoseq-task-item .todo-task-keyword',
        },
        { type: 'wait', ms: 600 },
        {
          type: 'screenshot',
          name: 'context menu',
          id: 'todoseq-context-menu',
          selector: '.menu',
          padding: 4,
        },
        { type: 'press', key: 'Escape' },
      ],
    },
    {
      id: 'date-picker',
      name: 'Date picker',
      actions: [
        // Reopen row context menu and choose "Pick date..." (ASCII dots).
        { type: 'right-click', selector: '.todoseq-task-item' },
        { type: 'wait', ms: 500 },
        {
          type: 'click',
          selector: '.todoseq-context-menu-icon-btn[aria-label="Pick date..."]',
        },
        { type: 'wait', ms: 800 },
        {
          type: 'screenshot',
          name: 'date picker',
          id: 'todoseq-date-picker',
          selector: '.todoseq-date-picker',
          padding: 4,
        },
      ],
    },
  ],
});
