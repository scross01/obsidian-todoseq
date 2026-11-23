import { test, expect } from '@playwright/test';
import { Page } from 'playwright';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import { openFileInEditor } from './helpers/editor-utils';

/**
 * A trailing block anchor must keep Obsidian's native `.cm-blockid` styling.
 * TODOseq's metadata classes (date line, description, properties drawer) are
 * whole-line decorations, so they must stop before ` ^anchor` or the anchor
 * inherits the metadata font size/colour instead of the native anchor style.
 */
const FILE = 'anchor-styling';

const BODY = [
  'Anchor styling fixture.',
  '',
  '- [ ] TODO Anchored scheduled',
  '  SCHEDULED: <2026-11-24 Tue> ^probedate',
  '',
  '- [ ] TODO Anchored description',
  '  DESCRIPTION: Probe description ^probedesc',
  '',
  '- [ ] TODO Anchored drawer',
  '  :PROPERTIES:',
  '  :ID: probe-01',
  '  :END: ^probeend',
  '',
  'Plain paragraph ^plainanchor',
  '',
].join('\n');

let page: Page;

async function writeFixture(): Promise<void> {
  await page.evaluate(
    async ({ path, body }) => {
      const app = (window as any).app;
      const existing = app.vault.getAbstractFileByPath(path);
      if (existing) await app.vault.modify(existing, body);
      else await app.vault.create(path, body);
      await app.commands.executeCommandById('todoseq:rescan-vault');
    },
    { path: `${FILE}.md`, body: BODY },
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

test('metadata line anchors keep Obsidian native anchor styling', async () => {
  await writeFixture();
  await openFileInEditor(page, FILE);
  await page.waitForSelector(
    '.workspace-leaf.mod-active .cm-editor .todoseq-properties-line',
  );
  await page.waitForTimeout(300);

  const result = await page.evaluate(() => {
    const root = document.querySelector(
      '.workspace-leaf.mod-active .cm-editor',
    );
    const blockids = Array.from(
      root?.querySelectorAll('.cm-blockid') ?? [],
    ).map((el) => ({
      text: el.textContent ?? '',
      todoseqChildren: Array.from(
        el.querySelectorAll('[class*="todoseq-"]'),
      ).map((child) => child.className),
      size: getComputedStyle(el).fontSize,
    }));

    const endLine = Array.from(
      root?.querySelectorAll('.todoseq-properties-line') ?? [],
    ).find((el) => el.textContent?.trim().startsWith(':END:'));

    return {
      blockids,
      endKind: endLine?.getAttribute('data-properties-line') ?? null,
      endText: endLine?.textContent ?? null,
    };
  });

  const byText = (text: string) =>
    result.blockids.filter((entry) => entry.text === text);
  const dateAnchor = byText('^probedate')[0];
  const descAnchor = byText('^probedesc')[0];
  const endAnchor = byText('^probeend')[0];
  const plainAnchor = byText('^plainanchor')[0];

  expect(dateAnchor).toBeDefined();
  expect(descAnchor).toBeDefined();
  expect(endAnchor).toBeDefined();
  expect(plainAnchor).toBeDefined();

  // The native `.cm-blockid` span holds only the anchor token; no TODOseq
  // metadata class is nested inside it.
  for (const anchor of [dateAnchor, descAnchor, endAnchor]) {
    expect(anchor.todoseqChildren).toEqual([]);
    // Same font size as a plain paragraph's anchor: native, not 0.9rem.
    expect(anchor.size).toBe(plainAnchor.size);
  }

  // The anchored `:END:` closes the drawer instead of being styled as an
  // entry line, and its span text stops before the anchor.
  expect(result.endKind).toBe('boundary');
  expect(result.endText?.trim()).toBe(':END:');
});
