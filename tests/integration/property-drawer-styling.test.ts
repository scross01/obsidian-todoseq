import { test, expect } from '@playwright/test';
import { Page } from 'playwright';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import { openFileInEditor } from './helpers/editor-utils';

const FILE = 'property-drawer-styling';
const EDGE_FILE = 'property-drawer-fold-edges';

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

/** Write a markdown fixture through the vault API and rescan. */
async function writeMarkdown(path: string, body: string): Promise<void> {
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
    { path, body },
  );
  await page.waitForTimeout(500);
}

/** Write the main styling fixture and rescan. */
async function writeFixture(): Promise<void> {
  await writeMarkdown(`${FILE}.md`, BODY);
}

/** Fold or unfold the drawer whose header is at `lineIndex`. */
async function toggleFoldAt(lineIndex: number): Promise<void> {
  await page.evaluate((line) => {
    const app = (window as any).app;
    const editor = app.workspace.activeLeaf?.view?.editor;
    if (!editor) throw new Error('No active editor');
    editor.setCursor({ line, ch: 0 });
    if (!app.commands.executeCommandById('editor:toggle-fold')) {
      throw new Error('editor:toggle-fold is unavailable');
    }
  }, lineIndex);
}

/** Clear any fold state left over from a previous fixture in the same leaf. */
async function unfoldAll(): Promise<void> {
  await page.evaluate(() => {
    const app = (window as any).app;
    if (!app.commands.executeCommandById('editor:unfold-all')) {
      throw new Error('editor:unfold-all is unavailable');
    }
  });
}

/** Read the visible source lines and fold placeholders in the active editor. */
async function readFoldState(): Promise<{
  placeholders: number;
  lines: string[];
}> {
  return page.evaluate(() => {
    const root = document.querySelector(
      '.workspace-leaf.mod-active .cm-editor',
    );
    return {
      placeholders: root?.querySelectorAll('.cm-foldPlaceholder').length ?? 0,
      lines: Array.from(root?.querySelectorAll('.cm-line') ?? []).map(
        (line) => line.textContent ?? '',
      ),
    };
  });
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
  await page.evaluate(
    async (paths) => {
      const app = (window as any).app;
      for (const path of paths) {
        const file = app.vault.getAbstractFileByPath(path);
        if (file) await app.vault.delete(file);
      }
    },
    [`${FILE}.md`, `${EDGE_FILE}.md`],
  );
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

test('a closed task property drawer folds with the native editor control', async () => {
  await writeFixture();
  await openFileInEditor(page, FILE);

  await page.waitForSelector(
    '.workspace-leaf.mod-active .cm-editor .todoseq-properties-line',
  );

  const before = await page.evaluate(async (path) => {
    const app = (window as any).app;
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) throw new Error(`File not found: ${path}`);
    return await app.vault.read(file);
  }, `${FILE}.md`);
  expect(before).toContain(':ID: plain-01');

  await page.evaluate(() => {
    const app = (window as any).app;
    const editor = app.workspace.activeLeaf?.view?.editor;
    if (!editor) throw new Error('No active editor');

    const line = (editor.getValue() as string)
      .split('\n')
      .findIndex((text: string) => text === ':PROPERTIES:');
    if (line < 0) throw new Error('Top-level property drawer not found');

    editor.setCursor({ line, ch: 0 });
    if (!app.commands.executeCommandById('editor:toggle-fold')) {
      throw new Error('editor:toggle-fold is unavailable');
    }
  });

  await page.waitForSelector('.workspace-leaf.mod-active .cm-foldPlaceholder', {
    timeout: 5_000,
  });

  const folded = await page.evaluate(() => {
    const root = document.querySelector(
      '.workspace-leaf.mod-active .cm-editor',
    );
    const lines = Array.from(root?.querySelectorAll('.cm-line') ?? []).map(
      (line) => line.textContent ?? '',
    );
    return {
      placeholderCount:
        root?.querySelectorAll('.cm-foldPlaceholder').length ?? 0,
      headerVisible: lines.some((text) => text.includes(':PROPERTIES:')),
      entryVisible: lines.some((text) => text.includes(':ID: plain-01')),
      topLevelEndVisible: lines.some((text) => text === ':END:'),
    };
  });

  expect(folded.placeholderCount).toBeGreaterThanOrEqual(1);
  expect(folded.headerVisible).toBe(true);
  expect(folded.entryVisible).toBe(false);
  expect(folded.topLevelEndVisible).toBe(false);

  await page
    .locator('.workspace-leaf.mod-active .cm-foldPlaceholder')
    .first()
    .click();

  await page.waitForFunction(() => {
    const root = document.querySelector(
      '.workspace-leaf.mod-active .cm-editor',
    );
    return Array.from(root?.querySelectorAll('.cm-line') ?? []).some((line) =>
      line.textContent?.includes(':ID: plain-01'),
    );
  });

  const unfolded = await page.evaluate(() => {
    const root = document.querySelector(
      '.workspace-leaf.mod-active .cm-editor',
    );
    const lines = Array.from(root?.querySelectorAll('.cm-line') ?? []).map(
      (line) => line.textContent ?? '',
    );
    return {
      entryVisible: lines.some((text) => text.includes(':ID: plain-01')),
      topLevelEndVisible: lines.some((text) => text === ':END:'),
    };
  });
  expect(unfolded.entryVisible).toBe(true);
  expect(unfolded.topLevelEndVisible).toBe(true);

  const after = await page.evaluate(async (path) => {
    const app = (window as any).app;
    const file = app.vault.getAbstractFileByPath(path);
    if (!file) throw new Error(`File not found: ${path}`);
    return await app.vault.read(file);
  }, `${FILE}.md`);
  expect(after).toBe(before);
});

