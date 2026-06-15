import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import {
  openTodoseqPanel,
  getTaskCount,
  waitForTaskListVisible,
} from './helpers/assertions';
import { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

test.beforeEach(async () => {
  await resetVaultState(page);
});

test('plugin loads and shows task list panel', async () => {
  await openTodoseqPanel(page);
  await waitForTaskListVisible(page);
  const taskCount = await getTaskCount(page);
  expect(taskCount).toBeGreaterThan(0);
});
