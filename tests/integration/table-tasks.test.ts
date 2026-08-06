import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import {
  openTodoseqPanel,
  getTaskCount,
  waitForTaskListVisible,
} from './helpers/assertions';
import { Page } from 'playwright';
import { readEditorContent } from './helpers/editor-utils';

let page: Page;

/** Close any editor leaves showing table-tasks.md so the next open reads
 *  the baseline content reset by resetVaultState (stale editor buffers
 *  otherwise leak modifications between tests). */
async function closeTableTasksLeaves(): Promise<void> {
  await page.evaluate(() => {
    const app = (window as any).app;
    app.workspace
      .getLeavesOfType('markdown')
      .filter((l) => l.view?.file?.path === 'table-tasks.md')
      .forEach((l) => l.detach());
  });
}

test.beforeAll(async () => {
  page = await getPage();
});

test.describe('Table cell tasks (experimental)', () => {
  test.beforeEach(async () => {
    await closeTableTasksLeaves();
    await resetVaultState(page);
    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);
  });

  // Close table-tasks.md leaves so the shared instance is not left with a
  // source-mode active leaf — that slows/focus-shifts later tests (e.g. the
  // task-list-view "task click navigates" test that asserts on the active leaf).
  test.afterEach(async () => {
    await closeTableTasksLeaves();
  });

  test('shows table cell tasks with descriptions in the task list', async () => {
    const bodyText = await page.locator('.todoseq-task-list').textContent();
    expect(bodyText).toContain('Table task one');
    expect(bodyText).toContain('Table task two with description');
    expect(bodyText).toContain('Table task three');
    expect(bodyText).toContain('Table task four');
  });

  test('displays description icon for table cell tasks with descriptions', async () => {
    const descIcons = page.locator('.todoseq-task-description-icon');
    const count = await descIcons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('command palette cycle changes state for table cell task in editor', async () => {
    // Open in TRUE source mode so the cursor stays in the row: Live Preview
    // re-aligns the table on cursor placement and moves the cursor to the
    // header row, so the cycle command operates on the wrong line there.
    await page.evaluate(async () => {
      const app = (window as any).app;
      const file = app.vault.getAbstractFileByPath('table-tasks.md');
      const leaf = app.workspace.getLeaf('tab');
      await leaf.openFile(file, { state: { mode: 'source', source: true } });
    });

    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const app = (window as any).app;
      const leaf = app.workspace.getMostRecentLeaf();
      const editor = leaf.view.editor;
      let line = -1;
      for (let i = 0; i < editor.lineCount(); i++) {
        if (editor.getLine(i).includes('Table task one')) {
          line = i;
          break;
        }
      }
      if (line === -1) throw new Error('table task line not found');
      // Cursor at end of the row: the cycle handler falls back to the first
      // task cell on the line.
      editor.setCursor({ line, ch: editor.getLine(line).length });
    });

    await page.evaluate(() => {
      const app = (window as any).app;
      const cmd = app.commands.executeCommandById.bind(app.commands);
      cmd('todoseq:cycle-task-state');
    });

    await page.waitForTimeout(500);

    // Read the live editor buffer — app.vault.read can return pre-edit content
    // until Obsidian's autosave flushes source-mode writes to disk.
    const content = await readEditorContent(page);
    expect(content).toContain('DOING Table task one');
  });

  test('keyword menu changes table cell task state in Live Preview', async () => {
    // Open in default Live Preview mode (not true source mode). Table keywords
    // render as styled spans inside Obsidian's .table-cell-wrapper tree.
    await page.evaluate(async () => {
      const app = (window as any).app;
      const file = app.vault.getAbstractFileByPath('table-tasks.md');
      if (!file) throw new Error('table-tasks.md not found');
      const leaf = app.workspace.getLeaf('tab');
      await leaf.openFile(file);
    });

    // Confirm we are really in Live Preview (getMode() === 'source' is true in
    // both Live Preview and true source mode).
    const isLivePreview = await page.evaluate(() => {
      const app = (window as any).app;
      const view = app.workspace.getMostRecentLeaf()?.view;
      const sourceView = view?.containerEl?.querySelector(
        '.markdown-source-view',
      );
      return sourceView?.classList.contains('is-live-preview') ?? false;
    });
    expect(isLivePreview).toBe(true);

    const keyword = page
      .locator(
        '.workspace-leaf.mod-active .table-cell-wrapper .todoseq-keyword-formatted[data-task-keyword="TODO"]',
      )
      .first();
    await keyword.waitFor({ state: 'visible', timeout: 10_000 });

    // Allow the plugin's file-open contextmenu handler to attach (100ms delay).
    await page.waitForTimeout(300);

    await keyword.click({ button: 'right' });

    const doingItem = page
      .locator('.menu .menu-item-title', { hasText: 'DOING' })
      .first();
    await doingItem.waitFor({ state: 'visible', timeout: 5_000 });
    await doingItem.click();

    await page.waitForTimeout(300);
    const content = await readEditorContent(page);
    expect(content).toContain('DOING Table task one');
    expect(content).not.toContain('TODO Table task one');
  });

  test('keyword menu changes table cell task state in Live Preview for cell with description', async () => {
    await page.evaluate(async () => {
      const app = (window as any).app;
      const file = app.vault.getAbstractFileByPath('table-tasks.md');
      if (!file) throw new Error('table-tasks.md not found');
      const leaf = app.workspace.getLeaf('tab');
      await leaf.openFile(file);
    });

    // Scope to the row containing the description so the DOING keyword there
    // is not confused with other DOING cells.
    const descRow = page
      .locator('.workspace-leaf.mod-active tr')
      .filter({ hasText: 'DESCRIPTION:' });
    const keyword = descRow.locator(
      '.todoseq-keyword-formatted[data-task-keyword="DOING"]',
    );
    await keyword.waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForTimeout(300);

    await keyword.click({ button: 'right' });

    const doneItem = page
      .locator('.menu .menu-item-title', { hasText: 'DONE' })
      .first();
    await doneItem.waitFor({ state: 'visible', timeout: 5_000 });
    await doneItem.click();

    await page.waitForTimeout(300);
    const content = await readEditorContent(page);
    expect(content).toContain('DONE Table task two with description');
    expect(content).not.toContain('DOING Table task two with description');
  });

  test('keyword menu state change in Live Preview removes CLOSED date when un-completing', async () => {
    await page.evaluate(async () => {
      const app = (window as any).app;
      const file = app.vault.getAbstractFileByPath('table-tasks.md');
      if (!file) throw new Error('table-tasks.md not found');
      const leaf = app.workspace.getLeaf('tab');
      await leaf.openFile(file);
    });

    // First complete the DOING task to add a CLOSED date
    await page.evaluate(() => {
      const app = (window as any).app;
      const cmd = app.commands.executeCommandById.bind(app.commands);
      app.plugins.plugins.todoseq.settings.trackClosedDate = true;
      const editor = app.workspace.activeLeaf?.view?.editor;
      for (let i = 0; i < editor.lineCount(); i++) {
        if (editor.getLine(i).includes('DOING Table task two with description')) {
          editor.setCursor({ line: i, ch: 5 });
          break;
        }
      }
      cmd('todoseq:cycle-task-state');
    });
    await page.waitForTimeout(600);
    let content = await readEditorContent(page);
    expect(content).toContain('DONE Table task two with description');
    expect(content).toContain('CLOSED:');

    // Now un-complete: DONE → TODO. Find the DONE keyword in the
    // description row (the row whose cell also contains DESCRIPTION:).
    const descRow = page
      .locator('.workspace-leaf.mod-active tr')
      .filter({ hasText: 'DESCRIPTION:' });
    // The description row's DONE keyword is inside a .table-cell-wrapper.
    // Use the wrapper to scope the search.
    const keyword = descRow
      .locator('.table-cell-wrapper')
      .first()
      .locator('.todoseq-keyword-formatted[data-task-keyword="DONE"]');
    await keyword.waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForTimeout(300);

    await keyword.click({ button: 'right' });
    await page
      .locator('.menu .menu-item-title', { hasText: 'TODO' })
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 });
    await page
      .locator('.menu .menu-item-title', { hasText: 'TODO' })
      .first()
      .click();

    await page.waitForTimeout(600);
    content = await readEditorContent(page);
    expect(content).toContain('TODO Table task two with description');
    expect(content).not.toContain('CLOSED:');
  });

  test('keyword menu changes state for multi-column table cells', async () => {
    await page.evaluate(async () => {
      const app = (window as any).app;
      const file = app.vault.getAbstractFileByPath('table-tasks.md');
      if (!file) throw new Error('table-tasks.md not found');
      const leaf = app.workspace.getLeaf('tab');
      await leaf.openFile(file);
    });

    // Find the NOW keyword directly (unique in the fixture).
    const keyword = page
      .locator('.workspace-leaf.mod-active .todoseq-keyword-formatted')
      .filter({ hasText: 'NOW' });
    await keyword.waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForTimeout(300);

    await keyword.click({ button: 'right' });
    await page
      .locator('.menu .menu-item-title', { hasText: 'DONE' })
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 });
    await page
      .locator('.menu .menu-item-title', { hasText: 'DONE' })
      .first()
      .click();

    await page.waitForTimeout(600);
    const content = await readEditorContent(page);
    expect(content).toContain('DONE [#B] five<br>DEADLINE:');
    expect(content).not.toContain('NOW [#B] five');
  });
});
