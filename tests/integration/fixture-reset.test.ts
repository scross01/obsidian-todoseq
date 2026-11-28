/**
 * Plan 077: resetVaultState must restore the complete corpus and workspace,
 * not just the known fixture files. These tests deliberately leave a nested
 * task note, background/popout/sidebar markdown leaves, a dirty inbox buffer and a
 * baked Task List filter, then assert the common reset entry point removes all
 * of it. The two pollution orders pin the same contract in both directions.
 */
import { test, expect } from '@playwright/test';
import { Page } from 'playwright';
import { getPage } from './helpers/session';
import { resetVaultState } from './helpers/test-reset';
import { openTodoseqPanel, waitForTaskListVisible } from './helpers/assertions';
import { baselineVaultPaths } from './helpers/vault-setup';

const EXTRA_NOTE = 'nested/residue-note.md';
const EXTRA_TASKS = [`${EXTRA_NOTE}:2`, `${EXTRA_NOTE}:3`] as const;
const DIRTY_MARKER = 'DIRTY EDITOR #dirty077';

let page: Page;

test.beforeAll(async () => {
  page = await getPage();
});

interface VaultProbe {
  filePaths: string[];
  taskIdentities: string[];
  mainMarkdownPaths: string[];
  sidebarMarkdownPaths: string[];
  activePath: string | null;
  activeMode: string | null;
  floatingChildren: number;
  nestedFolderExists: boolean;
  taskListQuery: string | null;
  taskListViewMode: string | null;
  taskListSort: string | null;
  taskListMatchCase: boolean | null;
  dataJson: string | null;
  communityPlugins: string | null;
  pluginArtifacts: boolean[];
}

async function probeVault(): Promise<VaultProbe> {
  return page.evaluate(async () => {
    const app = (window as any).app;
    const workspace = app.workspace;
    const rootSplit = workspace.rootSplit;
    const plugin = app.plugins?.plugins?.todoseq;
    const tlLeaf = workspace.getLeavesOfType('todoseq-view')[0];
    const tlView = tlLeaf?.view;
    const pluginDir = '.obsidian/plugins/todoseq';
    const adapter = app.vault.adapter;

    const read = async (path: string): Promise<string | null> => {
      try {
        return await adapter.read(path);
      } catch {
        return null;
      }
    };

    return {
      filePaths: app.vault
        .getFiles()
        .map((file: { path: string }) => file.path)
        .filter((path: string) => !path.startsWith('.obsidian/'))
        .sort(),
      taskIdentities: (plugin?.taskStateManager?.getTasks?.() ?? [])
        .map(
          (task: { path: string; line: number }) => `${task.path}:${task.line}`,
        )
        .sort(),
      mainMarkdownPaths: workspace
        .getLeavesOfType('markdown')
        .filter((leaf: any) => leaf.getRoot?.() === rootSplit)
        .map((leaf: any) => leaf.view?.file?.path ?? null)
        .filter((path: string | null): path is string => path !== null),
      sidebarMarkdownPaths: workspace
        .getLeavesOfType('markdown')
        .filter((leaf: any) => leaf.getRoot?.() !== rootSplit)
        .map((leaf: any) => leaf.view?.file?.path ?? null)
        .filter((path: string | null): path is string => path !== null),
      activePath: workspace.activeLeaf?.view?.file?.path ?? null,
      activeMode: workspace.activeLeaf?.view?.getMode?.() ?? null,
      floatingChildren: workspace.floatingSplit?.children?.length ?? 0,
      nestedFolderExists: Boolean(app.vault.getAbstractFileByPath('nested')),
      taskListQuery: tlView?.getSearchQuery?.() ?? tlView?.searchQuery ?? null,
      taskListViewMode: tlView?.['getViewMode']?.() ?? null,
      taskListSort: tlView?.['getSortMethod']?.() ?? null,
      taskListMatchCase: tlView?.isCaseSensitive ?? null,
      dataJson: await read(`${pluginDir}/data.json`),
      communityPlugins: await read('.obsidian/community-plugins.json'),
      pluginArtifacts: await Promise.all(
        ['main.js', 'manifest.json', 'styles.css'].map((name) =>
          adapter.exists(`${pluginDir}/${name}`),
        ),
      ),
    };
  });
}

async function bakeTaskListFilter(): Promise<void> {
  await openTodoseqPanel(page);
  await waitForTaskListVisible(page);
  await page.evaluate(async () => {
    const app = (window as any).app;
    const leaf = app.workspace.getLeavesOfType('todoseq-view')[0];
    await leaf?.view?.applyQueryAndRefresh?.('priority:high');
  });
}

