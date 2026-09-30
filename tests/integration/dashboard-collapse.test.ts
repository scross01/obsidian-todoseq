/**
 * Integration tests for dashboard card collapse chevron placement (plan 020
 * third feedback round). Pins the visual contract in real Obsidian:
 *  - with a title: chevron directly after the title text (left-aligned
 *    group), not floating mid-card between title and total;
 *  - without a title: chevron leads the header line before the task count,
 *    and stays visible while collapsed.
 */
import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import { closeAllModals } from './helpers/assertions';
import { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

const NOTE = 'dashboard-collapse-check.md';
const SEEDS = 'dashboard-collapse-seeds.md';

function noteContent(): string {
  return `# Collapse check

\`\`\`todoseq-dashboard
search: tag:collapsetest
group-by: tag
display: bar
title: Active by tag
collapse: true
\`\`\`

\`\`\`todoseq-dashboard
search: tag:collapsetest
group-by: tag
display: bar
collapse: true
\`\`\`
`;
}

function seedsContent(): string {
  return `# Collapse seeds

- [ ] TODO Collapse seed one #collapsetest
- [ ] TODO Collapse seed two #collapsetest
- [ ] TODO Collapse seed three #collapsetest
`;
}

async function writeAndOpen(): Promise<void> {
  await closeAllModals(page);
  await page.evaluate(
    async ({ note, seeds, noteContent, seedsContent }) => {
      const app = (window as any).app;
      await app.vault.adapter.write(note, noteContent);
      await app.vault.adapter.write(seeds, seedsContent);
      for (const path of [note, seeds]) {
        for (let i = 0; i < 50; i++) {
          if (app.vault.getAbstractFileByPath(path)) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (!app.vault.getAbstractFileByPath(path)) {
          throw new Error(`${path} not indexed after write`);
        }
      }
      const plugin = app.plugins.plugins.todoseq;
      await plugin.vaultScanner.scanVault();
      const file = app.vault.getAbstractFileByPath(note);
      const leaf = app.workspace.getLeaf(false);
      await leaf.setViewState({
        type: 'markdown',
        state: { file: file.path, mode: 'source' },
        active: true,
      });
    },
    {
      note: NOTE,
      seeds: SEEDS,
      noteContent: noteContent(),
      seedsContent: seedsContent(),
    },
  );

  // Diagnostic: dump the rendered dashboard DOM state so a wait failure
  // names its missing clause instead of guessing.
  await page.waitForTimeout(3_000);
  const dump = await page.evaluate(() => {
    const scope = document.querySelector('.workspace-leaf.mod-active');
    const containers = Array.from(
      scope?.querySelectorAll<HTMLElement>('.todoseq-dashboard-container') ??
        [],
    );
    return {
      leafFound: !!scope,
      containerCount: containers.length,
      containers: containers.map((c) => ({
        collapsed: c.classList.contains('todoseq-dashboard-collapsed'),
        headerRole:
          c.querySelector('.todoseq-dashboard-header')?.getAttribute('role') ??
          null,
        chevronCount: c.querySelectorAll('.todoseq-collapse-toggle-icon')
          .length,
        barRows: c.querySelectorAll('.todoseq-dashboard-bar-row').length,
        headerChildren: Array.from(
          c.querySelector('.todoseq-dashboard-header')?.children ?? [],
        ).map((el) => el.className.split(' ').pop()),
      })),
    };
  });
  console.debug('dashboard-collapse dump:', JSON.stringify(dump, null, 1));

  // Both cards render collapsed in the live-preview CM embed. Note: the
  // collapsed content stays in the DOM hidden by CSS, so the assertions are
  // visibility-based, not absence-based.
  await page.waitForFunction(
    () => {
      const scope = document.querySelector('.workspace-leaf.mod-active');
      if (!scope) return false;
      const containers = Array.from(
        scope.querySelectorAll<HTMLElement>('.todoseq-dashboard-container'),
      );
      const chevrons = Array.from(
        scope.querySelectorAll<HTMLElement>(
          '.todoseq-dashboard-header .todoseq-collapse-toggle-icon',
        ),
      );
      const barRows = Array.from(
        scope.querySelectorAll<HTMLElement>('.todoseq-dashboard-bar-row'),
      );
      return (
        containers.length >= 2 &&
        containers.every((c) =>
          c.classList.contains('todoseq-dashboard-collapsed'),
        ) &&
        chevrons.length >= 2 &&
        chevrons.every((el) => el.offsetParent !== null) &&
        barRows.every((el) => el.offsetParent === null)
      );
    },
    undefined,
    { timeout: 15_000 },
  );
}

test.describe('Dashboard collapse chevron placement', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
  });

  test('chevron sits directly after the title, not mid-card', async () => {
    await writeAndOpen();

    const metrics = await page.evaluate(() => {
      const scope = document.querySelector('.workspace-leaf.mod-active');
      const header = scope?.querySelector<HTMLElement>(
        '.todoseq-dashboard-header',
      );
      if (!header) return null;
      const title = header.querySelector<HTMLElement>(
        '.todoseq-dashboard-title',
      );
      const chevron = header.querySelector<HTMLElement>(
        '.todoseq-collapse-toggle-icon',
      );
      const total = header.querySelector<HTMLElement>(
        '.todoseq-dashboard-total',
      );
      if (!title || !chevron || !total) return null;
      const t = title.getBoundingClientRect();
      const c = chevron.getBoundingClientRect();
      const tot = total.getBoundingClientRect();
      return {
        gapTitleChevron: c.left - t.right,
        gapChevronTotal: tot.left - c.right,
        chevronMid: c.top + c.height / 2,
        titleMid: t.top + t.height / 2,
      };
    });
    expect(metrics).not.toBeNull();
    // Glued to the title (within 16px), far from the right-aligned total.
    expect(metrics!.gapTitleChevron).toBeLessThanOrEqual(16);
    expect(metrics!.gapChevronTotal).toBeGreaterThan(40);
    // Optically centered on the title's line.
    expect(
      Math.abs(metrics!.chevronMid - metrics!.titleMid),
    ).toBeLessThanOrEqual(3);
  });

  test('titleless collapsed card shows a chevron leading the count', async () => {
    await writeAndOpen();

    const metrics = await page.evaluate(() => {
      const scope = document.querySelector('.workspace-leaf.mod-active');
      const headers = Array.from(
        scope?.querySelectorAll<HTMLElement>('.todoseq-dashboard-header') ?? [],
      );
      // The titleless card is the second block; find the header whose first
      // child is the chevron.
      const header = headers.find(
        (h) =>
          h.firstElementChild?.classList.contains(
            'todoseq-collapse-toggle-icon',
          ) ?? false,
      );
      if (!header) return null;
      const chevron = header.querySelector<HTMLElement>(
        '.todoseq-collapse-toggle-icon',
      );
      const total = header.querySelector<HTMLElement>(
        '.todoseq-dashboard-total',
      );
      if (!chevron || !total) return null;
      const h = header.getBoundingClientRect();
      const c = chevron.getBoundingClientRect();
      const t = total.getBoundingClientRect();
      return {
        chevronVisible: chevron.offsetParent !== null && c.width > 0,
        chevronLeading: c.left - h.left < t.left - h.left,
        countRightAligned: Math.abs(h.right - t.right) <= 2,
        chevronMid: c.top + c.height / 2,
        totalMid: t.top + t.height / 2,
      };
    });
    expect(metrics).not.toBeNull();
    // Visible while collapsed (the original defect: the chevron lived in the
    // hidden chips row).
    expect(metrics!.chevronVisible).toBe(true);
    // Chevron starts the line; the count right-aligns (margin-left: auto).
    expect(metrics!.chevronLeading).toBe(true);
    expect(metrics!.countRightAligned).toBe(true);
    // Optically centered on the count's line.
    expect(
      Math.abs(metrics!.chevronMid - metrics!.totalMid),
    ).toBeLessThanOrEqual(3);
  });

  test('toggling the collapsed titleless header expands the card', async () => {
    await writeAndOpen();

    const before = await page.evaluate(() => {
      const scope = document.querySelector('.workspace-leaf.mod-active');
      const headers = Array.from(
        scope?.querySelectorAll<HTMLElement>('.todoseq-dashboard-header') ?? [],
      );
      const header = headers.find(
        (h) =>
          h.firstElementChild?.classList.contains(
            'todoseq-collapse-toggle-icon',
          ) ?? false,
      );
      return header?.getAttribute('aria-expanded') ?? null;
    });
    expect(before).toBe('false');

    await page.evaluate(() => {
      const scope = document.querySelector('.workspace-leaf.mod-active');
      const headers = Array.from(
        scope?.querySelectorAll<HTMLElement>('.todoseq-dashboard-header') ?? [],
      );
      const header = headers.find(
        (h) =>
          h.firstElementChild?.classList.contains(
            'todoseq-collapse-toggle-icon',
          ) ?? false,
      );
      header?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await page.waitForFunction(
      () => {
        const scope = document.querySelector('.workspace-leaf.mod-active');
        const headers = Array.from(
          scope?.querySelectorAll<HTMLElement>('.todoseq-dashboard-header') ??
            [],
        );
        const header = headers.find(
          (h) =>
            h.firstElementChild?.classList.contains(
              'todoseq-collapse-toggle-icon',
            ) ?? false,
        );
        const container = header?.closest('.todoseq-dashboard-container');
        return (
          header?.getAttribute('aria-expanded') === 'true' &&
          !!container &&
          !container.classList.contains('todoseq-dashboard-collapsed')
        );
      },
      undefined,
      { timeout: 5_000 },
    );
  });
});
