/**
 * @jest-environment jsdom
 */
import { ArchiveDialog } from '../src/view/components/archive-dialog';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';
import { createBaseSettings } from './helpers/test-helper';

installObsidianDomMocks();

function makeDialog(): ArchiveDialog {
  const plugin = {
    settings: createBaseSettings(),
    taskStateManager: { getTasks: () => [], findTaskByPathAndLine: () => null },
    taskUpdateCoordinator: { updateTaskState: jest.fn() },
    archiveService: {
      evaluateArchiveCriteria: () => [],
      hasUndoableRun: () => false,
      getArchivedKeywords: () => [],
    },
    keywordManager: { getKeywordsForGroup: () => [] },
    vaultScanner: {},
    saveSettings: jest.fn(),
    performUndo: jest.fn(),
    app: {},
  };
  const keywordManager = { getKeywordsForGroup: () => [] };
  return new ArchiveDialog(plugin as never, keywordManager as never);
}

describe('ArchiveDialog.open re-entrancy', () => {
  afterEach(() => {
    activeDocument.body.innerHTML = '';
  });

  // The plugin constructs a fresh ArchiveDialog per command invocation, so an
  // instance-level "already open" check would never fire. Two invocations
  // stacked two backdrops and close() only removed the newest, leaving one the
  // user could not dismiss.
  it('opens a single dialog when invoked twice', () => {
    makeDialog().open();
    makeDialog().open();

    expect(
      activeDocument.querySelectorAll('.todoseq-archive-backdrop').length,
    ).toBe(1);
    expect(
      activeDocument.querySelectorAll('.todoseq-archive-modal').length,
    ).toBe(1);
  });

  it('opens a single dialog when the same instance is opened twice', () => {
    const dialog = makeDialog();
    dialog.open();
    dialog.open();

    expect(
      activeDocument.querySelectorAll('.todoseq-archive-backdrop').length,
    ).toBe(1);
  });

  it('can be reopened after closing', () => {
    const dialog = makeDialog();
    dialog.open();
    dialog.close();
    expect(
      activeDocument.querySelectorAll('.todoseq-archive-backdrop').length,
    ).toBe(0);

    makeDialog().open();
    expect(
      activeDocument.querySelectorAll('.todoseq-archive-backdrop').length,
    ).toBe(1);
  });
});