async function seedExtraNote(): Promise<void> {
  await page.evaluate(
    async ({ note, content }) => {
      const app = (window as any).app;
      const folder = note.split('/')[0];
      if (!app.vault.getAbstractFileByPath(folder)) {
        await app.vault.createFolder(folder);
      }
      await app.vault.create(note, content);
      const file = app.vault.getAbstractFileByPath(note);
      if (!file) throw new Error(`${note} was not indexed after create`);

      // A background main-area leaf, plus a floating leaf when the host
      // supports popouts. Neither is part of the baseline workspace.
      const background = app.workspace.getLeaf('tab');
      await background.setViewState({
        type: 'markdown',
        state: { file: file.path, mode: 'source' },
      });

      if (app.workspace.openPopout) {
        await app.workspace.openPopout({ type: 'empty' });
        const popout = app.workspace.getLeaf(true);
        const states = app.vault.getAbstractFileByPath('states.md');
        await popout.setViewState({
          type: 'markdown',
          state: { file: states.path, mode: 'source' },
        });
      }

      // A markdown leaf in a sidebar is still a stale editor that can
      // autosave old bytes; only non-markdown sidebar/plugin leaves survive.
      const sidebar = app.workspace.getRightLeaf(true);
      if (sidebar) {
        const states = app.vault.getAbstractFileByPath('states.md');
        await sidebar.setViewState({
          type: 'markdown',
          state: { file: states.path, mode: 'source' },
        });
      }

      await app.plugins.plugins.todoseq.vaultScanner.scanVault();
    },
    {
      note: EXTRA_NOTE,
      content: `# Residue\n\n- [ ] TODO Residue one #residue077\n- [ ] TODO Residue two #residue077\n`,
    },
  );
}

async function dirtyInbox(): Promise<void> {
  await page.evaluate(async (dirtyMarker) => {
    const app = (window as any).app;
    const file = app.vault.getAbstractFileByPath('inbox.md');
    if (!file) throw new Error('inbox.md not in vault');
    const leaf = app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: 'markdown',
      state: { file: file.path, mode: 'source' },
      active: true,
    });
    const editor = leaf.view?.editor;
    if (!editor) throw new Error('inbox.md is not an editor view');
    editor.setValue(`# Inbox\n\n- [ ] TODO ${dirtyMarker}\n`);
  }, DIRTY_MARKER);
}

async function activateInbox(): Promise<void> {
  await page.evaluate(() => {
    const app = (window as any).app;
    const leaf = app.workspace
      .getLeavesOfType('markdown')
      .find((candidate: any) => candidate.view?.file?.path === 'inbox.md');
    if (!leaf) throw new Error('inbox.md leaf not found');
    app.workspace.setActiveLeaf(leaf, { focus: true });
  });
}

async function editorContent(): Promise<string | null> {
  return page.evaluate(() => {
    const app = (window as any).app;
    const view = app.workspace.activeLeaf?.view;
    return typeof view?.editor?.getValue === 'function'
      ? view.editor.getValue()
      : null;
  });
}

async function assertBaseline(
  baseline: VaultProbe,
  clean: VaultProbe,
): Promise<void> {
  expect(clean.filePaths).toEqual(baseline.filePaths);
  expect(clean.taskIdentities).toEqual(baseline.taskIdentities);
  expect(clean.mainMarkdownPaths).toEqual(['inbox.md']);
  expect(clean.sidebarMarkdownPaths).toEqual([]);
  expect(clean.activePath).toBe('inbox.md');
  expect(clean.activeMode).toBe('source');
  expect(clean.floatingChildren).toBe(0);
  expect(clean.nestedFolderExists).toBe(false);
  expect(clean.taskListQuery).toBe('');
  expect(clean.taskListViewMode).toBe('showAll');
  expect(clean.taskListSort).toBe('default');
  expect(clean.taskListMatchCase).toBe(false);
  expect(clean.dataJson).toBe(baseline.dataJson);
  expect(clean.communityPlugins).toBe(baseline.communityPlugins);
  expect(clean.pluginArtifacts).toEqual([true, true, true]);
  expect(await editorContent()).toContain('Buy groceries');
}

for (const order of ['extra-first', 'dirty-first'] as const) {
  test(`resetVaultState removes complete pollution (${order})`, async () => {
    await resetVaultState(page);
    const baseline = await probeVault();
    expect(baseline.filePaths).toEqual(baselineVaultPaths(new Date()).sort());

    await bakeTaskListFilter();
    if (order === 'extra-first') {
      await seedExtraNote();
      await dirtyInbox();
    } else {
      await dirtyInbox();
      await seedExtraNote();
    }
    await activateInbox();

    const polluted = await probeVault();
    expect(polluted.filePaths).toContain(EXTRA_NOTE);
    expect(polluted.taskIdentities).toEqual(
      expect.arrayContaining([...EXTRA_TASKS]),
    );
    expect(polluted.mainMarkdownPaths).toEqual(
      expect.arrayContaining(['inbox.md', EXTRA_NOTE]),
    );
    expect(polluted.mainMarkdownPaths.length).toBeGreaterThan(1);
    expect(polluted.sidebarMarkdownPaths).toContain('states.md');
    expect(polluted.floatingChildren).toBeGreaterThan(0);
    expect(polluted.nestedFolderExists).toBe(true);
    expect(polluted.taskListQuery).toBe('priority:high');
    expect(await editorContent()).toContain(DIRTY_MARKER);

    await resetVaultState(page);
    const clean = await probeVault();
    await assertBaseline(baseline, clean);
  });
}
