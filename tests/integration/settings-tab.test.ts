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
    const settingsPage = await openSettings(page);
    await navigateToPluginTab(settingsPage, 'TODOseq');

    // Check for recognizable setting labels from the plugin settings.
    const allText = await settingsPage
      .locator('.setting-item')
      .allTextContents();
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
    const settingsPage = await openSettings(page);
    await navigateToPluginTab(settingsPage, 'TODOseq');

    const activeKeywordInput = settingsPage
      .locator('.setting-item', { hasText: 'Active keywords' })
      .locator('input')
      .first();
    await activeKeywordInput.fill('');
    await activeKeywordInput.fill('IN-PROGRESS');
    await settingsPage.waitForTimeout(700);

    const currentValue = await activeKeywordInput.inputValue();
    expect(currentValue).toBe('IN-PROGRESS');
  });

  test('toggling off code block inclusion forces language comment support off', async () => {
    const settingsPage = await openSettings(page);
    await navigateToPluginTab(settingsPage, 'TODOseq');

    // Obsidian 1.13 toggles render as a `.checkbox-container` label whose
    // `.is-enabled` class (not the raw input `checked`) reflects the value.
    const codeBlocksToggle = settingsPage
      .locator('.setting-item', { hasText: 'Include tasks inside code blocks' })
      .locator('.checkbox-container');
    const languageCommentToggle = settingsPage
      .locator('.setting-item', {
        hasText: 'Enable language comment support',
      })
      .locator('.checkbox-container');
    const languageCommentInput = settingsPage
      .locator('.setting-item', {
        hasText: 'Enable language comment support',
      })
      .locator('input');

    const isOn = (toggle: import('playwright').Locator) =>
      toggle.evaluate((el) => el.classList.contains('is-enabled'));

    // Ensure both are on first so the test is state-independent.
    if (!(await isOn(codeBlocksToggle))) {
      await codeBlocksToggle.click();
      await expect(languageCommentInput).toBeEnabled();
    }
    if (!(await isOn(languageCommentToggle))) {
      await languageCommentToggle.click();
    }
    await expect(languageCommentToggle).toHaveClass(/is-enabled/);

    await codeBlocksToggle.click();

    await expect(languageCommentToggle).not.toHaveClass(/is-enabled/);
  });

  test('toggling off smart date recognition forces remove date keywords off', async () => {
    const settingsPage = await openSettings(page);
    await navigateToPluginTab(settingsPage, 'TODOseq');

    const recognitionToggle = settingsPage
      .locator('.setting-item', {
        hasText: 'Enable smart date recognition',
      })
      .locator('.checkbox-container');
    const removeKeywordsToggle = settingsPage
      .locator('.setting-item', { hasText: 'Remove date keywords' })
      .locator('.checkbox-container');

    const isOn = (toggle: import('playwright').Locator) =>
      toggle.evaluate((el) => el.classList.contains('is-enabled'));

    // Ensure both are on first so the test is state-independent.
    if (!(await isOn(recognitionToggle))) {
      await recognitionToggle.click();
    }
    if (!(await isOn(removeKeywordsToggle))) {
      await removeKeywordsToggle.click();
    }
    await expect(removeKeywordsToggle).toHaveClass(/is-enabled/);

    await recognitionToggle.click();

    await expect(removeKeywordsToggle).not.toHaveClass(/is-enabled/);
  });

  test('number range warning clears after a valid value is set', async () => {
    const settingsPage = await openSettings(page);
    await navigateToPluginTab(settingsPage, 'TODOseq');

    const upcomingItem = settingsPage.locator('.setting-item', {
      hasText: 'Upcoming period (days)',
    });
    const input = upcomingItem.locator('input').first();
    const error = upcomingItem.locator('.setting-item-error');

    // The runtime keeps the (hidden) error element in the DOM once created, so
    // assert on visibility rather than element count.
    await expect(error).toBeHidden();

    await input.fill('-5');
    await input.press('Enter');
    await expect(error).toBeVisible();
    await expect(upcomingItem).toHaveClass(/is-invalid/);

    await input.fill('7');
    await input.press('Enter');
    await expect(error).toBeHidden();
    await expect(upcomingItem).not.toHaveClass(/is-invalid/);

    await input.fill('-5');
    await input.press('Enter');
    await expect(error).toBeVisible();
    await expect(upcomingItem).toHaveClass(/is-invalid/);
  });
});
