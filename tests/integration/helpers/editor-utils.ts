import { Page } from 'playwright';

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

/** Read vault file content. Prefers the live editor buffer over disk
 *  because source-mode writes lag disk until Obsidian's autosave. */
export async function readVaultFile(
  page: Page,
  basename: string,
): Promise<string | null> {
  return page.evaluate(async (name: string) => {
    const app = (window as any).app;
    const file = app.vault.getFiles().find((f: any) => f.basename === name);
    if (!file) return null;
    const leaf = app.workspace
      .getLeavesOfType('markdown')
      .find(
        (l: any) =>
          l?.view?.file?.path === file.path &&
          l?.view?.getMode?.() === 'source',
      );
    const buffer = leaf?.view?.editor?.getValue?.();
    return typeof buffer === 'string' ? buffer : await app.vault.read(file);
  }, basename);
}
