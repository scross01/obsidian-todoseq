import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import {
  openSettings,
  navigateToPluginTab,
  closeSettings,
} from './helpers/assertions';
import { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

test.describe('Settings tab', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
  });

  test.afterEach(async () => {
    await closeSettings(page);
  });

  test('settings tab opens and displays all sections', async () => {
    await openSettings(page);
    await navigateToPluginTab(page, 'TODOseq');

    // Check for recognizable setting labels from the plugin settings.
    const allText = await page.locator('.setting-item').allTextContents();
    const text = allText.join(' ');

    // Keyword settings
    expect(text).toContain('Inactive keywords');
    expect(text).toContain('Active keywords');
    expect(text).toContain('Waiting keywords');
    expect(text).toContain('Completed keywords');

    // Detection settings
    expect(text).toContain('Include tasks inside quote and callout blocks');
    expect(text).toContain('Include tasks inside code blocks');

    // Warning period settings
    expect(text).toContain('Deadline advance notice');
    expect(text).toContain('Scheduled delay');

    // State transition settings
    expect(text).toContain('Default inactive state');
    expect(text).toContain('Default active state');
  });

  test('keyword settings can be modified via input fields', async () => {
    await openSettings(page);
    await navigateToPluginTab(page, 'TODOseq');

    const activeKeywordInput = page
      .locator('.setting-item', { hasText: 'Active keywords' })
      .locator('input')
      .first();
    await activeKeywordInput.fill('');
    await activeKeywordInput.fill('IN-PROGRESS');
    await page.waitForTimeout(700);

    const currentValue = await activeKeywordInput.inputValue();
    expect(currentValue).toBe('IN-PROGRESS');
  });
});
