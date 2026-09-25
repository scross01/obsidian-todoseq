import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';

let page: import('playwright').Page;

const FILE = 'bulk-select-test.md';

test.describe('Archive dialog bulk select (plan 015)', () => {
  test.beforeAll(async () => {
    page = await getPage();
  });

  test.beforeEach(async () => {
    await resetVaultState(page);
    await page.evaluate(() => {
      const app = (window as any).app;
      const plugin = app.plugins.plugins.todoseq;
      plugin.settings.taskArchive.autoArchiveEnabled = false;
      plugin.settings.taskArchive.stateMappings = [
        { source: 'DONE', enabled: true, target: 'ARCHIVED' },
      ];
      plugin.settings.taskArchive.criterionMode = 'days';
      plugin.settings.taskArchive.criterionDays = 90;
      void plugin.saveSettings();
    });
  });

  test.afterEach(async () => {
    await page.evaluate((file) => {
      const app = (window as any).app;
      const f = app.vault.getAbstractFileByPath(file);
      if (f) void app.vault.delete(f);
    }, FILE);
  });

  async function seedTasks(count: number): Promise<void> {
    await page.evaluate(
      ({ file, count }) => {
        const app = (window as any).app;
        const lines: string[] = ['# Bulk', ''];
        for (let i = 0; i < count; i++) {
          lines.push(`- [x] DONE Bulk task ${i}`);
          lines.push('  CLOSED: [2026-01-01]');
          lines.push('');
        }
        const content = lines.join('\n');
        const existing = app.vault.getAbstractFileByPath(file);
        if (existing) {
          void app.vault.modify(existing, content);
        } else {
          void app.vault.create(file, content);
        }
      },
      { file: FILE, count },
    );
    await page.waitForTimeout(300);
    await page.evaluate(async () => {
      const app = (window as any).app;
      await app.commands.executeCommandById('todoseq:rescan-vault');
    });
    await page.waitForTimeout(600);
  }

  async function openDialog(): Promise<void> {
    await page.evaluate(async () => {
      const app = (window as any).app;
      await app.commands.executeCommandById('todoseq:archive-completed-tasks');
    });
    await page.waitForSelector('.todoseq-archive-modal', { timeout: 5000 });
    await page.waitForTimeout(200);
  }

  async function closeDialog(): Promise<void> {
    await page.evaluate(() => {
      document
        .querySelector('.todoseq-archive-modal')
        ?.querySelector('.todoseq-archive-close')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForTimeout(200);
  }

  test('exclude visible unchecks rendered rows and updates the apply label', async () => {
    await seedTasks(30);
    await openDialog();

    await expect(page.locator('.todoseq-archive-preview-count')).toHaveText(
      '30 tasks match',
    );
    await expect(page.locator('.mod-cta')).toHaveText('Archive 30 tasks');

    await page.click('.todoseq-archive-bulk-btn:has-text("Exclude visible")');

    await expect(page.locator('.mod-cta')).toHaveText('Archive 0 of 30 tasks');
    await expect(page.locator('.mod-cta')).toBeDisabled();
    const anyChecked = await page.evaluate(
      () =>
        document.querySelectorAll(
          '.todoseq-archive-row input[type="checkbox"]:checked',
        ).length,
    );
    expect(anyChecked).toBe(0);

    await closeDialog();
  });

  test('include visible re-checks rows after exclusion', async () => {
    await seedTasks(10);
    await openDialog();

    await page.click('.todoseq-archive-bulk-btn:has-text("Exclude visible")');
    await expect(page.locator('.mod-cta')).toHaveText('Archive 0 of 10 tasks');

    await page.click('.todoseq-archive-bulk-btn:has-text("Include visible")');
    await expect(page.locator('.mod-cta')).toHaveText('Archive 10 tasks');
    const allChecked = await page.evaluate(() => {
      const boxes = document.querySelectorAll(
        '.todoseq-archive-row input[type="checkbox"]',
      );
      return Array.from(boxes).every((b) => (b as HTMLInputElement).checked);
    });
    expect(allChecked).toBe(true);

    await closeDialog();
  });

  test('bulk scope is the visible slice: excluding visible leaves the count honest at scale', async () => {
    await seedTasks(500);
    await openDialog();

    await expect(page.locator('.todoseq-archive-preview-count')).toHaveText(
      '500 tasks match',
    );
    await expect(page.locator('.todoseq-archive-more')).toHaveText(
      '+300 more not shown',
    );

    // Excluding the 200 rendered rows leaves the other 300 included.
    await page.click('.todoseq-archive-bulk-btn:has-text("Exclude visible")');
    await expect(page.locator('.mod-cta')).toHaveText(
      'Archive 300 of 500 tasks',
    );

    await closeDialog();
  });

  test('empty result state: apply button says Nothing to archive, not Archive 0 tasks', async () => {
    // No matching tasks seeded: criterionDays far beyond any seeded CLOSED.
    await page.evaluate(() => {
      const app = (window as any).app;
      const plugin = app.plugins.plugins.todoseq;
      plugin.settings.taskArchive.criterionDays = 3650;
      void plugin.saveSettings();
    });
    await openDialog();

    await expect(page.locator('.todoseq-archive-empty')).toHaveText(
      'No tasks match the current criteria.',
    );
    await expect(page.locator('.mod-cta')).toHaveText('Nothing to archive');
    await expect(page.locator('.mod-cta')).toBeDisabled();

    await closeDialog();
  });

  test('task text carries a title attribute for hover reveal', async () => {
    await seedTasks(3);
    await openDialog();

    const title = await page.evaluate(() => {
      const el = document.querySelector(
        '.todoseq-archive-task-text',
      ) as HTMLElement | null;
      return el?.getAttribute('title') ?? null;
    });
    expect(title).toContain('Bulk task');

    await closeDialog();
  });
});
