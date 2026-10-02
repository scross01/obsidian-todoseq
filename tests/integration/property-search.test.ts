import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import {
  openTodoseqPanel,
  waitForTaskListVisible,
  getTaskCount,
} from './helpers/assertions';
import { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

test.describe('Property search', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);
  });

  test('search by frontmatter property filters tasks', async () => {
    // Verify both files' tasks are visible initially.
    const allText = await page.locator('.todoseq-task-list').textContent();
    expect(allText).toContain('Buy groceries');
    expect(allText).toContain('Property task one');

    // Search for tasks from files with project:alpha in frontmatter.
    const searchInput = page.locator('input[aria-label="Search tasks"]');
    await searchInput.fill('[project:alpha]');
    await page.waitForTimeout(1000);

    // Only tasks from with-properties.md should remain.
    const filteredCount = await getTaskCount(page);
    expect(filteredCount).toBeGreaterThanOrEqual(1);

    const bodyText = await page.locator('.todoseq-task-list').textContent();
    expect(bodyText).toContain('Property task one');
    expect(bodyText).toContain('Property task two');
    expect(bodyText).not.toContain('Buy groceries');
    expect(bodyText).not.toContain('Implement feature A');

    // Clear search.
    await searchInput.fill('');
    await page.waitForTimeout(500);
  });

  test('search by status frontmatter property', async () => {
    const searchInput = page.locator('input[aria-label="Search tasks"]');
    await searchInput.fill('[status:active]');
    await page.waitForTimeout(1000);

    const filteredCount = await getTaskCount(page);
    expect(filteredCount).toBeGreaterThanOrEqual(1);

    const bodyText = await page.locator('.todoseq-task-list').textContent();
    expect(bodyText).toContain('Property task one');
    // Tasks from files without matching frontmatter should not appear.
    expect(bodyText).not.toContain('Buy groceries');

    await searchInput.fill('');
    await page.waitForTimeout(500);
  });

  test('a settings change still rebuilds the property cache when a pass is in flight', async () => {
    // End-to-end pin for the dropped rebuild: the settings-change path ends in
    // propertySearchEngine.rebuildAll(), and when another pass already held the
    // cache that call used to return silently — the caller carried on, the cache
    // was never rebuilt, and property filters kept answering from stale data.
    //
    // The full build is held open so the request provably arrives during a pass.
    // The build count is the regression pin (it ran once before the fix, twice
    // after); the search afterwards is the user-visible consequence check.
    const result = await page.evaluate(async () => {
      const app = (window as any).app;
      const plugin = app.plugins.plugins.todoseq;
      const engine = plugin.propertySearchEngine;
      const originalBuild =
        engine.initializePropertyCacheSinglePass.bind(engine);
      const originalRebuild = engine.rebuildAll.bind(engine);
      // The debounced incremental pass is silenced for the duration. Left live it
      // clears the very flag under test part-way through recreateParser, which
      // lets the dropped request through by accident — the two old defects
      // cancelling out, and this test passing on the code it is meant to catch.
      const originalIncremental = engine.processPendingUpdates.bind(engine);
      engine.processPendingUpdates = () => {};

      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      // Counted only while a rebuildAll is on the stack: recreateParser also
      // re-initialises the engine, and an unrelated build must not be able to
      // make this pass by standing in for the one under test.
      let insideRebuild = 0;
      let rebuildBuilds = 0;
      engine.rebuildAll = async () => {
        insideRebuild++;
        try {
          return await originalRebuild();
        } finally {
          insideRebuild--;
        }
      };
      engine.initializePropertyCacheSinglePass = async () => {
        if (insideRebuild > 0) {
          rebuildBuilds++;
          if (rebuildBuilds === 1) await gate;
        }
        return originalBuild();
      };

      // A pass already owns the cache...
      const inFlight = engine.rebuildAll();
      await new Promise((resolve) => setTimeout(resolve, 50));

      // ...and now the real settings-change path asks for a rebuild.
      await plugin.recreateParser();

      release();
      await inFlight;
      await new Promise((resolve) => setTimeout(resolve, 500));

      engine.rebuildAll = originalRebuild;
      engine.initializePropertyCacheSinglePass = originalBuild;
      engine.processPendingUpdates = originalIncremental;
      const matches = await engine.searchProperties('[project:alpha]');
      return { rebuildBuilds, matches: [...matches] };
    });

    expect(result.rebuildBuilds).toBe(2);
    expect(result.matches).toContain('with-properties.md');

    // And the cache still answers correctly through the UI afterwards.
    const searchInput = page.locator('input[aria-label="Search tasks"]');
    await searchInput.fill('[project:alpha]');
    await page.waitForTimeout(1000);

    const bodyText = await page.locator('.todoseq-task-list').textContent();
    expect(bodyText).toContain('Property task one');
    expect(bodyText).not.toContain('Buy groceries');

    await searchInput.fill('');
    await page.waitForTimeout(500);
  });

  test('property search with regular search text combined', async () => {
    // Combine property filter with text search.
    const searchInput = page.locator('input[aria-label="Search tasks"]');
    await searchInput.fill('[project:alpha] task one');
    await page.waitForTimeout(1000);

    const filteredCount = await getTaskCount(page);
    expect(filteredCount).toBeGreaterThanOrEqual(1);

    const bodyText = await page.locator('.todoseq-task-list').textContent();
    expect(bodyText).toContain('Property task one');
    // task two should NOT appear because "task one" text doesn't match it.
    expect(bodyText).not.toContain('Property task two');

    await searchInput.fill('');
    await page.waitForTimeout(500);
  });
});
