import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import { Page } from 'playwright';

let page: Page;

const FILE = 'auto-archive.md';
/** Far-past CLOSED date — always older than any days threshold used here. */
const OLD_CLOSED = '2026-01-01';

/** ISO YYYY-MM-DD for `days` days before today, computed at spec runtime. */
function isoDaysBefore(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function seedFile(page: Page): Promise<void> {
  const freshClosed = isoDaysBefore(1); // yesterday — never matches 90 days
  await page.evaluate(
    ({ file, oldClosed, freshClosed }) => {
      const app = (window as any).app;
      const existing = app.vault.getAbstractFileByPath(file);
      const content = [
        '# Auto Archive Test',
        '',
        '- [x] DONE Old task',
        `  CLOSED: [${oldClosed}]`,
        '',
        '- [x] DONE Fresh task',
        `  CLOSED: [${freshClosed}]`,
        '',
      ].join('\n');
      if (existing) {
        void app.vault.modify(existing, content);
      } else {
        void app.vault.create(file, content);
      }
    },
    { file: FILE, oldClosed: OLD_CLOSED, freshClosed },
  );
  await page.waitForTimeout(300);
}

async function setArchiveSettings(
  page: Page,
  settings: Record<string, unknown>,
): Promise<void> {
  await page.evaluate((patch) => {
    const app = (window as any).app;
    const plugin = app.plugins.plugins.todoseq;
    Object.assign(plugin.settings.taskArchive, patch);
    void plugin.saveSettings();
  }, settings);
}

async function rescan(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.commands.executeCommandById('todoseq:rescan-vault');
  });
  await page.waitForTimeout(600);
}

async function readStates(page: Page): Promise<Record<string, string>> {
  return page.evaluate((file) => {
    const app = (window as any).app;
    const tasks = app.plugins.plugins.todoseq.taskStateManager.getTasks();
    const states: Record<string, string> = {};
    for (const t of tasks) {
      if (t.path === file) states[t.text] = t.state;
    }
    return states;
  }, FILE);
}

async function readNoticeContainer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('.notice-container');
    return el ? (el.textContent ?? '') : '';
  });
}

async function runDialogApply(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    await app.commands.executeCommandById('todoseq:archive-completed-tasks');
  });
  await page.waitForSelector('.todoseq-archive-modal', { timeout: 5000 });
  await page.waitForTimeout(200);
  await page.click('.todoseq-archive-modal .mod-cta');
  await page.waitForSelector('.todoseq-archive-modal', {
    state: 'detached',
    timeout: 10000,
  });
  await page.waitForTimeout(400);
}

async function readEditorContent(page: Page): Promise<string> {
  return page.evaluate((file) => {
    const app = (window as any).app;
    const leaf = app.workspace
      .getLeavesOfType('markdown')
      .find((l: any) => l.view?.file?.path === file);
    const buffer = leaf?.view?.editor?.getValue?.();
    if (typeof buffer === 'string') return buffer;
    const f = app.vault.getAbstractFileByPath(file);
    return f ? app.vault.cachedRead(f) : '';
  }, FILE);
}

