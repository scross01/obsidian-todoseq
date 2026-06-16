import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import {
  readVaultFile,
  openFileInEditor,
  readEditorContent,
} from './helpers/editor-utils';
import { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

test.describe('Recurrence', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
  });

  test('completing recurring task via keyword click advances date', async () => {
    await openFileInEditor(page, 'recurrence');

    // Read initial date.
    const initialContent = await readVaultFile(page, 'recurrence');
    expect(initialContent).not.toBeNull();
    const initialMatch = initialContent!.match(
      /SCHEDULED: <(\d{4}-\d{2}-\d{2})/,
    );
    expect(initialMatch).not.toBeNull();
    const initialDateStr = initialMatch![1];

    // Click the TODO keyword.
    // handleTaskKeywordClick → handleUpdateTaskStateAtLine
    // → getNextState('TODO') = 'DOING' (from default TODO->DOING->DONE)
    const keyword = page
      .locator('.workspace-leaf.mod-active .todoseq-keyword-formatted')
      .first();
    await expect(keyword).toBeVisible({ timeout: 5000 });

    // Click 1: TODO → DOING
    await keyword.click();
    await page.waitForTimeout(800);
    const after1 = await readEditorContent(page);
    const line1 = after1
      .split('\n')
      .find((l) => l.includes('Recurring daily task'));
    expect(line1).toBeDefined();
    expect(line1).not.toMatch(/\bTODO\b/);

    // Click 2: DOING → getNextState('DOING') = 'DONE'
    // → buildProcessingContext rewrites DONE→TODO
    // → performFileWrite writes TODO
    // → handleRecurrence fires (originalNewState='DONE' + hasRepeatingDates)
    // → scheduleRecurrence(50ms) → performRecurrenceUpdate → date advances
    const keyword2 = page
      .locator('.workspace-leaf.mod-active .todoseq-keyword-formatted')
      .first();
    await expect(keyword2).toBeVisible({ timeout: 5000 });
    await keyword2.click();
    await page.waitForTimeout(800);

    const after2 = await readEditorContent(page);
    const line2 = after2
      .split('\n')
      .find((l) => l.includes('Recurring daily task'));
    expect(line2).toBeDefined();
    expect(line2).toMatch(/\bTODO\b/);

    // Poll vault for date advancement (recurrence fires after 50ms delay).
    await expect
      .poll(
        async () => {
          const content = await readVaultFile(page, 'recurrence');
          const match = content?.match(/SCHEDULED: <(\d{4}-\d{2}-\d{2})/);
          return match ? match[1] : null;
        },
        {
          timeout: 10_000,
          message: 'Timed out waiting for recurrence to advance the date',
        },
      )
      .not.toBe(initialDateStr);

    // Final assertions.
    const updatedContent = await readVaultFile(page, 'recurrence');
    expect(updatedContent).not.toBeNull();
    expect(updatedContent).toContain('Recurring daily task');
    expect(updatedContent).toMatch(/\+1d>/);
    expect(updatedContent).toMatch(/\bTODO\b/);

    const updatedMatch = updatedContent!.match(
      /SCHEDULED: <(\d{4}-\d{2}-\d{2})/,
    );
    expect(updatedMatch).not.toBeNull();
    expect(updatedMatch![1] > initialDateStr).toBe(true);
  });
});
