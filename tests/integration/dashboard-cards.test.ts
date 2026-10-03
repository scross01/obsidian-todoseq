/**
 * Integration tests for todoseq-dashboard embedded cards (plan 020 Step 6).
 *
 * Runs against a real Obsidian instance via CDP. The dashboard note and its
 * seed tasks are created through the vault API inside each test (the shared
 * fixture files are frozen for this plan), then a rescan makes the plugin
 * re-read them.
 */
import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import { closeAllModals, waitForTaskListVisible } from './helpers/assertions';
import { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

const DASHBOARD_NOTE = 'dashboard-demo.md';
const SEEDS_NOTE = 'dashboard-seeds.md';

/** Local-date string `offset` days from today (no UTC). */
function seedDate(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function dashboardNoteContent(): string {
  return `# Dashboard demo

\`\`\`todoseq-dashboard
search: tag:project scheduled:due OR scheduled:overdue
group-by: priority
display: bar
title: Due & overdue
\`\`\`

\`\`\`todoseq-dashboard
search: tag:does-not-exist-xyz
group-by: state
title: Empty check
\`\`\`
`;
}

function seedsNoteContent(): string {
  return `# Dashboard seeds

- [ ] TODO [#A] High overdue one #project
  SCHEDULED: <${seedDate(-2)}>
- [ ] TODO [#A] High overdue two #project
  SCHEDULED: <${seedDate(-1)}>
- [ ] TODO [#A] High today one #project
  SCHEDULED: <${seedDate(0)}>
- [ ] TODO [#B] Med today one #project
  SCHEDULED: <${seedDate(0)}>
- [ ] TODO [#B] Med overdue stray
  SCHEDULED: <${seedDate(-3)}>
- [ ] TODO [#C] Low today one #project
  SCHEDULED: <${seedDate(0)}>
- [ ] TODO Med future tagged #project
  SCHEDULED: <${seedDate(3)}>
- [ ] TODO Med future untagged
  SCHEDULED: <${seedDate(3)}>
- [ ] TODO Tagged no date #project
`;
}

async function seedNotes(): Promise<void> {
  await page.evaluate(
    async ({ note, seeds, noteContent, seedsContent }) => {
      const app = (window as any).app;
      await app.vault.adapter.write(note, noteContent);
      await app.vault.adapter.write(seeds, seedsContent);
      const plugin = app.plugins.plugins.todoseq;
      await plugin.vaultScanner.scanVault();
    },
    {
      note: DASHBOARD_NOTE,
      seeds: SEEDS_NOTE,
      noteContent: dashboardNoteContent(),
      seedsContent: seedsNoteContent(),
    },
  );
}

/** Close dashboard leaves left over from earlier tests. */
async function detachDashboardLeaves(): Promise<void> {
  await page.evaluate(async () => {
    const app = (window as any).app;
    const leaves = app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      const filePath = leaf.view?.file?.path;
      if (
        filePath === 'dashboard-demo.md' ||
        filePath === 'dashboard-seeds.md'
      ) {
        leaf.detach();
      }
    }
  });
}

async function openDashboardInReadingMode(): Promise<void> {
  await closeAllModals(page);
  await detachDashboardLeaves();

  await page.evaluate(async (note) => {
    const app = (window as any).app;
    const file = app.vault.getAbstractFileByPath(note);
    if (!file) throw new Error(`${note} not found`);
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }, DASHBOARD_NOTE);

  // Toggle to reading mode if currently in editing mode.
  const editButton = page.locator(
    '.workspace-leaf.mod-active button[aria-label*="read"]',
  );
  if (await editButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await editButton.click();
  }

  // Wait for the reading-view render (live preview also processes code
  // blocks, producing a second card set inside the CM source DOM).
  await page.waitForFunction(
    () => {
      const scope = document.querySelector(
        '.workspace-leaf.mod-active .markdown-reading-view',
      );
      if (!scope) return false;
      const cards = scope.querySelectorAll('.todoseq-dashboard-container');
      return (
        cards.length >= 2 &&
        cards[0].querySelector('.todoseq-dashboard-bar-row') !== null &&
        cards[1].querySelector('.todoseq-dashboard-empty') !== null
      );
    },
    { timeout: 15_000 },
  );
}

test.describe('Dashboard cards', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
    await seedNotes();
  });

  test('renders the card with counts matching the seeded tasks', async () => {
    await openDashboardInReadingMode();

    const card = page
      .locator(
        '.workspace-leaf.mod-active .markdown-reading-view .todoseq-dashboard-container',
      )
      .first();
    const rows = card.locator('.todoseq-dashboard-bar-row');
    await expect(rows).toHaveCount(3);

    // Header total: the 6 seeded matches plus the two frozen table-tasks
    // fixture rows ("five" [#B] and "six" [#C], statically dated July 2026)
    // that match the query's standalone scheduled:overdue arm.
    await expect(card.locator('.todoseq-dashboard-total')).toHaveText(
      '8 tasks',
    );

    // Urgency-ordered rows with evaluator-driven counts:
    // High = 3 seeded [#A]; Medium = 2 seeded [#B] + fixture "five";
    // Low = 1 seeded [#C] + fixture "six".
    const expected: Array<[string, string]> = [
      ['High', '3'],
      ['Medium', '3'],
      ['Low', '2'],
    ];
    for (let i = 0; i < expected.length; i++) {
      const row = rows.nth(i);
      await expect(row.locator('.todoseq-dashboard-bar-label')).toHaveText(
        expected[i][0],
      );
      await expect(row.locator('.todoseq-dashboard-bar-count')).toHaveText(
        expected[i][1],
      );
    }
  });

  test('clicking a group opens the Task List with the composed query and matching count', async () => {
    await openDashboardInReadingMode();

    const card = page
      .locator(
        '.workspace-leaf.mod-active .markdown-reading-view .todoseq-dashboard-container',
      )
      .first();
    await card.locator('.todoseq-dashboard-bar-row').first().click();

    // Plain click reuses the existing Task List leaf (created in the sidebar)
    await waitForTaskListVisible(page);

    const searchInput = page.locator('input[aria-label="Search tasks"]');
    await expect(searchInput).toHaveValue(
      '(tag:project scheduled:due OR scheduled:overdue) priority:high',
      { timeout: 10_000 },
    );

    // The consistency guarantee, end to end: the Task List shows exactly the
    // card's High count (3 high-priority matched tasks).
    await page.waitForFunction(
      () => document.querySelectorAll('.todoseq-task-item').length === 3,
      { timeout: 15_000 },
    );
  });

  test('updates card counts in place when a task changes on another page', async () => {
    await closeAllModals(page);
    await detachDashboardLeaves();

    // Open the demo note in the editor (live preview renders the card inside
    // the CM source DOM, which Obsidian keeps alive when the leaf goes
    // background — unlike the reading view, which is unloaded).
    await page.evaluate(async (note) => {
      const app = (window as any).app;
      const file = app.vault.getAbstractFileByPath(note);
      if (!file) throw new Error(`${note} not found`);
      const leaf = app.workspace.getLeaf(false);
      await leaf.setViewState({
        type: 'markdown',
        state: { file: file.path, mode: 'source' },
        active: true,
      });
    }, DASHBOARD_NOTE);

    await page.waitForFunction(
      () =>
        !!document.querySelector(
          '.workspace-leaf.mod-active .cm-embed-block .todoseq-dashboard-bar-row',
        ),
      { timeout: 15_000 },
    );

    // Capture the live-preview card's High row.
    const rowHandle = await page
      .locator(
        '.workspace-leaf.mod-active .cm-embed-block .todoseq-dashboard-container',
      )
      .first()
      .locator('.todoseq-dashboard-bar-row')
      .first()
      .evaluateHandle((el) => el);

    const before = await (rowHandle as import('playwright').JSHandle).evaluate(
      (el: HTMLElement) =>
        el.querySelector('.todoseq-dashboard-bar-count')?.textContent,
    );
    expect(before).toBe('3');

    // Switch to the seeds note in a separate tab and move the medium task to
    // high priority via the editor command. The dashboard card stays mounted
    // on its background leaf and is patched there.
    await page.evaluate(async (seeds) => {
      const app = (window as any).app;
      const file = app.vault.getAbstractFileByPath(seeds);
      if (!file) throw new Error(`${seeds} not found`);
      const leaf = app.workspace.getLeaf('tab');
      await leaf.setViewState({
        type: 'markdown',
        state: { file: file.path, mode: 'source' },
        active: true,
      });
      const view = app.workspace.activeLeaf?.view;
      if (!view || !view.editor) {
        throw new Error('seeds note is not an editor view');
      }
      const editor = view.editor;
      const line = editor
        .getValue()
        .split('\n')
        .findIndex((l: string) => l.includes('Med today one'));
      if (line < 0) throw new Error('Med today one line not found');
      editor.setCursor({ line, ch: 0 });
    }, SEEDS_NOTE);

    await page.evaluate(() => {
      const app = (window as any).app;
      app.commands.executeCommandById('todoseq:set-priority-high');
    });

    // Wait past the 150ms refresh debounce (and the write round-trip).
    await page.waitForTimeout(1_500);

    // The captured background row node was patched in place: same DOM node,
    // fresh count.
    const after = await (rowHandle as import('playwright').JSHandle).evaluate(
      (el: HTMLElement) => ({
        connected: el.isConnected,
        count:
          el.querySelector('.todoseq-dashboard-bar-count')?.textContent ?? null,
        label:
          el.querySelector('.todoseq-dashboard-bar-label')?.textContent ?? null,
      }),
    );
    expect(after.label).toBe('High');
    expect(after.count).toBe('4');
    expect(after.connected).toBe(true);
  });

  test('renders the empty state for a query with no matches', async () => {
    await openDashboardInReadingMode();

    const emptyCard = page
      .locator(
        '.workspace-leaf.mod-active .markdown-reading-view .todoseq-dashboard-container',
      )
      .filter({ hasText: 'Empty check' })
      .first();
    await expect(emptyCard.locator('.todoseq-dashboard-empty')).toBeVisible();
    await expect(emptyCard.locator('.todoseq-dashboard-empty')).toContainText(
      'No tasks match',
    );
    await expect(emptyCard.locator('.todoseq-dashboard-empty')).toContainText(
      'Nothing in the vault matches',
    );
  });
});
