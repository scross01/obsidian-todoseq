import { test, expect } from '@playwright/test';
import { Page } from 'playwright';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import { openFileInEditor, readVaultFile } from './helpers/editor-utils';
import {
  openTodoseqPanel,
  runCommandById,
  waitForTaskListVisible,
} from './helpers/assertions';

const BLOCKER = 'dependency-blocker.md';
const DEPENDENT = 'dependency-dependent.md';

const BLOCKER_BODY = [
  '# Dependency Blocker',
  '',
  '- [ ] TODO Blocker task ^blocker',
  '',
].join('\n');

function dependentBody(): string {
  return [
    '# Dependency Dependent',
    '',
    '- [ ] TODO Dependent task',
    '  :PROPERTIES:',
    '  :BLOCKER: [[dependency-blocker#^blocker]]',
    '  :END:',
    '',
  ].join('\n');
}

/** Second task with the missing anchor, after the valid dependent. */
const MISSING_TASK = [
  '- [ ] TODO Broken task',
  '  :PROPERTIES:',
  '  :BLOCKER: [[dependency-blocker#^missing]]',
  '  :END:',
].join('\n');

const CLIPBOARD_FILE = 'clipboard-actions';

async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const electron = (window as any).require?.('electron');
    if (electron?.clipboard?.readText) {
      return electron.clipboard.readText() as string;
    }
    return navigator.clipboard.readText();
  });
}

async function writeClipboard(page: Page, text: string): Promise<void> {
  await page.evaluate(async (value) => {
    const electron = (window as any).require?.('electron');
    if (electron?.clipboard?.writeText) {
      electron.clipboard.writeText(value);
      return;
    }
    await navigator.clipboard.writeText(value);
  }, text);
}

async function clickTaskMenuAction(
  page: Page,
  taskText: string,
  action: string,
): Promise<void> {
  const row = page
    .locator('.todoseq-task-item', { hasText: taskText })
    .first();
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click({ button: 'right' });

  const menu = page.locator('.todoseq-task-context-menu');
  await expect(menu).toBeVisible({ timeout: 5_000 });
  await menu
    .locator('.todoseq-context-menu-row', { hasText: action })
    .first()
    .click();
  await page.waitForTimeout(400);
}

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
  test.info().annotations.push({
    type: 'obsidian-version',
    description: await page.evaluate(
      () => (window as any).app?.version ?? navigator.userAgent,
    ),
  });
});

test.beforeEach(async () => {
  await resetVaultState(page);
});

async function writeDependencyFixture(
  body: string,
  missingAnchor = false,
): Promise<void> {
  await page.evaluate(
    async ({ blocker, dependent, blockerBody, dependentContent }) => {
      const app = (window as any).app;
      const write = async (path: string, content: string) => {
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) {
          await app.vault.modify(existing, content);
        } else {
          await app.vault.create(path, content);
        }
      };
      await write(blocker, blockerBody);
      await write(dependent, dependentContent);
      await app.commands.executeCommandById('todoseq:rescan-vault');
    },
    {
      blocker: BLOCKER,
      dependent: DEPENDENT,
      blockerBody: BLOCKER_BODY,
      dependentContent: body,
    },
  );
  await page.waitForTimeout(800);
}

async function openInReadingMode(filename: string): Promise<void> {
  await page.evaluate(async (name) => {
    const app = (window as any).app;
    const file = app.vault.getFiles().find((f: any) => f.basename === name);
    if (!file) throw new Error(`File not found: ${name}`);
    const leaf = app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: 'markdown',
      state: { file: file.path, mode: 'preview' },
      active: true,
    });
  }, filename);
  await page.waitForSelector(
    '.workspace-leaf.mod-active .markdown-preview-view',
    { timeout: 10_000 },
  );
  await page.waitForTimeout(500);
}

async function setCursorToTaskLine(
  page: Page,
  basename: string,
  text: string,
): Promise<void> {
  await page.evaluate(
    async ({ name, taskText }) => {
      const app = (window as any).app;
      const file = app.vault.getFiles().find((f: any) => f.basename === name);
      if (!file) throw new Error(`File not found: ${name}`);
      const leaf = app.workspace
        .getLeavesOfType('markdown')
        .find((l: any) => l.view?.file?.path === file.path);
      if (!leaf) throw new Error(`No markdown leaf for ${name}`);
      const content = leaf.view.editor.getValue() as string;
      const line = content
        .split('\n')
        .findIndex((candidate: string) => candidate.includes(taskText));
      if (line < 0) throw new Error(`Task not found: ${taskText}`);
      leaf.view.editor.setCursor({ line, ch: 0 });
    },
    { name: basename, taskText: text },
  );
}

