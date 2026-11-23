import { test, expect } from '@playwright/test';
import { Page } from 'playwright';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import { openFileInEditor } from './helpers/editor-utils';

const FILE = 'property-drawer-styling';

const BODY = [
  'Property drawer styling fixture.',
  '',
  'TODO Plain task',
  ':PROPERTIES:',
  ':ID: plain-01',
  ':BLOCKER: other-02',
  ':END:',
  '',
  '- [ ] TODO Indented task',
  '  :PROPERTIES:',
  '  :ID: indented-01',
  '  :END:',
  '',
].join('\n');

let page: Page;

/** Write the fixture through the vault API and rescan. */
async function writeFixture(): Promise<void> {
  await page.evaluate(
    async ({ path, body }) => {
      const app = (window as any).app;
      const existing = app.vault.getAbstractFileByPath(path);
      if (existing) {
        await app.vault.modify(existing, body);
      } else {
        await app.vault.create(path, body);
      }
      await app.commands.executeCommandById('todoseq:rescan-vault');
    },
    { path: `${FILE}.md`, body: BODY },
  );
  await page.waitForTimeout(500);
}

async function openInReadingMode(): Promise<void> {
  await page.evaluate(async (path) => {
    const app = (window as any).app;
    const leaf = app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: 'markdown',
      state: { file: path, mode: 'preview' },
      active: true,
    });
  }, `${FILE}.md`);
  await page.waitForSelector(
    '.workspace-leaf.mod-active .markdown-preview-view',
    { timeout: 10_000 },
  );
  await page.waitForTimeout(500);
}

test.beforeAll(async () => {
  page = await getPage();
});

test.beforeEach(async () => {
  await resetVaultState(page);
});

test.afterAll(async () => {
  await page.evaluate(async (path) => {
    const app = (window as any).app;
    const file = app.vault.getAbstractFileByPath(path);
    if (file) await app.vault.delete(file);
  }, `${FILE}.md`);
});

test('drawer lines are decorated metadata in the editor', async () => {
  await writeFixture();
  await openFileInEditor(page, FILE);

  await page.waitForSelector(
    '.workspace-leaf.mod-active .cm-editor .todoseq-properties-line',
  );

  const result = await page.evaluate(() => {
    const root = document.querySelector(
      '.workspace-leaf.mod-active .cm-editor',
    );
    const lines = Array.from(
      root?.querySelectorAll('.todoseq-properties-line') ?? [],
    );
    const normal = Array.from(root?.querySelectorAll('.cm-line') ?? []).find(
      (line) => line.textContent?.includes('Property drawer styling fixture.'),
    );
    return {
      count: lines.length,
      hasKey: Boolean(root?.querySelector('.todoseq-properties-key')),
      color: lines[0] ? getComputedStyle(lines[0]).color : '',
      normalColor: normal ? getComputedStyle(normal).color : '',
      text: lines.map((line) => line.textContent ?? ''),
    };
  });

  expect(result.count).toBeGreaterThanOrEqual(6);
  expect(result.hasKey).toBe(true);
  expect(result.text).toContain(':PROPERTIES:');
  expect(result.text).toContain(':END:');
  expect(result.color).not.toBe(result.normalColor);
});

test('drawer lines are decorated metadata in the reading view', async () => {
  await writeFixture();
  await openInReadingMode();

  await page.waitForSelector(
    '.workspace-leaf.mod-active .markdown-preview-view .todoseq-properties-line',
  );

  const result = await page.evaluate(() => {
    const root = document.querySelector(
      '.workspace-leaf.mod-active .markdown-preview-view',
    );
    const lines = Array.from(
      root?.querySelectorAll('.todoseq-properties-line') ?? [],
    );
    const normal = Array.from(root?.querySelectorAll('p') ?? []).find((p) =>
      p.textContent?.includes('Property drawer styling fixture.'),
    );
    return {
      count: lines.length,
      hasKey: Boolean(root?.querySelector('.todoseq-properties-key')),
      color: lines[0] ? getComputedStyle(lines[0]).color : '',
      normalColor: normal ? getComputedStyle(normal).color : '',
      text: lines.map((line) => line.textContent ?? ''),
    };
  });

  expect(result.count).toBeGreaterThanOrEqual(6);
  expect(result.hasKey).toBe(true);
  expect(result.text).toContain(':PROPERTIES:');
  expect(result.text).toContain(':END:');
  expect(result.color).not.toBe(result.normalColor);
});
