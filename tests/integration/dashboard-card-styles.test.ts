/**
 * Styling integration tests for todoseq-dashboard cards (plan 020 round-2
 * feedback: style gaps vs. the approved mockup).
 *
 * Machine-checks against the shipped styles.css in real Obsidian:
 *  - the heatmap weekday gutter aligns with the first grid row (the mockup
 *    offsets the gutter by the months-strip height, not "cell + gap + 1.1em");
 *  - today's heatmap cell carries the mockup's accent border (not a ring).
 *
 * Assertions run against whichever render of the active leaf is visible
 * (reading view or the live-preview CM embed) — the mockup geometry is the
 * same in both. Notes are created through the vault API (see
 * dashboard-cards.test.ts for the same pattern).
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

const HEATMAP_NOTE = 'dashboard-heatmap-styles.md';
const SEEDS_NOTE = 'dashboard-heatmap-seeds.md';

/** Local-date string `offset` days from today (no UTC). */
function seedDate(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function heatmapNoteContent(): string {
  return `# Heatmap style check

\`\`\`todoseq-dashboard
search: tag:heatmapstyles
group-by: scheduled
display: heatmap
title: Due dates
\`\`\`
`;
}

function seedsNoteContent(): string {
  return `# Heatmap style seeds

- [ ] TODO Heat one #heatmapstyles
  SCHEDULED: <${seedDate(0)}>
- [ ] TODO Heat two #heatmapstyles
  SCHEDULED: <${seedDate(3)}>
- [ ] TODO Heat three #heatmapstyles
  SCHEDULED: <${seedDate(10)}>
`;
}

/**
 * Write both notes, wait for the vault index to register them, rescan, then
 * open the heatmap note on the active leaf in source mode.
 *
 * - adapter.write does not register files in the vault index synchronously,
 *   so a getAbstractFileByPath retry is required before opening.
 * - setViewState on the active leaf (getLeaf(false)) is deterministic in the
 *   shared session; openFile after detaching leaves can silently leave a
 *   New-tab leaf active (observed against dashboard-cards.test.ts patterns).
 * - Source mode renders the card in the live-preview CM embed; the
 *   assertions below are mode-agnostic.
 */
async function writeAndOpenHeatmap(): Promise<void> {
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
      note: HEATMAP_NOTE,
      seeds: SEEDS_NOTE,
      noteContent: heatmapNoteContent(),
      seedsContent: seedsNoteContent(),
    },
  );

  // Wait for a rendered heatmap cell in the active leaf. Stale (display:none)
  // renders from an inactive mode are skipped via offsetParent.
  await page.waitForFunction(
    () => {
      const scope = document.querySelector('.workspace-leaf.mod-active');
      if (!scope) return false;
      const cells = Array.from(
        scope.querySelectorAll<HTMLElement>(
          '.todoseq-dashboard-heatmap-grid .todoseq-dashboard-heatmap-cell',
        ),
      );
      return cells.some((el) => el.offsetParent !== null);
    },
    undefined,
    { timeout: 15_000 },
  );
}

/** First rendered (visible) element matching sel inside the active leaf. */
function pickVisibleHandle(sel: string) {
  return page.evaluateHandle((selector) => {
    const scope = document.querySelector('.workspace-leaf.mod-active');
    const els = Array.from(
      scope?.querySelectorAll<HTMLElement>(selector) ?? [],
    );
    return els.find((el) => el.offsetParent !== null) ?? null;
  }, sel);
}

test.describe('Dashboard card styles (mockup conformance)', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
  });

  test('weekday gutter labels align with the first grid row (±2px)', async () => {
    await writeAndOpenHeatmap();

    const gutterHandle = await pickVisibleHandle(
      '.todoseq-dashboard-heatmap-gutter span',
    );
    const cellHandle = await pickVisibleHandle(
      '.todoseq-dashboard-heatmap-grid .todoseq-dashboard-heatmap-cell',
    );
    const result = await page.evaluate(
      ([gutter, cell]) => {
        const g = gutter as HTMLElement | null;
        const c = cell as HTMLElement | null;
        if (!g || !c) return null;
        return {
          gutterTop: g.getBoundingClientRect().top,
          cellTop: c.getBoundingClientRect().top,
        };
      },
      [gutterHandle, cellHandle],
    );
    await gutterHandle.dispose();
    await cellHandle.dispose();

    expect(result).not.toBeNull();
    // Degenerate hidden-render guard: a display:none element rect sits at 0.
    expect(result!.cellTop).not.toBe(0);
    // The mockup lines the Monday label up with the first grid row. The
    // original implementation offset the gutter by cell+gap+1.1em (~34.6px)
    // while the months strip above the grid is only ~19.6px tall — a 15px
    // drift this assertion pins shut.
    expect(Math.abs(result!.gutterTop - result!.cellTop)).toBeLessThanOrEqual(
      2,
    );
  });

  test("today's heatmap cell uses the accent border, not a ring", async () => {
    await writeAndOpenHeatmap();

    const todayHandle = await pickVisibleHandle(
      '.todoseq-dashboard-heatmap-cell.today',
    );
    const style = await page.evaluate((today) => {
      const el = today as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      // Probe: resolve --interactive-accent to its computed rgb() form (the
      // raw variable may be declared in hsl(), so string equality with the
      // computed border-color would be format-fragile).
      const probe = document.createElement('div');
      probe.style.display = 'none';
      probe.style.backgroundColor = 'var(--interactive-accent)';
      el.appendChild(probe);
      const accentRgb = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        shadow: cs.boxShadow,
        borderColor: cs.borderTopColor,
        accentRgb,
      };
    }, todayHandle);
    await todayHandle.dispose();

    expect(style).not.toBeNull();
    // Mockup: today is marked with the accent border color, not a box-shadow
    // ring. An element without a box-shadow computes to 'none'.
    expect(style!.shadow).toBe('none');
    expect(style!.borderColor).toBe(style!.accentRgb);
  });
});
