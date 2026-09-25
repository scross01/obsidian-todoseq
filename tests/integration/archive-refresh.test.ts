import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import { openTodoseqPanel, waitForTaskListVisible } from './helpers/assertions';
import { Page } from 'playwright';

let page: Page;

const FILE = 'archive-refresh.md';
const OLD_CLOSED = '2026-01-01'; // far past any plausible test-run date
const DAYS_THRESHOLD = 30;

interface TestTask {
  path: string;
  line: number;
  state: string;
  rawText: string;
  closedDate: string | null;
  isTableTask: boolean;
  cellIndex: number | null;
}

async function seedArchiveFile(page: Page, withTable: boolean): Promise<void> {
  await page.evaluate(
    ({ file, oldClosed, withTable }) => {
      const app = (window as any).app;
      const lines: string[] = [
        '# Archive Refresh Test',
        '',
        `- [x] DONE Old task one`,
        `  CLOSED: [${oldClosed}]`,
        '',
        `- [x] DONE Old task two`,
        `  CLOSED: [${oldClosed}]`,
      ];
      if (withTable) {
        lines.push(
          '',
          '| Task | Status |',
          '|------|--------|',
          `| DONE Table task<br>CLOSED: [${oldClosed}] | |`,
          '| TODO Active cell | |',
        );
      }
      app.vault.create(file, lines.join('\n'));
    },
    { file: FILE, oldClosed: OLD_CLOSED, withTable },
  );
  // Wait for Obsidian to index the new file, then rescan.
  await page.waitForTimeout(300);
  await rescan(page);
  await page.waitForTimeout(300);
}

async function rescan(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    const plugin = app?.plugins?.plugins?.todoseq;
    await plugin?.vaultScanner?.scanVault();
  });
}

/** Enable DONE→ARCHIVED mapping and set days criterion. */
async function enableMapping(page: Page): Promise<void> {
  await page.evaluate(
    ({ days }) => {
      const app = (window as any).app;
      const plugin = app.plugins.plugins.todoseq;
      plugin.settings.taskArchive.stateMappings = [
        { source: 'DONE', enabled: true, target: 'ARCHIVED' },
      ];
      plugin.settings.taskArchive.criterionMode = 'days';
      plugin.settings.taskArchive.criterionDays = days;
      void plugin.saveSettings();
    },
    { days: DAYS_THRESHOLD },
  );
}

async function listTaskStates(page: Page): Promise<string[]> {
  return page.evaluate((file) => {
    const app = (window as any).app;
    const tasks = app.plugins.plugins.todoseq.taskStateManager.getTasks();
    return tasks
      .filter((t: TestTask) => t.path === file)
      .map((t: TestTask) => t.state);
  }, FILE);
}

async function runArchiveViaDialog(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.commands.executeCommandById('todoseq:archive-completed-tasks');
  });
  await page.waitForSelector('.todoseq-archive-modal', { timeout: 5000 });
  await page.waitForTimeout(200);
  // All preview rows default to included — click Apply.
  await page.click('.todoseq-archive-modal .mod-cta');
  await page.waitForSelector('.todoseq-archive-modal', {
    state: 'detached',
    timeout: 10000,
  });
  await page.waitForTimeout(400);
}

async function runUndo(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.commands.executeCommandById('todoseq:archive-undo-last-run');
  });
  await page.waitForTimeout(600);
}

async function reopenDialogAndCountMatches(page: Page): Promise<number> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.commands.executeCommandById('todoseq:archive-completed-tasks');
  });
  await page.waitForSelector('.todoseq-archive-modal', { timeout: 5000 });
  await page.waitForTimeout(300);
  const countText = await page.textContent('.todoseq-archive-preview-count');
  await page.click('.todoseq-archive-modal .todoseq-archive-close');
  await page.waitForTimeout(200);
  const match = countText?.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : -1;
}

test.describe('Archive state refresh (regression)', () => {
  test.beforeAll(async () => {
    page = await getPage();
  });

  test.beforeEach(async () => {
    await resetVaultState(page);
    // Remove any leftover file from a previous test run.
    await page.evaluate((file) => {
      const app = (window as any).app;
      const existing = app.vault.getAbstractFileByPath(file);
      if (existing) void app.vault.delete(existing, true);
    }, FILE);
    await enableMapping(page);
  });

  test.afterEach(async () => {
    await page.evaluate((file) => {
      const app = (window as any).app;
      const existing = app.vault.getAbstractFileByPath(file);
      if (existing) void app.vault.delete(existing, true);
    }, FILE);
  });

  test('archiving with the file open in an editor removes DONE from the task list (no stale resurrect)', async () => {
    await seedArchiveFile(page, false);
    // Open the file in source mode — the editor-path write must stay visible.
    await page.evaluate(async (file) => {
      const app = (window as any).app;
      const f = app.vault.getAbstractFileByPath(file);
      await app.workspace.getLeaf('tab').openFile(f, {
        state: { mode: 'source', source: true },
      });
    }, FILE);
    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);
    await page.waitForTimeout(400);

    // Sanity: tasks are visible as DONE before the run.
    const before = await listTaskStates(page);
    expect(before.filter((s) => s === 'DONE')).toHaveLength(2);

    await runArchiveViaDialog(page);

    // The archived tasks must NOT reappear as DONE in the manager (bug 1:
    // stale cachedRead rescan resurrected them before the fix).
    const after = await listTaskStates(page);
    expect(after.filter((s) => s === 'DONE')).toHaveLength(0);
    expect(after.filter((s) => s === 'ARCHIVED')).toHaveLength(0); // not collected
  });

  test('undo re-adds the restored task so it reappears as a dialog candidate', async () => {
    await seedArchiveFile(page, false);
    await runArchiveViaDialog(page);
    await runUndo(page);
    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);

    // Bug 2: the undo'd task never returned to the manager, so the dialog
    // listed 0 candidates. It must be a candidate again.
    const states = await listTaskStates(page);
    expect(states.filter((s) => s === 'DONE')).toHaveLength(2);

    const matches = await reopenDialogAndCountMatches(page);
    expect(matches).toBe(2);
  });

  test('table-cell task: archive then undo restores the cell and re-offers the candidate', async () => {
    await seedArchiveFile(page, true);
    await runArchiveViaDialog(page);
    await runUndo(page);

    // Cell task must be back in the manager with DONE + cell identity.
    const cellTasks = await page.evaluate((file): TestTask[] => {
      const app = (window as any).app;
      const tasks = app.plugins.plugins.todoseq.taskStateManager.getTasks();
      return tasks.filter(
        (t: TestTask) =>
          t.path === file &&
          t.isTableTask === true &&
          t.rawText.includes('Table task'),
      );
    }, FILE);
    expect(cellTasks).toHaveLength(1);
    expect(cellTasks[0].state).toBe('DONE');
    expect(cellTasks[0].tableCell?.cellIndex).toBe(0);
    expect(cellTasks[0].closedDate).not.toBeNull();

    const matches = await reopenDialogAndCountMatches(page);
    expect(matches).toBe(3); // two list tasks + one table task
  });
});
