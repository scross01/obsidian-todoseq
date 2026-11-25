import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import { readVaultFile, openFileInEditor } from './helpers/editor-utils';
import { runCommandById } from './helpers/assertions';
import { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

test.describe('Recurrence integrity', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
  });

  /** Put the editor cursor on the first line containing text. */
  async function setCursorOnLine(text: string, atEnd = false): Promise<void> {
    const found = await page.evaluate(
      ({ needle, end }) => {
        const app = (window as any).app;
        const editor = app.workspace.activeLeaf?.view?.editor;
        if (!editor) return false;
        for (let i = 0; i < editor.lineCount(); i++) {
          const line = editor.getLine(i);
          if (line?.includes(needle)) {
            editor.setCursor({ line: i, ch: end ? line.length : 0 });
            return true;
          }
        }
        return false;
      },
      { needle: text, end: atEnd },
    );
    if (!found) throw new Error(`Editor line not found: ${text}`);
  }

  async function cycleAt(text: string, atEnd = false): Promise<void> {
    await setCursorOnLine(text, atEnd);
    await runCommandById(page, 'todoseq:cycle-task-state');
  }

  /** Complete the parser-owned task through the real coordinator. This avoids
   *  the editor command's line-only reparse, which does not carry stable
   *  identity for a same-title row. */
  async function completeTaskDirect(text: string): Promise<void> {
    const result = await page.evaluate(async (needle: string) => {
      const app = (window as any).app;
      const plugin = app.plugins.plugins.todoseq;
      const task = plugin.taskStateManager
        .getTasks()
        .find((candidate: any) => candidate.text === needle);
      if (!task) return { ok: false, reason: 'task not found' };
      const outcome = await plugin.taskUpdateCoordinator.updateTaskState(
        task,
        'DONE',
        'task-list',
      );
      return {
        ok: outcome?.status === 'applied',
        reason: outcome?.reason ?? outcome?.status,
      };
    }, text);
    expect(result.ok).toBe(true);
  }

  /** Table command handling requires true source mode, not Live Preview. */
  async function openTrueSource(filename: string): Promise<void> {
    await page.evaluate(async (name: string) => {
      const app = (window as any).app;
      const file = app.vault.getFiles().find((f: any) => f.basename === name);
      if (!file) throw new Error(`File not found: ${name}`);
      const leaf = app.workspace.getLeaf(false);
      await leaf.setViewState({
        type: 'markdown',
        state: { file: file.path, mode: 'source', source: true },
        active: true,
      });
    }, filename);
    await page.waitForSelector(
      '.workspace-leaf.mod-active .cm-editor, .workspace-leaf.mod-active .markdown-source-view',
      { timeout: 10_000 },
    );
    await page.waitForTimeout(500);
  }

  function lineAt(content: string, text: string, occurrence = 0): string {
    const matches = content.split('\n').filter((line) => line.includes(text));
    return matches[occurrence] ?? '';
  }

  function dateForId(content: string, id: string): string | null {
    const lines = content.split('\n');
    const idLine = lines.findIndex((line) => line.includes(`:ID: ${id}`));
    if (idLine < 0) return null;
    for (let i = idLine - 1; i >= 0; i--) {
      const match = lines[i].match(/SCHEDULED: <(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
      if (lines[i].trim() === '') break;
    }
    return null;
  }

  test('advances only the addressed same-title row with a distinct ID', async () => {
    await openFileInEditor(page, 'recurrence-identity');
    const before = await readVaultFile(page, 'recurrence-identity');
    expect(before).not.toBeNull();
    const targetDate = dateForId(before!, 'identity-target');
    const decoyDate = dateForId(before!, 'identity-decoy');
    expect(targetDate).not.toBeNull();
    expect(decoyDate).toBe(targetDate);

    await completeTaskDirect('Identity target');
    await expect
      .poll(
        async () =>
          lineAt(
            (await readVaultFile(page, 'recurrence-identity')) ?? '',
            'Identity target',
          ),
        { timeout: 5_000, message: 'Timed out waiting for TODO' },
      )
      .toMatch(/\bTODO\b/);

    await expect
      .poll(
        async () =>
          dateForId(
            (await readVaultFile(page, 'recurrence-identity')) ?? '',
            'identity-target',
          ),
        { timeout: 10_000, message: 'Timed out waiting for the target date' },
      )
      .not.toBe(targetDate);

    const after = (await readVaultFile(page, 'recurrence-identity')) ?? '';
    expect(dateForId(after, 'identity-decoy')).toBe(decoyDate);
    expect(after).toContain(':ID: identity-target');
    expect(after).toContain(':ID: identity-decoy');
  });

  test('preserves a warning period while advancing a table-cell recurrence', async () => {
    await openTrueSource('recurrence-table-warning');
    const before = await readVaultFile(page, 'recurrence-table-warning');
    expect(before).not.toBeNull();
    const initialDate = before!.match(/SCHEDULED: <(\d{4}-\d{2}-\d{2})/)?.[1];
    expect(initialDate).toBeDefined();

    // Drive the actual command twice (TODO -> DOING -> DONE) so the test
    // covers the editor's table-cell parsing, not only the coordinator.
    await cycleAt('Table warning task');
    await expect
      .poll(
        async () =>
          lineAt(
            (await readVaultFile(page, 'recurrence-table-warning')) ?? '',
            'Table warning task',
          ),
        { timeout: 5_000, message: 'Timed out waiting for DOING' },
      )
      .toMatch(/\bDOING\b/);

    await cycleAt('Table warning task');
    await expect
      .poll(
        async () => {
          const content =
            (await readVaultFile(page, 'recurrence-table-warning')) ?? '';
          return content.match(/SCHEDULED: <(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
        },
        { timeout: 10_000, message: 'Timed out waiting for the table date' },
      )
      .not.toBe(initialDate);

    const after = (await readVaultFile(page, 'recurrence-table-warning')) ?? '';
    expect(after).toContain('TODO Table warning task');
    expect(after).toContain('-3d');
    expect(after).toContain('| keep |');
    expect(after.match(/SCHEDULED:/g)).toHaveLength(1);
  });

  test('refuses a table date update after the verified row is replaced', async () => {
    // The date picker submits through the same coordinator entry point used
    // here with source 'editor'; the modal itself is not driven.
    const today = await page.evaluate(async () => {
      const app = (window as any).app;
      const path = 'table-date-stale.md';
      const existing = app.vault.getAbstractFileByPath(path);
      if (existing) await app.vault.delete(existing);
      const now = new Date();
      const pad = (value: number) => String(value).padStart(2, '0');
      const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      await app.vault.create(
        path,
        `| Task | Note |\n|------|------|\n| TODO Table date target<br>SCHEDULED: <${date}> | keep |\n`,
      );
      return date;
    });

    try {
      await openTrueSource('table-date-stale');
      const before = await readVaultFile(page, 'table-date-stale');
      expect(before).toBe(
        `| Task | Note |\n|------|------|\n| TODO Table date target<br>SCHEDULED: <${today}> | keep |\n`,
      );

      const outcome = await page.evaluate(async () => {
        const app = (window as any).app;
        const plugin = app.plugins.plugins.todoseq;
        const view = app.workspace.activeLeaf?.view;
        const editor = view?.editor;
        if (!editor) return { status: 'no-editor' };

        if (
          !plugin.taskStateManager
            .getTasks()
            .some((candidate: any) => candidate.text === 'Table date target')
        ) {
          await plugin.vaultScanner.scanVault();
        }
        const task = plugin.taskStateManager
          .getTasks()
          .find((candidate: any) => candidate.text === 'Table date target');
        if (!task) return { status: 'no-task' };

        // Replace the verified row at the same coordinates before submitting,
        // which is what a concurrent edit or table reflow looks like.
        const original = editor.getLine(task.line);
        editor.replaceRange(
          original.replace('TODO Table date target', 'TODO Different target'),
          { line: task.line, ch: 0 },
          { line: task.line, ch: original.length },
        );

        const result = await plugin.taskUpdateCoordinator.updateTask({
          task,
          type: 'scheduled-date',
          source: 'editor',
          newDate: new Date(2026, 5, 25),
        });
        return { status: result?.status, reason: result?.reason };
      });

      expect(outcome).toEqual({
        status: 'failed',
        reason: 'Could not verify the task row before writing.',
      });
      expect(await readVaultFile(page, 'table-date-stale')).toBe(
        before!.replace('TODO Table date target', 'TODO Different target'),
      );
    } finally {
      await page.evaluate(async () => {
        const app = (window as any).app;
        const path = 'table-date-stale.md';
        app.workspace
          .getLeavesOfType('markdown')
          .filter((leaf: any) => leaf.view?.file?.path === path)
          .forEach((leaf: any) => leaf.detach());
        const file = app.vault.getAbstractFileByPath(path);
        if (file) await app.vault.delete(file);
      });
    }
  });

  test('keeps a warning period edited before rollover', async () => {
    await openFileInEditor(page, 'recurrence-warning-edit');
    const before = await readVaultFile(page, 'recurrence-warning-edit');
    expect(before).not.toBeNull();
    const initialDate = before!.match(/SCHEDULED: <(\d{4}-\d{2}-\d{2})/)?.[1];

    const edited = await page.evaluate(async () => {
      const app = (window as any).app;
      const view = app.workspace.activeLeaf?.view;
      const editor = view?.editor;
      if (!editor) return false;
      for (let i = 0; i < editor.lineCount(); i++) {
        const line = editor.getLine(i);
        if (line.includes('SCHEDULED:')) {
          const next = line.replace('-3d', '-1d');
          editor.replaceRange(
            next,
            { line: i, ch: 0 },
            { line: i, ch: line.length },
          );
          if (typeof view.save === 'function') await view.save();
          const plugin = app.plugins.plugins.todoseq;
          const file = view.file;
          if (plugin?.vaultScanner?.processIncrementalChange && file) {
            await plugin.vaultScanner.processIncrementalChange(file);
          }
          return true;
        }
      }
      return false;
    });
    expect(edited).toBe(true);

    await expect
      .poll(
        async () =>
          (await readVaultFile(page, 'recurrence-warning-edit')) ?? '',
        { timeout: 5_000, message: 'Timed out waiting for the warning edit' },
      )
      .toContain('-1d');

    await cycleAt('Warning edit task');
    await expect
      .poll(
        async () =>
          lineAt(
            (await readVaultFile(page, 'recurrence-warning-edit')) ?? '',
            'Warning edit task',
          ),
        { timeout: 5_000, message: 'Timed out waiting for DOING' },
      )
      .toMatch(/\bDOING\b/);

    await cycleAt('Warning edit task');
    await expect
      .poll(
        async () => {
          const content =
            (await readVaultFile(page, 'recurrence-warning-edit')) ?? '';
          return content.match(/SCHEDULED: <(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
        },
        { timeout: 10_000, message: 'Timed out waiting for rollover' },
      )
      .not.toBe(initialDate);

    const after = (await readVaultFile(page, 'recurrence-warning-edit')) ?? '';
    expect(after).toContain('-1d');
    expect(after).not.toContain('-3d');
  });
});
