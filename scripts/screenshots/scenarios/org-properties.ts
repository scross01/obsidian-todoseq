import { defineScript } from 'obsidian-demo-recorder';
import { waitForPlugin, waitForTaskListView } from './helpers';
import { ORG_PROPERTIES_SEEDS } from './seeds/org-properties.ts';

/**
 * Docs scenarios for the generated-properties workflow
 * (docs/task-dependencies.md, Copying identities).
 *
 * Captures:
 * - todoseq-org-properties-generated  — the editor after the workflow, with
 *   the generated `:ID:` and the matching `:BLOCKER:`
 *
 * This is one real workflow, not a staged state: the first scene activates
 * **Copy ID** through the menu, and the second activates **Add copied link as
 * blocker** with that ID on the clipboard. The menu itself is not captured
 * here; `docs/task-list.md` already shows the row menu. The assertion points are the
 * rendered editor and the parsed task state, so a menu that silently failed
 * cannot produce a plausible-looking drawer.
 *
 * Every gate here is synchronous on purpose: the recorder treats a wait
 * predicate that returns a Promise as satisfied, so an `async` predicate
 * passes immediately and the scene captures before the write lands.
 *
 * The ID is a UUID generated at capture time, so it differs between runs and
 * between the light and dark themes; the relation between the two drawers is
 * what the image documents.
 */

/** Task rows currently rendered in the Task List. */
const TASK_ROWS = `[...document.querySelectorAll('.todoseq-task-item')]`;

/** The TODOseq plugin instance. */
const PLUGIN = `window.app.plugins.plugins.todoseq`;

/** Parsed tasks, keyed by the text they contain. */
const findTask = (text: string) =>
  `${PLUGIN}.getTasks().find((task) => task.rawText.includes('${text}'))`;

