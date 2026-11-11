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

describe('ArchiveDialog focus in a foreign window realm', () => {
  const realHTMLElement = globalThis.HTMLElement;

  afterEach(() => {
    globalThis.HTMLElement = realHTMLElement;
    activeDocument.body.innerHTML = '';
  });

  function useForeignRealm(): void {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const foreign = frame.contentWindow?.HTMLElement;
    if (!foreign) throw new Error('iframe realm unavailable');
    globalThis.HTMLElement = foreign;
  }

  function modal(): HTMLElement {
    const el = document.querySelector<HTMLElement>('.todoseq-archive-modal');
    if (!el) throw new Error('dialog not open');
    return el;
  }

  function focusables(): HTMLElement[] {
    return Array.from(
      modal().querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute('disabled'));
  }

  function tab(shiftKey = false): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    modal().dispatchEvent(event);
    return event;
  }

  it('allows interior Tab and only wraps at the boundaries', () => {
    useForeignRealm();
    makeDialog().open();
    const controls = focusables();
    expect(controls.length).toBeGreaterThan(2);

    controls[1].focus();
    expect(tab().defaultPrevented).toBe(false);
    expect(activeDocument.activeElement).toBe(controls[1]);

    controls[0].focus();
    expect(tab(true).defaultPrevented).toBe(true);
    expect(activeDocument.activeElement).toBe(controls[controls.length - 1]);

    controls[controls.length - 1].focus();
    expect(tab().defaultPrevented).toBe(true);
    expect(activeDocument.activeElement).toBe(controls[0]);
  });

  it('restores the opener across realms and tolerates repeat/removed targets', () => {
    useForeignRealm();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const dialog = makeDialog();
    dialog.open();
    dialog.close();
    expect(activeDocument.activeElement).toBe(opener);

    expect(() => dialog.close()).not.toThrow();

    opener.focus();
    const second = makeDialog();
    second.open();
    opener.remove();
    expect(() => second.close()).not.toThrow();
  });
});
