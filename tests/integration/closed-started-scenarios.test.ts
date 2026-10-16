import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import { readVaultFile, openFileInEditor } from './helpers/editor-utils';
import { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

const BASENAME = 'Closed Started Scenarios';
const FILE = `${BASENAME}.md`;

/**
 * CLOSED/STARTED behaviour matrix in a real Obsidian instance:
 * - CLOSED tracking on/off (removal on un-completion is deliberately never
 *   gated — 39a829d; the setting gates insertion only)
 * - STARTED tracking on ('last' mode) / off
 * - tasks with and without SCHEDULED/DEADLINE dates
 * - repeating dates (rollover must never stack date lines)
 *
 * Every seeded note carries a STARTED date line and STARTED is configured
 * as an active keyword (the documented keyword-groups example): a date
 * line must never be scanned as a task boundary, or un-completion cannot
 * find CLOSED, re-completion duplicates it, and rollovers stack dates.
 */
test.describe('CLOSED/STARTED scenarios', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
  });

  async function setSettings(
    overrides: Record<string, unknown>,
  ): Promise<void> {
    await page.evaluate((ov) => {
      const app = (window as any).app;
      const plugin = app.plugins.plugins.todoseq;
      Object.assign(plugin.settings, ov);
      void plugin.saveSettings();
    }, overrides);
    await page.waitForTimeout(200);
  }

  async function seedNote(content: string): Promise<void> {
    await page.evaluate(
      ({ path, body }) => {
        const app = (window as any).app;
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing) {
          void app.vault.modify(existing, body);
        } else {
          void app.vault.create(path, body);
        }
      },
      { path: FILE, body: content },
    );
    await page.waitForTimeout(300);
    await page.evaluate(async () => {
      const app = (window as any).app;
      await app.commands.executeCommandById('todoseq:rescan-vault');
    });
    await page.waitForTimeout(600);
    await openFileInEditor(page, BASENAME);
  }

  /**
   * Mirrors the Task List panel checkbox/keyword click: the panel calls
   * TaskUpdateCoordinator.updateTaskState (task-list-view.ts).
   */
  async function setTaskState(state: string): Promise<void> {
    await page.evaluate(
      async ({ path, newState }) => {
        const app = (window as any).app;
        const plugin = app.plugins.plugins.todoseq;
        const tasks = plugin.taskStateManager
          .getTasks()
          .filter((t: any) => t.path === path);
        if (tasks.length !== 1) {
          throw new Error(
            `Expected exactly 1 task at ${path}, found ${tasks.length}`,
          );
        }
        await plugin.taskUpdateCoordinator.updateTaskState(tasks[0], newState);
      },
      { path: FILE, newState: state },
    );
    await page.waitForTimeout(400);
  }

  async function readNote(): Promise<string> {
    const content = await readVaultFile(page, BASENAME);
    expect(content).not.toBeNull();
    return content as string;
  }

  /** Poll until the file (or the live editor buffer) shows the expected
   *  state — source-mode writes and disk reloads lag past a fixed wait. */
  async function waitForNote(
    predicate: (content: string) => boolean,
    message: string,
  ): Promise<string> {
    await expect
      .poll(async () => predicate(await readNote()), {
        timeout: 10_000,
        message,
      })
      .toBe(true);
    return readNote();
  }

  function countLines(content: string, prefix: string): number {
    return content.split('\n').filter((l) => l.trim().startsWith(prefix))
      .length;
  }

  /** Wait for the 50 ms recurrence rollover to change a date line. */
  async function pollRollover(
    prefix: string,
    previousDate: string,
  ): Promise<string> {
    await expect
      .poll(
        async () => {
          const content = await readVaultFile(page, BASENAME);
          const match = content?.match(
            new RegExp(`${prefix}: <(\\d{4}-\\d{2}-\\d{2})`),
          );
          return match ? match[1] : null;
        },
        {
          timeout: 10_000,
          message: `Timed out waiting for ${prefix} to advance past ${previousDate}`,
        },
      )
      .not.toBe(previousDate);
    const content = await readNote();
    return content.match(new RegExp(`${prefix}: <(\\d{4}-\\d{2}-\\d{2})`))![1];
  }

  test('un-completion removes CLOSED and keeps STARTED; re-completion adds exactly one fresh CLOSED (CLOSED on, STARTED most-recent mode)', async () => {
    await setSettings({
      trackClosedDate: true,
      trackStartedDate: true,
      startedDateMode: 'last',
      additionalActiveKeywords: ['STARTED'],
    });
    await seedNote(
      [
        'DONE Ship the fix',
        'STARTED: [2026-10-14 Wed 09:00]',
        'CLOSED: [2026-10-14 Wed 10:00]',
        'SCHEDULED: <2026-10-20 Tue>',
      ].join('\n'),
    );

    // STARTED configured as an active keyword must not create a phantom
    // task for the STARTED date line.
    expect(await readNote()).toContain('STARTED: [2026-10-14 Wed 09:00]');

    await setTaskState('TODO');
    let content = await waitForNote(
      (c) => countLines(c, 'CLOSED:') === 0,
      'un-completion should remove the CLOSED line',
    );
    expect(countLines(content, 'STARTED:')).toBe(1);
    expect(content).toMatch(/\bTODO\b/);

    // 'last' mode: the next fresh active entry re-stamps STARTED.
    await setTaskState('DOING');
    content = await waitForNote(
      (c) =>
        countLines(c, 'STARTED:') === 1 &&
        !c.includes('STARTED: [2026-10-14 Wed 09:00]'),
      "'last' mode should re-stamp STARTED on fresh active entry",
    );

    await setTaskState('DONE');
    content = await waitForNote(
      (c) =>
        countLines(c, 'CLOSED:') === 1 &&
        !c.includes('CLOSED: [2026-10-14 Wed 10:00]'),
      're-completion should add exactly one fresh CLOSED line',
    );
    expect(countLines(content, 'STARTED:')).toBe(1);
  });

  test('CLOSED tracking off: un-completion still removes CLOSED (removal is never gated); re-completion adds none', async () => {
    await setSettings({
      trackClosedDate: false,
      trackStartedDate: true,
      startedDateMode: 'last',
      additionalActiveKeywords: ['STARTED'],
    });
    await seedNote(
      [
        'DONE Ship the fix',
        'STARTED: [2026-10-14 Wed 09:00]',
        'CLOSED: [2026-10-14 Wed 10:00]',
        'SCHEDULED: <2026-10-20 Tue>',
      ].join('\n'),
    );

    await setTaskState('TODO');
    let content = await waitForNote(
      (c) => countLines(c, 'CLOSED:') === 0,
      'un-completion should remove the CLOSED line even with tracking off',
    );
    expect(countLines(content, 'STARTED:')).toBe(1);

    await setTaskState('DONE');
    await page.waitForTimeout(1000);
    content = await readNote();
    expect(countLines(content, 'CLOSED:')).toBe(0);
    expect(countLines(content, 'STARTED:')).toBe(1);
  });

  test('STARTED tracking off: no STARTED lines are written; CLOSED is managed alone', async () => {
    await setSettings({
      trackClosedDate: true,
      trackStartedDate: false,
      additionalActiveKeywords: ['STARTED'],
    });
    await seedNote(
      ['TODO No stamp yet', 'SCHEDULED: <2026-10-20 Tue>'].join('\n'),
    );

    await setTaskState('DOING');
    let content = await waitForNote(
      (c) => /\bDOING\b/.test(c),
      'the DOING state write should land',
    );
    expect(countLines(content, 'STARTED:')).toBe(0);

    await setTaskState('DONE');
    content = await waitForNote(
      (c) => countLines(c, 'CLOSED:') === 1,
      'completion with CLOSED tracking on should add one CLOSED line',
    );
    expect(countLines(content, 'STARTED:')).toBe(0);

    await setTaskState('TODO');
    content = await waitForNote(
      (c) => countLines(c, 'CLOSED:') === 0,
      'un-completion should remove the CLOSED line',
    );
    expect(countLines(content, 'STARTED:')).toBe(0);
  });

  test('repeating SCHEDULED: three completions never stack date lines; STARTED resets per occurrence', async () => {
    await setSettings({
      trackClosedDate: true,
      trackStartedDate: true,
      startedDateMode: 'last',
      additionalActiveKeywords: ['STARTED'],
    });
    await seedNote(
      ['TODO test me with repeat', 'SCHEDULED: <2026-10-15 Thu .+1d>'].join(
        '\n',
      ),
    );

    let previous = '2026-10-15';
    for (let i = 0; i < 3; i++) {
      await setTaskState('DOING');
      await waitForNote(
        (c) => countLines(c, 'STARTED:') === 1,
        "each occurrence's fresh STARTED line should appear",
      );

      await setTaskState('DONE');
      previous = await pollRollover('SCHEDULED', previous);

      const content = await readNote();
      expect(countLines(content, 'SCHEDULED:')).toBe(1);
      expect(countLines(content, 'STARTED:')).toBe(0);
    }
  });

  test('no scheduled/deadline dates: un-completion and re-completion still swap CLOSED with STARTED present', async () => {
    await setSettings({
      trackClosedDate: true,
      trackStartedDate: true,
      startedDateMode: 'last',
      additionalActiveKeywords: ['STARTED'],
    });
    await seedNote(
      [
        'DONE no dates at all',
        'STARTED: [2026-10-14 Wed 09:00]',
        'CLOSED: [2026-10-14 Wed 10:00]',
      ].join('\n'),
    );

    await setTaskState('TODO');
    let content = await waitForNote(
      (c) => countLines(c, 'CLOSED:') === 0,
      'un-completion should remove the CLOSED line',
    );
    expect(countLines(content, 'STARTED:')).toBe(1);

    await setTaskState('DONE');
    content = await waitForNote(
      (c) => countLines(c, 'CLOSED:') === 1,
      're-completion should add one fresh CLOSED line',
    );
    expect(countLines(content, 'STARTED:')).toBe(1);
  });

  test('DEADLINE-only repeat: three completions leave exactly one DEADLINE line', async () => {
    await setSettings({
      trackClosedDate: true,
      trackStartedDate: true,
      startedDateMode: 'last',
      additionalActiveKeywords: ['STARTED'],
    });
    await seedNote(
      ['TODO deadline repeat', 'DEADLINE: <2026-10-15 Thu .+1d>'].join('\n'),
    );

    let previous = '2026-10-15';
    for (let i = 0; i < 3; i++) {
      await setTaskState('DOING');
      await setTaskState('DONE');
      previous = await pollRollover('DEADLINE', previous);
    }

    const content = await readNote();
    expect(countLines(content, 'DEADLINE:')).toBe(1);
    expect(countLines(content, 'SCHEDULED:')).toBe(0);
    expect(countLines(content, 'STARTED:')).toBe(0);
  });
});
