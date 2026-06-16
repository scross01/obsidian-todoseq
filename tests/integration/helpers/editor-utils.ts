import { Page } from 'playwright';

/**
 * Shared editor utilities for integration tests.
 * These functions open files, read content, and manipulate the Obsidian editor.
 */

/**
 * Open a file in the editor (source mode).
 */
export async function openFileInEditor(
  page: Page,
  filename: string,
): Promise<void> {
  await page.evaluate(async (name) => {
    const app = (window as any).app;
    const file = app.vault.getFiles().find((f: any) => f.basename === name);
    if (!file) throw new Error(`File not found: ${name}`);
    const leaf = app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }, filename);
  await page.waitForSelector(
    '.workspace-leaf.mod-active .cm-editor, .workspace-leaf.mod-active .markdown-source-view',
    { timeout: 10_000 },
  );
  await page.waitForTimeout(500);
}

/**
 * Read the active editor's buffer content (includes unsaved changes).
 */
export async function readEditorContent(page: Page): Promise<string> {
  const content = await page.evaluate(() => {
    const app = (window as any).app;
    const view = app.workspace.activeLeaf?.view;
    if (view?.editor) return view.editor.getValue();
    return null;
  });
  if (content === null) {
    throw new Error('readEditorContent: no active editor found');
  }
  return content;
}

/**
 * Read vault file content from disk (not the editor buffer).
 * Note: `page.evaluate` auto-awaits the returned promise, so the async
 * callback inside evaluate correctly resolves to the file content.
 */
export async function readVaultFile(
  page: Page,
  basename: string,
): Promise<string | null> {
  return page.evaluate(async (name) => {
    const app = (window as any).app;
    const file = app.vault.getFiles().find((f: any) => f.basename === name);
    if (!file) return null;
    return app.vault.read(file) as Promise<string>;
  }, basename);
}
