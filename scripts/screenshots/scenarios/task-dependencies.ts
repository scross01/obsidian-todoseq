import { defineScript } from 'obsidian-demo-recorder';
import { waitForPlugin, waitForTaskListView } from './helpers';
import { DEPENDENCY_SEEDS } from './seeds/dependencies.ts';

/**
 * Docs scenarios for blocked tasks and dependency diagnostics
 * (docs/task-dependencies.md, Completion enforcement and task actions).
 *
 * Captures:
 * - todoseq-task-dependency-blocked — a task waiting on an incomplete
 *   prerequisite: the row keeps its text colour and carries the lock
 * - todoseq-task-dependency-issues  — a task whose reference resolves to
 *   nothing: the warning triangle plus the Issues panel open
 *
 * Both crops are scoped with a `file:` search so the two fixtures never share a
 * frame. The waiting crop deliberately excludes the toolbar: the Issues
 * indicator counts the whole vault, and the resolved fixture must contribute
 * none.
 */
export default defineScript({
  id: 'docs-task-dependencies',
  title: 'docs task dependency scenarios',
  format: 'mp4',
  width: 1024,
  // Shorter than the other dock captures: the Issues panel and its row sit at
  // the top of a filtered list, so a full-height window only pads the crop
  // with rows the query excluded.
  height: 460,
  stills: { mode: 'only', scale: 1 },
  setup: {
    // Clipped shots of the right dock. The dock is the whole frame, so the
    // ribbon/status bar are left visible to keep the panel chrome natural.
    hideRibbon: false,
    hideStatusBar: true,
    hideLeftSidebar: true,
    hideRightSidebar: true,
    vault: {
      files: Object.entries(DEPENDENCY_SEEDS).map(([path, content]) => ({
        path,
        content,
      })),
    },
  },
  scenes: [
    {
      id: 'dependency-blocked',
      name: 'Dependency waiting on an incomplete task',
      actions: [
        waitForPlugin(),
        { type: 'command', id: 'todoseq:show-task-list' },
        waitForTaskListView(),
        { type: 'open-file', name: 'Dependency waiting' },
        { type: 'wait-for', selector: '.cm-editor' },
        // Scope through the view's stored query rather than typing into the
        // search box: an `input` event opens the suggestion dropdown, which
        // overlaps both the rows and the Issues control.
        {
          type: 'evaluate',
          fn: `async () => {
            const view = window.app.workspace.getLeavesOfType('todoseq-view')[0]?.view;
            if (!view?.refreshVisibleList) throw new Error('task list view not ready');
            view.contentEl.setAttr('data-search', 'file:waiting');
            if (view.searchInputEl) view.searchInputEl.value = 'file:waiting';
            await view.refreshVisibleList();
            return true;
          }`,
        },
        // A lock alone is not enough: pending validation also renders blocked
        // state, so wait for the ready snapshot and the resolved reason text.
        {
          type: 'wait-for',
          fn: `() => {
            const plugin = window.app?.plugins?.plugins?.todoseq;
            if (!plugin?.taskDependencyManager?.isValidationReady()) return false;
            const rows = [...document.querySelectorAll('.todoseq-task-item')];
            if (rows.length !== 2) return false;
            const dependent = rows.find((row) =>
              row.textContent.includes('Draft the report'),
            );
            const prerequisite = rows.find((row) =>
              row.textContent.includes('Collect source data'),
            );
            if (!dependent || !prerequisite) return false;
            const lock = dependent.querySelector('.todoseq-task-blocked-icon');
            if (!lock) return false;
            if (dependent.querySelector('.todoseq-dependency-issue-icon'))
              return false;
            if (
              prerequisite.querySelector(
                '.todoseq-task-blocked-icon, .todoseq-dependency-issue-icon',
              )
            )
              return false;
            return (lock.getAttribute('aria-label') ?? '').includes(
              'Collect source data',
            );
          }`,
          timeout: 20000,
        },
        { type: 'wait', ms: 400 },
        {
          type: 'screenshot',
          name: 'dependency waiting rows',
          id: 'todoseq-task-dependency-blocked',
          selector: 'ul.todoseq-task-list',
          padding: 6,
        },
      ],
    },
    {
      id: 'dependency-issues',
      name: 'Dependency issue and Issues panel',
      actions: [
        { type: 'open-file', name: 'Dependency issue' },
        { type: 'wait-for', selector: '.cm-editor' },
        {
          type: 'evaluate',
          fn: `async () => {
            const view = window.app.workspace.getLeavesOfType('todoseq-view')[0]?.view;
            if (!view?.refreshVisibleList) throw new Error('task list view not ready');
            view.contentEl.setAttr('data-search', 'file:issue');
            if (view.searchInputEl) view.searchInputEl.value = 'file:issue';
            await view.refreshVisibleList();
            return true;
          }`,
        },
        {
          type: 'wait-for',
          fn: `() => {
            const plugin = window.app?.plugins?.plugins?.todoseq;
            if (!plugin?.taskDependencyManager?.isValidationReady()) return false;
            const rows = [...document.querySelectorAll('.todoseq-task-item')];
            if (rows.length !== 1) return false;
            if (!rows[0].querySelector('.todoseq-dependency-issue-icon'))
              return false;
            const indicator = document.querySelector('.todoseq-issues-indicator');
            return !!indicator && !indicator.classList.contains('todoseq-hidden');
          }`,
          timeout: 20000,
        },
        { type: 'click', selector: '.todoseq-issues-indicator' },
        {
          type: 'wait-for',
          fn: `() => {
            const panel = document.querySelector('.todoseq-issues-panel');
            if (!panel || panel.classList.contains('todoseq-hidden')) return false;
            return panel.querySelectorAll('.todoseq-issue-row').length === 1;
          }`,
          timeout: 10000,
        },
        { type: 'wait', ms: 400 },
        {
          type: 'screenshot',
          name: 'dependency issue and panel',
          id: 'todoseq-task-dependency-issues',
          // The panel lives in the toolbar above the rows, so the whole panel
          // is the smallest crop that holds the row, its triangle and the
          // diagnostic list in one frame.
          selector: '.todoseq-panel',
          padding: 6,
        },
      ],
    },
  ],
});
