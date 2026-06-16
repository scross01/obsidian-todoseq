import { test, expect } from '@playwright/test';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import { openFileInEditor, readEditorContent } from './helpers/editor-utils';
import { Page } from 'playwright';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

test.describe('Smart date processing', () => {
  test.beforeEach(async () => {
    await resetVaultState(page);
  });

  test('typing "tomorrow" triggers SCHEDULED date line insertion', async () => {
    await openFileInEditor(page, 'smart-date');

    // Use CM6 dispatch to type " tomorrow" at end of the task line (line 2),
    // then immediately move cursor to line 0 to trigger handleCursorLeave.
    // This properly triggers the CM6 ViewPlugin that SmartDateProcessor hooks into.
    await page.evaluate(() => {
      const app = (window as any).app;
      const view = app.workspace.activeLeaf?.view;
      if (!view?.editor) throw new Error('no editor');
      const cm: any = (view.editor as any).cm;
      if (!cm) throw new Error('no cm6 editor');

      // CM6 doc.line() is 1-indexed. The file content is:
      //   Line 1: "# Smart Date Test"
      //   Line 2: "" (empty)
      //   Line 3: "- [ ] TODO Type a task with natural date here"
      const line = cm.state.doc.line(3);
      const endPos = line.to;

      // Append " tomorrow" at end of task line.
      cm.dispatch({
        changes: { from: endPos, insert: ' tomorrow' },
        selection: { anchor: endPos + 9 },
      });

      // Move cursor to position 0 (line 1) to trigger handleCursorLeave for line 3.
      cm.dispatch({
        selection: { anchor: 0 },
      });
    });

    // Wait for smart date processor debounce + RAF processing.
    await page.waitForTimeout(2500);

    const content = await readEditorContent(page);
    // The "tomorrow" keyword should have been removed and a SCHEDULED line added.
    expect(content).toMatch(/SCHEDULED: <\d{4}-\d{2}-\d{2}/);
    // "tomorrow" should have been stripped from the task text.
    expect(content).not.toMatch(/tomorrow/);
  });

  test('typing "due Friday" triggers DEADLINE date line insertion', async () => {
    await openFileInEditor(page, 'smart-date');

    await page.evaluate(() => {
      const app = (window as any).app;
      const view = app.workspace.activeLeaf?.view;
      if (!view?.editor) throw new Error('no editor');
      const cm: any = (view.editor as any).cm;
      if (!cm) throw new Error('no cm6 editor');

      const line = cm.state.doc.line(3);
      const endPos = line.to;

      // Append " due Friday" at end of task line.
      cm.dispatch({
        changes: { from: endPos, insert: ' due Friday' },
        selection: { anchor: endPos + 11 },
      });

      // Move cursor away to trigger handleCursorLeave.
      cm.dispatch({
        selection: { anchor: 0 },
      });
    });

    await page.waitForTimeout(2500);

    const content = await readEditorContent(page);
    expect(content).toMatch(/DEADLINE: <\d{4}-\d{2}-\d{2}/);
    expect(content).not.toMatch(/due Friday/);
  });

  test('smart date does NOT fire when cursor stays on task line', async () => {
    await openFileInEditor(page, 'smart-date');

    // Type " tomorrow" but DON'T move cursor away.
    await page.evaluate(() => {
      const app = (window as any).app;
      const view = app.workspace.activeLeaf?.view;
      if (!view?.editor) throw new Error('no editor');
      const cm: any = (view.editor as any).cm;
      if (!cm) throw new Error('no cm6 editor');

      const line = cm.state.doc.line(3);
      const endPos = line.to;

      cm.dispatch({
        changes: { from: endPos, insert: ' tomorrow' },
        selection: { anchor: endPos + 9 },
      });
    });

    // Wait long enough for debounce to fire (should be skipped since cursor stayed).
    await page.waitForTimeout(3000);

    const content = await readEditorContent(page);
    // The task line should still contain "tomorrow" — no processing occurred.
    expect(content).toMatch(/tomorrow/);
    expect(content).not.toMatch(/SCHEDULED:/);
  });
});