async function completeTaskByCommand(
  page: Page,
  basename: string,
  text: string,
): Promise<void> {
  await openFileInEditor(page, basename);
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const completed = await page.evaluate(
      ({ taskText }) => {
        const app = (window as any).app;
        const path = app.workspace.activeLeaf?.view?.file?.path;
        const task = app.plugins?.plugins?.todoseq?.taskStateManager
          ?.getTasks?.()
          .find(
            (candidate: any) =>
              candidate.path === path && candidate.text.includes(taskText),
          );
        return Boolean(task?.completed);
      },
      { taskText: text },
    );
    if (completed) return;
    await setCursorToTaskLine(page, basename, text);
    await runCommandById(page, 'todoseq:toggle-task-state');
    await page.waitForTimeout(350);
  }
  throw new Error(`Task never completed: ${text}`);
}

test.describe('task dependencies', () => {
  test('reader badge and editor diagnostic track the derived graph', async () => {
    const content = [dependentBody(), '', MISSING_TASK, ''].join('\n');
    await writeDependencyFixture(content, true);
    await openInReadingMode('dependency-dependent');

    const dependentRow = page
      .locator('.workspace-leaf.mod-active li.task-list-item')
      .filter({ hasText: 'Dependent task' })
      .first();
    const badge = dependentRow.locator('.todoseq-reader-blocked-badge');
    await expect(badge).toHaveCount(1);
    await expect(badge.locator('svg')).toHaveCount(1);
    await expect(badge).toHaveAttribute(
      'aria-label',
      /Blocked by Blocker task/,
    );

    await openFileInEditor(page, 'dependency-dependent');
    const issue = page.locator(
      '.workspace-leaf.mod-active .todoseq-dependency-issue-icon',
    );
    await expect(issue).toHaveCount(1);
    await expect(issue).toHaveAttribute('aria-label', /not found/);

    // Repair the missing anchor in the blocker note, then rescan.
    await page.evaluate(async () => {
      const app = (window as any).app;
      const file = app.vault.getAbstractFileByPath('dependency-blocker.md');
      if (!file) throw new Error('Blocker file missing');
      await app.vault.modify(file, '# Dependency Blocker\n\n- [ ] TODO Blocker task ^blocker\n- [ ] TODO Anchor carrier ^missing\n');
      await app.commands.executeCommandById('todoseq:rescan-vault');
    });
    await page.waitForTimeout(1000);

    await openFileInEditor(page, 'dependency-dependent');
    await expect(issue).toHaveCount(0);
  });

  test('refused checkbox, completion and blocked search use the real control', async () => {
    await writeDependencyFixture(dependentBody());
    await runCommandById(page, 'todoseq:show-task-list');

    const dependentRow = page
      .locator('.todoseq-task-item')
      .filter({ hasText: 'Dependent task' })
      .first();
    const dependentCheckbox = dependentRow.locator(
      'input[type="checkbox"]',
    );
    await expect(dependentCheckbox).not.toBeChecked();

    await dependentCheckbox.click();
    await page.waitForTimeout(700);

    await expect(dependentCheckbox).not.toBeChecked();
    await expect(page.locator('.notice').last()).toContainText(/blocked/i);
    const dependentSource = await readVaultFile(page, 'dependency-dependent');
    expect(dependentSource).toContain('TODO Dependent task');

    await completeTaskByCommand(page, 'dependency-blocker', 'Blocker task');
    await page.waitForTimeout(700);

    await completeTaskByCommand(page, 'dependency-dependent', 'Dependent task');
    const finalSource = await readVaultFile(page, 'dependency-dependent');
    expect(finalSource).toContain('DONE Dependent task');

    // blocked:true returns the dependent only, and now that it is complete it
    // should no longer appear in the result.
    await runCommandById(page, 'todoseq:show-task-list');
    const search = page.locator('input[aria-label="Search tasks"]');
    await search.fill('blocked:true');
    await page.waitForTimeout(700);
    await expect(
      page.locator('.todoseq-task-item', { hasText: 'Dependent task' }),
    ).toHaveCount(0);
    await expect(
      page.locator('.todoseq-task-item', { hasText: 'Blocker task' }),
    ).toHaveCount(0);
  });

  test('copy ID, copy anchor and add-as-blocker use the real clipboard and menu', async () => {
    await page.evaluate(async ({ path, body }) => {
      const app = (window as any).app;
      const existing = app.vault.getAbstractFileByPath(path);
      if (existing) await app.vault.modify(existing, body);
      else await app.vault.create(path, body);
      await app.commands.executeCommandById('todoseq:rescan-vault');
    }, {
      path: `${CLIPBOARD_FILE}.md`,
      body: [
        '# Clipboard Actions',
        '',
        '- [ ] TODO Source task',
        '- [ ] TODO Dependent task',
        '- [ ] TODO Second dependent',
        '- [ ] TODO Authored task',
        '  :PROPERTIES:',
        '  :ID: authored-id',
        '  :END:',
        '',
      ].join('\n'),
    });
    await page.waitForTimeout(700);
    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);

    // Copy ID generates and persists a UUID for a task without identity.
    await clickTaskMenuAction(page, 'Source task', 'Copy ID');
    await expect.poll(() => readClipboard(page), { timeout: 5_000 }).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    const generatedId = await readClipboard(page);
    await expect
      .poll(() => readVaultFile(page, CLIPBOARD_FILE), { timeout: 5_000 })
      .toContain(`:ID: ${generatedId}`);

    // Copy ID preserves an authored identifier instead of replacing it.
    await clickTaskMenuAction(page, 'Authored task', 'Copy ID');
    await expect.poll(() => readClipboard(page), { timeout: 5_000 }).toBe(
      'authored-id',
    );
    const authoredSource = await readVaultFile(page, CLIPBOARD_FILE);
    expect(authoredSource).toContain(':ID: authored-id');

    // Copy anchor persists a file-scoped anchor and copies a wiki link.
    await clickTaskMenuAction(page, 'Source task', 'Copy anchor');
    await expect.poll(() => readClipboard(page), { timeout: 5_000 }).toMatch(
      /^\[\[[^\]]*clipboard-actions#\^todoseq-[0-9a-f]+\]\]$/,
    );
    const anchorLink = await readClipboard(page);
    const anchoredSource = await readVaultFile(page, CLIPBOARD_FILE);
    expect(anchoredSource).toContain(anchorLink.match(/\^todoseq-[0-9a-f]+/)?.[0] ?? '');

    // Reusing the anchor is idempotent: same link, no second anchor.
    await clickTaskMenuAction(page, 'Source task', 'Copy anchor');
    expect(await readClipboard(page)).toBe(anchorLink);
    const reusedSource = await readVaultFile(page, CLIPBOARD_FILE);
    expect(
      reusedSource.match(/\^todoseq-[0-9a-f]+/g)?.length ?? 0,
    ).toBe(1);

    // The anchor must be visible to the dependency snapshot before it can be
    // added as a blocker.
    await runCommandById(page, 'todoseq:rescan-vault');
    await page.waitForTimeout(800);

    await writeClipboard(page, anchorLink);
    await clickTaskMenuAction(page, 'Dependent task', 'Add copied link as blocker');
    await expect
      .poll(() => readVaultFile(page, CLIPBOARD_FILE), { timeout: 5_000 })
      .toContain(`:BLOCKER: ${anchorLink}`);

    // An existing ID can be added the same way.
    await writeClipboard(page, 'authored-id');
    await clickTaskMenuAction(
      page,
      'Second dependent',
      'Add copied link as blocker',
    );
    await expect
      .poll(() => readVaultFile(page, CLIPBOARD_FILE), { timeout: 5_000 })
      .toContain(':BLOCKER: authored-id');

    await runCommandById(page, 'todoseq:rescan-vault');
    await page.waitForTimeout(800);
    await expect(
      page
        .locator('.todoseq-task-item', { hasText: 'Dependent task' })
        .locator('.todoseq-task-blocked-icon'),
    ).toHaveCount(1);
    await expect(
      page
        .locator('.todoseq-task-item', { hasText: 'Second dependent' })
        .locator('.todoseq-task-blocked-icon'),
    ).toHaveCount(1);

    const blockedIcon = page
      .locator('.todoseq-task-item', { hasText: 'Dependent task' })
      .locator('.todoseq-task-blocked-icon');
    await expect(blockedIcon).toHaveAttribute('tabindex', '0');
    await blockedIcon.evaluate((element) => {
      (element as HTMLElement).focus();
      element.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    await expect(page.locator('.notice').last()).toContainText(
      'Blocked by an incomplete dependency',
      { timeout: 5_000 },
    );
  });
});