test('a quoted task drawer folds and unfolds in the editor', async () => {
  const lines = [
    'Property drawer fold edge fixture.',
    '',
    '> TODO Quoted task',
    '> :PROPERTIES:',
    '> :ID: quoted-01',
    '> :END:',
  ];
  const headerLine = lines.indexOf('> :PROPERTIES:');

  await writeMarkdown(`${EDGE_FILE}.md`, lines.join('\n'));
  await openFileInEditor(page, EDGE_FILE);
  await unfoldAll();
  await toggleFoldAt(headerLine);

  await page.waitForSelector('.workspace-leaf.mod-active .cm-foldPlaceholder', {
    timeout: 5_000,
  });

  const folded = await readFoldState();
  expect(folded.placeholders).toBeGreaterThanOrEqual(1);
  expect(folded.lines.some((text) => text.includes(':PROPERTIES:'))).toBe(true);
  expect(folded.lines.some((text) => text.includes(':ID: quoted-01'))).toBe(
    false,
  );
  expect(folded.lines.some((text) => text.trim() === '> :END:')).toBe(false);

  await page
    .locator('.workspace-leaf.mod-active .cm-foldPlaceholder')
    .first()
    .click();
  await page.waitForFunction(() => {
    const root = document.querySelector(
      '.workspace-leaf.mod-active .cm-editor',
    );
    return Array.from(root?.querySelectorAll('.cm-line') ?? []).some((line) =>
      line.textContent?.includes(':ID: quoted-01'),
    );
  });

  const unfolded = await readFoldState();
  expect(unfolded.placeholders).toBe(0);
  expect(unfolded.lines.some((text) => text.trim() === '> :END:')).toBe(true);
});

test('a 58-entry drawer folds within the bounded scan', async () => {
  const entries = [
    ':ID: long-01',
    ...Array.from(
      { length: 57 },
      (_, index) => `:EXTRA_${index + 1}: value-${index + 1}`,
    ),
  ];
  const lines = ['TODO Long drawer task', ':PROPERTIES:', ...entries, ':END:'];
  const headerLine = lines.indexOf(':PROPERTIES:');

  await writeMarkdown(`${EDGE_FILE}.md`, lines.join('\n'));
  await openFileInEditor(page, EDGE_FILE);
  await unfoldAll();
  await toggleFoldAt(headerLine);

  await page.waitForSelector('.workspace-leaf.mod-active .cm-foldPlaceholder', {
    timeout: 5_000,
  });

  const folded = await readFoldState();
  expect(folded.placeholders).toBeGreaterThanOrEqual(1);
  expect(folded.lines.some((text) => text.includes(':PROPERTIES:'))).toBe(true);
  expect(folded.lines.some((text) => text.includes(':ID: long-01'))).toBe(
    false,
  );
  expect(folded.lines.some((text) => text.includes(':EXTRA_57:'))).toBe(false);
  expect(folded.lines.some((text) => text.trim() === ':END:')).toBe(false);
});

test('a 70-entry drawer stays unfolded beyond the bounded scan', async () => {
  const entries = [
    ':ID: long-over-01',
    ...Array.from(
      { length: 69 },
      (_, index) => `:EXTRA_${index + 1}: value-${index + 1}`,
    ),
  ];
  const lines = [
    'TODO Over-bound drawer task',
    ':PROPERTIES:',
    ...entries,
    ':END:',
  ];
  const headerLine = lines.indexOf(':PROPERTIES:');

  await writeMarkdown(`${EDGE_FILE}.md`, lines.join('\n'));
  await openFileInEditor(page, EDGE_FILE);
  await unfoldAll();
  await toggleFoldAt(headerLine);
  await page.waitForTimeout(250);

  const state = await readFoldState();
  expect(state.placeholders).toBe(0);
  expect(state.lines.some((text) => text.includes(':PROPERTIES:'))).toBe(true);
  expect(state.lines.some((text) => text.includes(':ID: long-over-01'))).toBe(
    true,
  );
  expect(state.lines.some((text) => text.includes(':EXTRA_69:'))).toBe(true);
  expect(state.lines.some((text) => text.trim() === ':END:')).toBe(true);
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
