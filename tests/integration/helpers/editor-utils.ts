import { Page } from 'playwright';

/**
 * Open a file in the editor (source mode).
 *
 * Uses setViewState with an explicit source mode rather than leaf.openFile:
 * openFile inherits the leaf's current mode, so a leaf left in reading mode
 * by an earlier test (e.g. a dashboard opened via the mode toggle) opens the
 * file with the source view hidden and the visibility wait below times out.
 * setViewState with active:true also avoids the New-tab-leaf-active hazard
 * of openFile after detaching leaves (see dashboard-card-styles.test.ts).
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
    await leaf.setViewState({
      type: 'markdown',
      state: { file: file.path, mode: 'source' },
      active: true,
    });
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