test.describe('Auto-archive on vault scan', () => {
  test.beforeAll(async () => {
    page = await getPage();
  });

  test.beforeEach(async () => {
    // Dismiss lingering notices from earlier tests (the auto-run notice is
    // 10s and would pollute the no-op-silence assertion otherwise).
    await page.evaluate(() => {
      document
        .querySelectorAll('.notice-container .notice')
        .forEach((n) => n.remove());
    });
    await resetVaultState(page);
    // Belt-and-braces: force the in-memory auto-archive gate off before
    // seeding, so no late auto-run from a previous test's settings can fire
    // during this test's setup rescan. The archive feature defaults to off.
    await setArchiveSettings(page, { autoArchiveEnabled: false });
    await seedFile(page);
    await rescan(page);
  });

  test.afterEach(async () => {
    await page.evaluate((file) => {
      const app = (window as any).app;
      const existing = app.vault.getAbstractFileByPath(file);
      if (existing) void app.vault.delete(existing, true);
    }, FILE);
  });

  test('manual dialog run archives only the old task', async () => {
    await setArchiveSettings(page, {
      stateMappings: [{ source: 'DONE', enabled: true, target: 'ARCHIVED' }],
      criterionMode: 'days',
      criterionDays: 90,
    });
    await rescan(page);

    const before = await readStates(page);
    expect(before['Old task']).toBe('DONE');
    expect(before['Fresh task']).toBe('DONE');

    await runDialogApply(page);

    const after = await readStates(page);
    expect(after['Old task']).toBeUndefined(); // archived → not collected
    expect(after['Fresh task']).toBe('DONE');

    const content = await readEditorContent(page);
    expect(content).toContain('- [x] ARCHIVED Old task');
    expect(content).toContain('- [x] DONE Fresh task');
    expect(content).toContain(`CLOSED: [${OLD_CLOSED}]`); // CLOSED preserved
  });

  test('undo command restores the archived task with its CLOSED line', async () => {
    await setArchiveSettings(page, {
      stateMappings: [{ source: 'DONE', enabled: true, target: 'ARCHIVED' }],
      criterionMode: 'days',
      criterionDays: 90,
    });
    await rescan(page);
    await runDialogApply(page);
    expect((await readStates(page))['Old task']).toBeUndefined();

    await page.evaluate(async () => {
      const app = (window as any).app;
      await app.commands.executeCommandById('todoseq:archive-undo-last-run');
    });
    await page.waitForTimeout(500);

    expect((await readStates(page))['Old task']).toBe('DONE');
    const content = await readEditorContent(page);
    expect(content).toContain('- [x] DONE Old task');
    expect(content).toContain(`CLOSED: [${OLD_CLOSED}]`);
  });

  test('auto-run archives the old task on rescan and shows an undo notice', async () => {
    await setArchiveSettings(page, {
      autoArchiveEnabled: true,
      stateMappings: [{ source: 'DONE', enabled: true, target: 'ARCHIVED' }],
      criterionMode: 'days',
      criterionDays: 90,
    });
    await rescan(page);

    const states = await readStates(page);
    expect(states['Old task']).toBeUndefined(); // auto-archived, no dialog
    expect(states['Fresh task']).toBe('DONE'); // untouched

    // Notices are transient — query immediately. The auto-run notice is
    // 10s; the rescan just completed so it must still be visible.
    const noticeText = await readNoticeContainer(page);
    expect(noticeText).toContain('Archived 1 task');

    // The Undo button reuses the shared undo flow.
    const undoBtn = await page.evaluate(() => {
      const btns = Array.from(
        document.querySelectorAll('.notice-container button'),
      );
      const undo = btns.find((b) => b.textContent?.trim() === 'Undo');
      if (!undo) return false;
      (undo as HTMLElement).click();
      return true;
    });
    expect(undoBtn).toBe(true);
    await page.waitForTimeout(500);

    expect((await readStates(page))['Old task']).toBe('DONE');
  });

  test('auto-run ignores date-mode criteria (days mode enforced)', async () => {
    // criterionDate far in the past WOULD match the old task in a manual run,
    // but auto-run must enforce days mode and therefore archive nothing
    // (criterionDays is not consulted in date mode; here we keep it high).
    await setArchiveSettings(page, {
      autoArchiveEnabled: true,
      stateMappings: [{ source: 'DONE', enabled: true, target: 'ARCHIVED' }],
      criterionMode: 'date',
      criterionDate: '2027-01-01',
      criterionDays: 3650,
    });
    await rescan(page);

    const states = await readStates(page);
    expect(states['Old task']).toBe('DONE');
    expect(states['Fresh task']).toBe('DONE');
  });

  test('no-op auto-run is silent (no notice) with nothing old enough', async () => {
    await setArchiveSettings(page, {
      autoArchiveEnabled: true,
      stateMappings: [{ source: 'DONE', enabled: true, target: 'ARCHIVED' }],
      criterionMode: 'days',
      criterionDays: 3650, // nothing is 10 years old
    });
    await rescan(page);

    const states = await readStates(page);
    expect(states['Old task']).toBe('DONE');
    expect(states['Fresh task']).toBe('DONE');

    const noticeText = await readNoticeContainer(page);
    expect(noticeText).not.toContain('Archived');
  });

  test('auto-run stays off by default (no writes without opt-in)', async () => {
    // Fresh baseline settings: autoArchiveEnabled is absent → off.
    await rescan(page);
    await rescan(page);

    const states = await readStates(page);
    expect(states['Old task']).toBe('DONE');
    expect(states['Fresh task']).toBe('DONE');
  });
});
