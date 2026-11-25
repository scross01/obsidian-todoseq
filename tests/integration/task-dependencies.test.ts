import { test, expect } from '@playwright/test';
import { Page } from 'playwright';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import {
  openFileInEditor,
  readVaultDiskFile,
  readVaultFile,
} from './helpers/editor-utils';
import {
  openTodoseqPanel,
  runCommandById,
  waitForTaskListVisible,
} from './helpers/assertions';

const BLOCKER = 'dependency-blocker.md';
const DEPENDENT = 'dependency-dependent.md';
const EMBEDDED = 'dependency-embedded.md';

/** Reading-view note that embeds the blocked file, for marker order there. */
const EMBEDDED_BODY = [
  '# Dependency Embedded',
  '',
  '```todoseq',
  'search: file:"dependency-dependent"',
  '```',
  '',
].join('\n');

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
  // Scope to this fixture: the Task List is vault-wide, and an earlier test
  // leaves a DONE "Dependent task" in dependency-dependent.md. Text-only
  // selection can send the menu action to the wrong note.
  const row = page
    .locator(
      `.workspace-leaf.mod-active .todoseq-task-item[data-path="${CLIPBOARD_FILE}.md"]`,
      { hasText: taskText },
    )
    .first();
  await expect(row).toBeVisible({ timeout: 10_000 });

  // Copy ID inserts a drawer above later tasks. Wait for the row to carry the
  // post-insertion line; a stale line makes the dependency write miss.
  const source = (await readVaultDiskFile(page, CLIPBOARD_FILE)) ?? '';
  const currentLine = source
    .split('\n')
    .findIndex((line) => line.includes(taskText));
  expect(currentLine).toBeGreaterThanOrEqual(0);
  await expect
    .poll(() => row.getAttribute('data-line'), { timeout: 5_000 })
    .toBe(String(currentLine));

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
  test('blocking urgency boosts a prerequisite in lists and embeds', async () => {
    const prerequisite = 'urgency-prerequisite.md';
    const dependent = 'urgency-dependent.md';
    const embed = 'urgency-embed.md';

    await page.evaluate(
      async ({ prerequisitePath, dependentPath, embedPath }) => {
        const app = (window as any).app;
        const write = async (path: string, content: string) => {
          const existing = app.vault.getAbstractFileByPath(path);
          if (existing) await app.vault.modify(existing, content);
          else await app.vault.create(path, content);
        };
        await write(
          prerequisitePath,
          [
            '- [ ] TODO Zeta prerequisite',
            '  :PROPERTIES:',
            '  :ID: urgency-prereq',
            '  :END:',
            '',
          ].join('\n'),
        );
        await write(
          dependentPath,
          [
            '- [ ] TODO Alpha dependent',
            '  :PROPERTIES:',
            '  :BLOCKER: urgency-prereq',
            '  :END:',
            '',
          ].join('\n'),
        );
        await write(
          embedPath,
          [
            '```todoseq',
            'search: (file:"urgency-prerequisite" OR file:"urgency-dependent")',
            'sort: urgency',
            'show-urgency: true',
            'show-file: false',
            '```',
            '',
            '```todoseq',
            'search: file:"urgency-prerequisite"',
            'sort: urgency',
            'show-urgency: true',
            'show-file: false',
            '```',
            '',
            '```todoseq',
            'search: (file:"urgency-prerequisite" OR file:"urgency-dependent")',
            'sort: filepath',
            'show-urgency: true',
            'show-file: false',
            '```',
            '',
          ].join('\n'),
        );
        await app.commands.executeCommandById('todoseq:rescan-vault');
      },
      {
        prerequisitePath: prerequisite,
        dependentPath: dependent,
        embedPath: embed,
      },
    );
    await page.waitForTimeout(800);

    await openInReadingMode('urgency-embed');
    const activeLeaf = page.locator('.workspace-leaf.mod-active');
    const embeddedLists = activeLeaf.locator(
      '.todoseq-embedded-task-list:visible',
    );
    await expect(embeddedLists).toHaveCount(3);
    const urgencyRows = embeddedLists
      .nth(0)
      .locator('.todoseq-embedded-task-item');
    const filteredRows = embeddedLists
      .nth(1)
      .locator('.todoseq-embedded-task-item');
    const filepathRows = embeddedLists
      .nth(2)
      .locator('.todoseq-embedded-task-item');

    await expect(urgencyRows.first()).toContainText('Zeta prerequisite');
    await expect(
      urgencyRows
        .filter({ hasText: 'Zeta prerequisite' })
        .locator('.todoseq-embedded-task-urgency')
        .first(),
    ).toContainText('5.00');
    await expect(
      urgencyRows
        .filter({ hasText: 'Alpha dependent' })
        .locator('.todoseq-embedded-task-urgency')
        .first(),
    ).toContainText('2.00');

    // The dependent is filtered out here, so the displayed boost must come
    // from the full vault-wide graph rather than the visible rows.
    await expect(filteredRows).toHaveCount(1);
    await expect(filteredRows.first()).toContainText('Zeta prerequisite');
    await expect(
      filteredRows.first().locator('.todoseq-embedded-task-urgency').first(),
    ).toContainText('5.00');

    // A non-urgency order keeps its filepath order but still displays the
    // effective score.
    await expect(filepathRows.first()).toContainText('Alpha dependent');
    await expect(filepathRows.nth(1)).toContainText('Zeta prerequisite');
    await expect(
      filepathRows
        .filter({ hasText: 'Zeta prerequisite' })
        .locator('.todoseq-embedded-task-urgency')
        .first(),
    ).toContainText('5.00');

    await runCommandById(page, 'todoseq:show-task-list');
    await waitForTaskListVisible(page);
    await page
      .locator('select[aria-label="Sort tasks by"]')
      .selectOption('sortByUrgency');
    await expect
      .poll(async () =>
        page.locator('.todoseq-task-item').evaluateAll((rows) =>
          rows
            .map((row) => row.textContent ?? '')
            .filter(
              (text) =>
                text.includes('Zeta prerequisite') ||
                text.includes('Alpha dependent'),
            )
            .map((text) =>
              text.includes('Zeta prerequisite') ? 'prerequisite' : 'dependent',
            ),
        ),
      )
      .toEqual(['prerequisite', 'dependent']);

    const coefficientFile = await page.evaluate(async () => {
      const app = (window as any).app;
      const path = `${app.vault.configDir}/plugins/todoseq/urgency.ini`;
      const exists = await app.vault.adapter.exists(path);
      return {
        path,
        content: exists
          ? ((await app.vault.adapter.read(path)) as string)
          : null,
      };
    });
    const writeCoefficient = async (value: number | null) =>
      page.evaluate(
        async ({ path, coefficient }) => {
          const app = (window as any).app;
          const adapter = app.vault.adapter;
          if (coefficient === null) {
            if (await adapter.exists(path)) await adapter.remove(path);
          } else {
            await adapter.write(
              path,
              `urgency.blocking.coefficient = ${coefficient}\n`,
            );
          }
          const plugin = app.plugins.plugins.todoseq;
          await plugin.vaultScanner.updateSettings(plugin.settings);
        },
        { path: coefficientFile.path, coefficient: value },
      );
    const restoreCoefficientFile = async () =>
      page.evaluate(async ({ path, content }) => {
        const app = (window as any).app;
        const adapter = app.vault.adapter;
        if (content === null) {
          if (await adapter.exists(path)) await adapter.remove(path);
        } else {
          await adapter.write(path, content);
        }
        const plugin = app.plugins.plugins.todoseq;
        await plugin.vaultScanner.updateSettings(plugin.settings);
      }, coefficientFile);

    // Reloading +3 -> 0 must repaint an open embed even though no task changed.
    try {
      await writeCoefficient(0);
      await page.waitForTimeout(350);

      await expect(urgencyRows.first()).toContainText('Alpha dependent');
      await expect(filteredRows.first()).toContainText('Zeta prerequisite');
      await expect(
        filteredRows.first().locator('.todoseq-embedded-task-urgency').first(),
      ).toContainText('2.00');
      await expect(
        filepathRows
          .filter({ hasText: 'Zeta prerequisite' })
          .locator('.todoseq-embedded-task-urgency')
          .first(),
      ).toContainText('2.00');
      await expect(
        activeLeaf.locator('.todoseq-embedded-task-urgency:visible', {
          hasText: '5.00',
        }),
      ).toHaveCount(0);
    } finally {
      await restoreCoefficientFile();
      await page.waitForTimeout(350);
    }

    await expect(
      filteredRows.first().locator('.todoseq-embedded-task-urgency').first(),
    ).toContainText('5.00');

    // Removing the edge returns both tasks to their base score and the
    // dependent's earlier path wins the tie again.
    await page.evaluate(async (path) => {
      const app = (window as any).app;
      const file = app.vault.getAbstractFileByPath(path);
      if (!file) throw new Error(`Missing ${path}`);
      await app.vault.modify(file, '- [ ] TODO Alpha dependent\n');
      await app.commands.executeCommandById('todoseq:rescan-vault');
    }, dependent);
    await page.waitForTimeout(900);

    await openInReadingMode('urgency-embed');
    await expect(urgencyRows.first()).toContainText('Alpha dependent');
    await expect(urgencyRows.nth(1)).toContainText('Zeta prerequisite');
    await expect(filteredRows.first()).toContainText('Zeta prerequisite');
    await expect(
      filteredRows.first().locator('.todoseq-embedded-task-urgency').first(),
    ).toContainText('2.00');
    await expect(filepathRows.first()).toContainText('Alpha dependent');
    await expect(
      filepathRows
        .filter({ hasText: 'Zeta prerequisite' })
        .locator('.todoseq-embedded-task-urgency')
        .first(),
    ).toContainText('2.00');
    await expect(
      activeLeaf.locator('.todoseq-embedded-task-urgency:visible', {
        hasText: '5.00',
      }),
    ).toHaveCount(0);

    await runCommandById(page, 'todoseq:show-task-list');
    await waitForTaskListVisible(page);
    await expect
      .poll(async () =>
        page.locator('.todoseq-task-item').evaluateAll((rows) =>
          rows
            .map((row) => row.textContent ?? '')
            .filter(
              (text) =>
                text.includes('Zeta prerequisite') ||
                text.includes('Alpha dependent'),
            )
            .map((text) =>
              text.includes('Zeta prerequisite') ? 'prerequisite' : 'dependent',
            ),
        ),
      )
      .toEqual(['dependent', 'prerequisite']);
  });

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
    expect(
      await dependentRow.evaluate((row) => {
        const lock = row.querySelector('.todoseq-reader-blocked-badge');
        const keyword = row.querySelector('.todoseq-keyword-formatted');
        return Boolean(
          lock &&
          keyword &&
          lock.compareDocumentPosition(keyword) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
    ).toBe(true);

    // A broken reference is a diagnostic, so the reading view shows the
    // warning instead of the lock.
    const brokenRow = page
      .locator('.workspace-leaf.mod-active li.task-list-item')
      .filter({ hasText: 'Broken task' })
      .first();
    const readerIssue = brokenRow.locator('.todoseq-reader-issue-badge');
    await expect(readerIssue).toHaveCount(1);
    await expect(readerIssue).toHaveAttribute('aria-label', /not found/);
    await expect(
      brokenRow.locator('.todoseq-reader-blocked-badge'),
    ).toHaveCount(0);

    await openFileInEditor(page, 'dependency-dependent');
    const issue = page.locator(
      '.workspace-leaf.mod-active .todoseq-editor-issue-badge',
    );
    await expect(issue).toHaveCount(1);
    await expect(issue).toHaveAttribute('aria-label', /not found/);

    // The editor draws the ordinary blocked lock too, but not on the row whose
    // marker is already the diagnostic.
    const editorLock = page.locator(
      '.workspace-leaf.mod-active .todoseq-editor-blocked-badge',
    );
    await expect(editorLock).toHaveCount(1);
    await expect(editorLock).toHaveAttribute(
      'aria-label',
      /Blocked by Blocker task/,
    );
    expect(
      await page
        .locator('.workspace-leaf.mod-active .cm-line', {
          hasText: 'Dependent task',
        })
        .first()
        .evaluate((line) => {
          const lock = line.querySelector('.todoseq-editor-blocked-badge');
          const keyword = line.querySelector('.todoseq-keyword-formatted');
          return Boolean(
            lock &&
            keyword &&
            lock.compareDocumentPosition(keyword) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          );
        }),
    ).toBe(true);

    // The embedded list keeps the marker immediately after the checkbox.
    await page.evaluate(
      async ({ path, body }) => {
        const app = (window as any).app;
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) await app.vault.modify(existing, body);
        else await app.vault.create(path, body);
        await app.commands.executeCommandById('todoseq:rescan-vault');
      },
      { path: EMBEDDED, body: EMBEDDED_BODY },
    );
    await openInReadingMode('dependency-embedded');
    const embeddedRow = page
      .locator(
        '.workspace-leaf.mod-active .markdown-preview-view .todoseq-embedded-task-item',
        {
          hasText: 'Dependent task',
        },
      )
      .first();
    await expect(embeddedRow.locator('.todoseq-task-blocked-icon')).toHaveCount(
      1,
    );
    expect(
      await embeddedRow.evaluate((row) => {
        const lock = row.querySelector('.todoseq-task-blocked-icon');
        const state = row.querySelector('.todoseq-embedded-task-state');
        return Boolean(
          lock &&
          state &&
          lock.compareDocumentPosition(state) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
    ).toBe(true);

    type EmbeddedAlignment = {
      position: string;
      top: string;
      fontSize: string;
      rowWidth: number;
      rowHeight: number;
      checkboxWidth: number;
      checkboxHeight: number;
      keywordHeight: number;
      markerHeight: number;
      checkboxCenter: number;
      keywordCenter: number;
      markerCenter: number;
    };

    const embeddedAlignment = async (
      text: string,
      markerSelector: string,
    ): Promise<EmbeddedAlignment> => {
      const row = page
        .locator(
          '.workspace-leaf.mod-active .markdown-preview-view .todoseq-embedded-task-item',
          {
            hasText: text,
          },
        )
        .first();

      return row.evaluate((element, selector) => {
        const checkbox = element.querySelector<HTMLInputElement>(
          '.todoseq-embedded-task-checkbox',
        );
        const keyword = element.querySelector<HTMLElement>(
          '.todoseq-embedded-task-state',
        );
        const marker = element.querySelector<HTMLElement>(selector);
        if (!checkbox || !keyword || !marker) {
          throw new Error(`Missing alignment element for ${selector}`);
        }

        const rect = (target: Element): DOMRect =>
          target.getBoundingClientRect();
        const center = (target: Element): number => {
          const box = rect(target);
          return box.top + box.height / 2;
        };
        const style = getComputedStyle(checkbox);
        const rowRect = rect(element);
        const checkboxRect = rect(checkbox);
        const keywordRect = rect(keyword);
        const markerRect = rect(marker);

        return {
          position: style.position,
          top: style.top,
          fontSize: style.fontSize,
          rowWidth: rowRect.width,
          rowHeight: rowRect.height,
          checkboxWidth: checkboxRect.width,
          checkboxHeight: checkboxRect.height,
          keywordHeight: keywordRect.height,
          markerHeight: markerRect.height,
          checkboxCenter: center(checkbox),
          keywordCenter: center(keyword),
          markerCenter: center(marker),
        };
      }, markerSelector);
    };

    const expectEmbeddedAlignment = (alignment: EmbeddedAlignment): void => {
      const fontSize = parseFloat(alignment.fontSize);
      const top = parseFloat(alignment.top);
      expect(Number.isFinite(fontSize)).toBe(true);
      expect(fontSize).toBeGreaterThan(0);

      const expectedTop = -0.1 * fontSize;
      const tolerance = 0.5;
      const maxCenterDelta = Math.abs(expectedTop) + tolerance;

      expect(alignment.position).toBe('relative');
      expect(Number.isFinite(top)).toBe(true);
      expect(Math.abs(top - expectedTop)).toBeLessThanOrEqual(tolerance);
      expect(alignment.rowWidth).toBeGreaterThan(0);
      expect(alignment.rowHeight).toBeGreaterThan(0);
      expect(alignment.checkboxWidth).toBeGreaterThan(0);
      expect(alignment.checkboxHeight).toBeGreaterThan(0);
      expect(alignment.keywordHeight).toBeGreaterThan(0);
      expect(alignment.markerHeight).toBeGreaterThan(0);

      const keywordDelta = alignment.checkboxCenter - alignment.keywordCenter;
      const markerDelta = alignment.checkboxCenter - alignment.markerCenter;
      expect(keywordDelta).toBeLessThanOrEqual(tolerance);
      expect(markerDelta).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(keywordDelta)).toBeLessThanOrEqual(maxCenterDelta);
      expect(Math.abs(markerDelta)).toBeLessThanOrEqual(maxCenterDelta);
    };

    await expect(embeddedRow).toBeVisible();

    const warningRow = page
      .locator(
        '.workspace-leaf.mod-active .markdown-preview-view .todoseq-embedded-task-item',
        {
          hasText: 'Broken task',
        },
      )
      .first();
    await expect(warningRow).toBeVisible();
    await expect(
      warningRow.locator('.todoseq-dependency-issue-icon'),
    ).toHaveCount(1);

    const locked = await embeddedAlignment(
      'Dependent task',
      '.todoseq-task-blocked-icon',
    );
    expectEmbeddedAlignment(locked);

    const warning = await embeddedAlignment(
      'Broken task',
      '.todoseq-dependency-issue-icon',
    );
    expectEmbeddedAlignment(warning);

    // The Task List marker sits before the keyword, and the row is not dimmed.
    await runCommandById(page, 'todoseq:show-task-list');
    const listRow = page
      .locator('.todoseq-task-item', { hasText: 'Dependent task' })
      .first();
    await expect(listRow.locator('.todoseq-task-blocked-icon')).toHaveCount(1);
    expect(
      await listRow.evaluate((row) => {
        const lock = row.querySelector('.todoseq-task-blocked-icon');
        const keyword = row.querySelector('.todo-task-keyword');
        return Boolean(
          lock &&
          keyword &&
          lock.compareDocumentPosition(keyword) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
    ).toBe(true);
    expect(
      await listRow
        .locator('.todoseq-task-text-wrapper')
        .evaluate((element) => getComputedStyle(element).opacity),
    ).toBe('1');

    // Repair the missing anchor in the blocker note, then rescan.
    await page.evaluate(async () => {
      const app = (window as any).app;
      const file = app.vault.getAbstractFileByPath('dependency-blocker.md');
      if (!file) throw new Error('Blocker file missing');
      await app.vault.modify(
        file,
        '# Dependency Blocker\n\n- [ ] TODO Blocker task ^blocker\n- [ ] TODO Anchor carrier ^missing\n',
      );
      await app.commands.executeCommandById('todoseq:rescan-vault');
    });
    await page.waitForTimeout(1000);

    await openFileInEditor(page, 'dependency-dependent');
    await expect(issue).toHaveCount(0);
    await expect(editorLock).toHaveCount(2);

    await openInReadingMode('dependency-dependent');
    await expect(
      page.locator('.workspace-leaf.mod-active .todoseq-reader-issue-badge'),
    ).toHaveCount(0);
    await expect(
      page.locator('.workspace-leaf.mod-active .todoseq-reader-blocked-badge'),
    ).toHaveCount(2);
  });

  test('refused checkbox, completion and blocked search use the real control', async () => {
    await writeDependencyFixture(dependentBody());
    await runCommandById(page, 'todoseq:show-task-list');

    const dependentRow = page
      .locator('.todoseq-task-item')
      .filter({ hasText: 'Dependent task' })
      .first();
    const dependentCheckbox = dependentRow.locator('input[type="checkbox"]');
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
    await page.evaluate(
      async ({ path, body }) => {
        const app = (window as any).app;
        // A leaf left open from an earlier test can keep a stale buffer; close
        // it so readVaultFile reads the rewritten fixture rather than old text.
        for (const leaf of app.workspace.getLeavesOfType('markdown')) {
          if (leaf.view?.file?.path === path) leaf.detach();
        }
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) await app.vault.modify(existing, body);
        else await app.vault.create(path, body);
        await app.commands.executeCommandById('todoseq:rescan-vault');
      },
      {
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
          '- [ ] TODO Drawer anchor task',
          '  :PROPERTIES:',
          '  :ID: drawer-task-id',
          '  :END:',
          '',
        ].join('\n'),
      },
    );
    await page.waitForTimeout(700);
    await openTodoseqPanel(page);
    await waitForTaskListVisible(page);

    // Copy ID generates and persists a UUID for a task without identity.
    await clickTaskMenuAction(page, 'Source task', 'Copy ID');
    await expect
      .poll(() => readClipboard(page), { timeout: 5_000 })
      .toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    const generatedId = await readClipboard(page);
    await expect
      .poll(() => readVaultDiskFile(page, CLIPBOARD_FILE), { timeout: 5_000 })
      .toContain(`:ID: ${generatedId}`);

    // Copy ID preserves an authored identifier instead of replacing it.
    await clickTaskMenuAction(page, 'Authored task', 'Copy ID');
    await expect
      .poll(() => readClipboard(page), { timeout: 5_000 })
      .toBe('authored-id');
    const authoredSource = await readVaultFile(page, CLIPBOARD_FILE);
    expect(authoredSource).toContain(':ID: authored-id');

    // Copy anchor persists a file-scoped anchor and copies a wiki link.
    await clickTaskMenuAction(page, 'Source task', 'Copy anchor');
    await expect
      .poll(() => readClipboard(page), { timeout: 5_000 })
      .toMatch(/^\[\[[^\]]*clipboard-actions#\^todoseq-[0-9a-f]+\]\]$/);
    const anchorLink = await readClipboard(page);
    const anchoredSource = await readVaultFile(page, CLIPBOARD_FILE);
    expect(anchoredSource).toContain(
      anchorLink.match(/\^todoseq-[0-9a-f]+/)?.[0] ?? '',
    );

    // Reusing the anchor is idempotent: same link, no second anchor.
    await clickTaskMenuAction(page, 'Source task', 'Copy anchor');
    expect(await readClipboard(page)).toBe(anchorLink);
    const reusedSource = await readVaultFile(page, CLIPBOARD_FILE);
    expect(reusedSource.match(/\^todoseq-[0-9a-f]+/g)?.length ?? 0).toBe(1);

    // The anchor must be visible to the dependency snapshot before it can be
    // added as a blocker.
    await runCommandById(page, 'todoseq:rescan-vault');
    await expect
      .poll(
        () =>
          page.evaluate(
            (anchor) => {
              const plugin = (window as any).app?.plugins?.plugins?.todoseq;
              return Boolean(
                plugin?.taskStateManager
                  ?.getTasks?.()
                  .some((task: any) => task.embedReference === anchor),
              );
            },
            anchorLink.match(/\^[A-Za-z0-9][\w-]*/)?.[0],
          ),
        { timeout: 5_000 },
      )
      .toBe(true);

    await writeClipboard(page, anchorLink);
    // The menu reads navigator.clipboard, not Electron's clipboard object.
    // Verify the exact path it will use.
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()), {
        timeout: 5_000,
      })
      .toBe(anchorLink);
    await page.waitForTimeout(300);
    await clickTaskMenuAction(
      page,
      'Dependent task',
      'Add copied link as blocker',
    );
    // Surface the menu's refusal notice when the write does not land; a bare
    // source assertion hides whether resolution, validation or the write failed.
    await expect
      .poll(
        async () => {
          const source = (await readVaultDiskFile(page, CLIPBOARD_FILE)) ?? '';
          if (source.includes(`:BLOCKER: ${anchorLink}`)) return 'applied';
          return (
            (await page.locator('.notice').last().textContent()) ?? 'no notice'
          );
        },
        { timeout: 5_000 },
      )
      .toBe('applied');

    // The inserted drawer shifts every later task line; reconcile before
    // acting on the next row so its menu target is not stale.
    await runCommandById(page, 'todoseq:rescan-vault');
    await page.waitForTimeout(500);

    // An existing ID can be added the same way.
    await writeClipboard(page, 'authored-id');
    await clickTaskMenuAction(
      page,
      'Second dependent',
      'Add copied link as blocker',
    );
    await expect
      .poll(() => readVaultDiskFile(page, CLIPBOARD_FILE), { timeout: 5_000 })
      .toContain(':BLOCKER: authored-id');

    await runCommandById(page, 'todoseq:rescan-vault');
    await page.waitForTimeout(800);
    await expect(
      page
        .locator('.workspace-leaf.mod-active .todoseq-task-item', {
          hasText: 'Dependent task',
        })
        .locator('.todoseq-task-blocked-icon'),
    ).toHaveCount(1);
    await expect(
      page
        .locator('.workspace-leaf.mod-active .todoseq-task-item', {
          hasText: 'Second dependent',
        })
        .locator('.todoseq-task-blocked-icon'),
    ).toHaveCount(1);

    const blockedIcon = page
      .locator('.workspace-leaf.mod-active .todoseq-task-item', {
        hasText: 'Dependent task',
      })
      .locator('.todoseq-task-blocked-icon');
    await expect(blockedIcon).toHaveAttribute('tabindex', '0');
    await blockedIcon.evaluate((element) => {
      (element as HTMLElement).focus();
      element.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    await expect(page.locator('.notice').last()).toContainText(
      /Blocked by Source task/,
      { timeout: 5_000 },
    );

    // Copy anchor on a task with a properties drawer writes after :END:.
    await clickTaskMenuAction(page, 'Drawer anchor task', 'Copy anchor');
    await expect
      .poll(() => readClipboard(page), { timeout: 5_000 })
      .toMatch(/^\[\[[^\]]*clipboard-actions#\^todoseq-[0-9a-f]+\]\]$/);
    const drawerAnchorLink = await readClipboard(page);
    const drawerAnchor =
      drawerAnchorLink.match(/\^todoseq-[0-9a-f]+/)?.[0] ?? '';
    await expect
      .poll(
        async () =>
          (await readVaultDiskFile(page, CLIPBOARD_FILE))?.includes(
            `:END: ${drawerAnchor}`,
          ),
        { timeout: 5_000 },
      )
      .toBe(true);

    // Obsidian's own block cache must resolve the generated placement.
    await expect
      .poll(
        () =>
          page.evaluate(
            ({ name, anchor }) => {
              const app = (window as any).app;
              const file = app.vault
                .getFiles()
                .find((candidate: any) => candidate.basename === name);
              const cache = file ? app.metadataCache.getFileCache(file) : null;
              return Boolean(cache?.blocks?.[anchor.slice(1)]);
            },
            { name: CLIPBOARD_FILE, anchor: drawerAnchor },
          ),
        { timeout: 10_000 },
      )
      .toBe(true);

    // Scanning reads that same block-end anchor for dependency resolution.
    await runCommandById(page, 'todoseq:rescan-vault');
    await expect
      .poll(
        () =>
          page.evaluate((anchor) => {
            const plugin = (window as any).app?.plugins?.plugins?.todoseq;
            return Boolean(
              plugin?.taskStateManager
                ?.getTasks?.()
                .some((task: any) => task.embedReference === anchor),
            );
          }, drawerAnchor),
        { timeout: 5_000 },
      )
      .toBe(true);

    // Repeating Copy anchor is idempotent on a drawer block.
    await clickTaskMenuAction(page, 'Drawer anchor task', 'Copy anchor');
    expect(await readClipboard(page)).toBe(drawerAnchorLink);
    const drawerSource = (await readVaultDiskFile(page, CLIPBOARD_FILE)) ?? '';
    expect(drawerSource.split(drawerAnchor).length - 1).toBe(1);
  });

  test('property edits update the issue count without a diagnostic notice', async () => {
    await writeDependencyFixture(dependentBody());
    await openFileInEditor(page, 'dependency-dependent');

    const noticesBefore = await page.locator('.notice').allTextContents();

    await page.evaluate(async () => {
      const app = (window as any).app;
      const editor = app.workspace.activeLeaf?.view?.editor;
      if (!editor) throw new Error('No active editor');
      const lines = (editor.getValue() as string).split('\n');
      const line = lines.findIndex((candidate: string) =>
        candidate.includes(':BLOCKER:'),
      );
      if (line < 0) throw new Error('BLOCKER line not found');

      for (const value of [
        '[[dependency-blocker#^missing',
        '[[dependency-blocker#^missing]',
        '[[dependency-blocker#^missing]]',
      ]) {
        editor.setLine(line, `  :BLOCKER: ${value}`);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    });

    await page.waitForTimeout(800);
    const noticesAfter = await page.locator('.notice').allTextContents();
    const newNotices = noticesAfter.filter(
      (text) => !noticesBefore.includes(text),
    );
    expect(newNotices.join('\n')).not.toMatch(
      /Dependency problem|Property problem|not found/i,
    );

    await openTodoseqPanel(page);
    const indicator = page.locator(
      '.workspace-leaf.mod-active .todoseq-issues-indicator',
    );
    await expect(indicator).toBeVisible({ timeout: 10_000 });
    await expect(indicator).toContainText('Issues');
    await expect(indicator.locator('.todoseq-issues-count')).toHaveText('1');

    await indicator.click();
    const panel = page.locator(
      '.workspace-leaf.mod-active .todoseq-issues-panel',
    );
    await expect(panel).toBeVisible();
    await expect(panel.locator('.todoseq-issue-row')).toHaveCount(1);
    await expect(panel.locator('.todoseq-issue-row').first()).toContainText(
      'Dependency problem',
    );

    await panel.locator('.todoseq-issues-close').click();
    await expect(panel).toBeHidden();
  });
});