export default defineScript({
  id: 'docs-org-properties',
  title: 'docs generated org property scenarios',
  format: 'mp4',
  width: 1024,
  height: 640,
  stills: { mode: 'only', scale: 1 },
  setup: {
    hideRibbon: false,
    hideStatusBar: false,
    hideLeftSidebar: true,
    hideRightSidebar: true,
    vault: {
      files: Object.entries(ORG_PROPERTIES_SEEDS).map(([path, content]) => ({
        path,
        content,
      })),
    },
  },
  scenes: [
    {
      id: 'copy-id',
      name: 'Copy ID from the task context menu',
      actions: [
        waitForPlugin(),
        { type: 'command', id: 'todoseq:show-task-list' },
        waitForTaskListView(),
        { type: 'open-file', name: 'Release Plan' },
        { type: 'wait-for', selector: '.cm-editor' },
        {
          type: 'wait-for',
          fn: `() => {
            const rows = ${TASK_ROWS};
            if (rows.length !== 2) return false;
            return !rows.some(
              (row) =>
                row.querySelector(
                  '.todoseq-task-blocked-icon, .todoseq-dependency-issue-icon',
                ) !== null,
            );
          }`,
          timeout: 15000,
        },
        // The menu is opened on the row itself: the plugin binds `contextmenu`
        // to the task list item, so a real event on that element is what a
        // user's right-click produces.
        {
          type: 'evaluate',
          fn: `() => {
            const row = ${TASK_ROWS}.find((item) =>
              item.textContent.includes('Collect source data'),
            );
            if (!row) throw new Error('source row not found');
            const rect = row.getBoundingClientRect();
            row.dispatchEvent(
              new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: Math.round(rect.left + 40),
                clientY: Math.round(rect.top + 12),
              }),
            );
            return true;
          }`,
        },
        { type: 'wait-for', selector: '.todoseq-task-context-menu' },
        {
          type: 'evaluate',
          fn: `async () => {
            try {
              await navigator.clipboard.readText();
            } catch (error) {
              throw new Error('clipboard preflight failed: ' + error);
            }
            const menu = document.querySelector('.todoseq-task-context-menu');
            const row = [...(menu?.querySelectorAll('.todoseq-context-menu-row') ?? [])]
              .find((item) => item.textContent.trim() === 'Copy ID');
            if (!row) throw new Error('Copy ID menu row not found');
            row.click();
            return true;
          }`,
        },
        // The ID must exist in the note, in the rendered drawer and in the
        // parsed task before the next scene can resolve it as a blocker.
        {
          type: 'wait-for',
          fn: `() => {
            const source = ${findTask('Collect source data')};
            if (!source?.id) return false;
            const content = document.querySelector(
              '.workspace-leaf.mod-active .cm-content',
            );
            return (content?.textContent ?? '').includes(':ID: ' + source.id);
          }`,
          timeout: 15000,
        },
      ],
    },
    {
      id: 'generated',
      name: 'Generated ID and blocker in the editor',
      actions: [
        { type: 'open-file', name: 'Release Plan' },
        { type: 'wait-for', selector: '.workspace-leaf.mod-active .cm-editor' },
        {
          type: 'evaluate',
          fn: `() => {
            document.querySelector('.workspace-leaf.mod-active .cm-scroller')
              ?.scrollTo(0, 0);
            return true;
          }`,
        },
        // Copy ID inserted a drawer above the dependent, so its row must carry
        // the post-insertion line before the menu targets it.
        {
          type: 'wait-for',
          fn: `() => {
            const dependent = ${findTask('Draft the report')};
            if (!dependent) return false;
            const row = ${TASK_ROWS}.find((item) =>
              item.textContent.includes('Draft the report'),
            );
            return !!row && row.getAttribute('data-line') === String(dependent.line);
          }`,
          timeout: 15000,
        },
        {
          type: 'evaluate',
          fn: `() => {
            const row = ${TASK_ROWS}.find((item) =>
              item.textContent.includes('Draft the report'),
            );
            if (!row) throw new Error('dependent row not found');
            const rect = row.getBoundingClientRect();
            row.dispatchEvent(
              new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: Math.round(rect.left + 40),
                clientY: Math.round(rect.top + 12),
              }),
            );
            return true;
          }`,
        },
        { type: 'wait-for', selector: '.todoseq-task-context-menu' },
        {
          type: 'evaluate',
          fn: `() => {
            const menu = document.querySelector('.todoseq-task-context-menu');
            const row = [...(menu?.querySelectorAll('.todoseq-context-menu-row') ?? [])]
              .find((item) =>
                item.textContent.includes('Add copied link as blocker'),
              );
            if (!row) throw new Error('Add copied link as blocker row not found');
            row.click();
            return true;
          }`,
        },
        // The write has landed only when the dependent parses the blocker,
        // the row shows the resolved lock, and the editor renders the drawer.
        // If the clipboard held anything else, the menu refuses and this gate
        // times out instead of capturing a note with no dependency.
        {
          type: 'wait-for',
          fn: `() => {
            const source = ${findTask('Collect source data')};
            const dependent = ${findTask('Draft the report')};
            if (!source?.id || !dependent) return false;
            if (!(dependent.blockedBy ?? []).includes(source.id)) return false;
            const row = ${TASK_ROWS}.find((item) =>
              item.textContent.includes('Draft the report'),
            );
            if (!row?.querySelector('.todoseq-task-blocked-icon')) return false;
            const content = document.querySelector(
              '.workspace-leaf.mod-active .cm-content',
            );
            if (!(content?.textContent ?? '').includes(':BLOCKER: ' + source.id))
              return false;
            return !document.querySelector('.notice');
          }`,
          timeout: 20000,
        },
        { type: 'wait', ms: 500 },
        {
          type: 'screenshot',
          name: 'generated properties in the editor',
          id: 'todoseq-org-properties-generated',
          selector: '.workspace-leaf.mod-active .cm-editor',
          padding: 8,
        },
      ],
    },
  ],
});
