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

// Cycle to next state via `todoseq:cycle-task-state` for a specific task.
async function cycleTaskStateByName(
  page: Page,
  taskName: string,
): Promise<void> {
  await page.evaluate((name: string) => {
    const app = (window as any).app;
    const view = app.workspace.activeLeaf?.view;
    if (!view?.editor) return;
    const count = view.editor.lineCount();
    for (let i = 0; i < count; i++) {
      const line = view.editor.getLine(i);
      if (line && line.includes(name)) {
        view.editor.setCursor({ line: i, ch: 0 });
        return;
      }
    }
  }, taskName);
  await runCommandById(page, 'todoseq:cycle-task-state');
}

/** Cycle state for the "Daily deadline task". */
async function cycleTaskState(page: Page): Promise<void> {
  await cycleTaskStateByName(page, 'Daily deadline task');
}

/** Read the task line containing the given text from the vault file. */
async function readTaskLine(
  page: Page,
  filename: string,
  matchText: string,
): Promise<string | null> {
  const content = await readVaultFile(page, filename);
  if (!content) return null;
  return content.split('\n').find((l) => l.includes(matchText)) ?? null;
}

/** Poll the vault file until a date line (SCHEDULED/DEADLINE) changes from the given value. */
async function pollDateChanged(
  page: Page,
  filename: string,
  dateType: 'SCHEDULED' | 'DEADLINE',
  notEqualToDate: string,
  message: string,
): Promise<string> {
  const pattern = new RegExp(`${dateType}: <(\\d{4}-\\d{2}-\\d{2})`);
  await expect
    .poll(
      async () => {
        const content = await readVaultFile(page, filename);
        const match = content?.match(pattern);
        return match ? match[1] : null;
      },
      { timeout: 10_000, message },
    )
    .not.toBe(notEqualToDate);

  const content = await readVaultFile(page, filename);
  const match = content!.match(pattern);
  return match![1];
}

const FILE = 'recurrence-deadline';

test.describe('Basic state cycle with DEADLINE + repeat', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
  });

  test('cycle TODO → DOING → DONE resets state and advances DEADLINE', async () => {
    await openFileInEditor(page, FILE);

    // Read initial DEADLINE date
    const initialContent = await readVaultFile(page, FILE);
    expect(initialContent).not.toBeNull();
    const initialDateStr = initialContent!.match(
      /DEADLINE: <(\d{4}-\d{2}-\d{2})/,
    )![1];

    // Initial state: TODO
    let line = await readTaskLine(page, FILE, 'Daily deadline task');
    expect(line).toBeDefined();
    expect(line).toMatch(/\bTODO\b/);

    // ── Cycle 1: TODO → DOING (no recurrence) ──
    await cycleTaskState(page);
    await expect
      .poll(
        async () =>
          (await readTaskLine(page, FILE, 'Daily deadline task')) ?? '',
        {
          timeout: 5_000,
          message: 'Timed out waiting for task to reach DOING',
        },
      )
      .toMatch(/\bDOING\b/);

    // DEADLINE should NOT have changed
    const afterDoing = await readVaultFile(page, FILE);
    expect(afterDoing).toMatch(new RegExp(`DEADLINE: <${initialDateStr}`));

    // ── Cycle 2: DOING → DONE (triggers recurrence: resets to TODO, advances DEADLINE) ──
    await cycleTaskState(page);
    await expect
      .poll(
        async () =>
          (await readTaskLine(page, FILE, 'Daily deadline task')) ?? '',
        {
          timeout: 5_000,
          message: 'Timed out waiting for recurrence to reset state to TODO',
        },
      )
      .toMatch(/\bTODO\b/);

    const deadline1 = await pollDateChanged(
      page,
      FILE,
      'DEADLINE',
      initialDateStr,
      'Timed out waiting for recurrence to advance the DEADLINE date',
    );
    // Expected: base date + 1 day, formatted as YYYY-MM-DD in local time.
    const expected = new Date(initialDateStr.replace(/-/g, '/'));
    expected.setDate(expected.getDate() + 1);
    const expectedStr = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`;
    expect(deadline1).toBe(expectedStr);
  });
});

test.describe('DOING → DONE cycle with SCHEDULED + repeat', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
  });

  test('cycle DOING → DONE resets state to TODO and advances SCHEDULED', async () => {
    await openFileInEditor(page, 'recurrence-doing');

    // Read initial SCHEDULED date
    const initialContent = await readVaultFile(page, 'recurrence-doing');
    expect(initialContent).not.toBeNull();
    const initialDateStr = initialContent!.match(
      /SCHEDULED: <(\d{4}-\d{2}-\d{2})/,
    )![1];

    // Initial state: DOING
    let line = await readTaskLine(
      page,
      'recurrence-doing',
      'Recurring DOING task',
    );
    expect(line).toBeDefined();
    expect(line).toMatch(/\bDOING\b/);

    // ── Cycle: DOING → DONE (triggers recurrence: resets to TODO, advances SCHEDULED) ──
    // This is the bug repro: cycling from DOING on a recurring task must not
    // cause "file modified externally" or produce "TOTO" instead of "TODO".
    await cycleTaskStateByName(page, 'Recurring DOING task');

    // State must become TODO (not TOTO or any other corrupted value)
    await expect
      .poll(
        async () =>
          (await readTaskLine(
            page,
            'recurrence-doing',
            'Recurring DOING task',
          )) ?? '',
        {
          timeout: 5_000,
          message: 'Timed out waiting for recurrence to reset state to TODO',
        },
      )
      .toMatch(/\bTODO\b/);

    // Verify the state is exactly TODO (not TOTO or similar corruption)
    const finalLine = await readTaskLine(
      page,
      'recurrence-doing',
      'Recurring DOING task',
    );
    expect(finalLine).not.toMatch(/\bTOTO\b/);

    // SCHEDULED date should have advanced by 1 month
    const scheduled1 = await pollDateChanged(
      page,
      'recurrence-doing',
      'SCHEDULED',
      initialDateStr,
      'Timed out waiting for recurrence to advance the SCHEDULED date',
    );
    // Expected: base date + 1 month
    const expected = new Date(initialDateStr.replace(/-/g, '/'));
    expected.setMonth(expected.getMonth() + 1);
    const expectedStr = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`;
    expect(scheduled1).toBe(expectedStr);
  });
});
