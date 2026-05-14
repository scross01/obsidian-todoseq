/**
 * @jest-environment jsdom
 */

import { BaseDialog } from '../src/view/components/base-dialog';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';
import { Platform } from 'obsidian';

beforeAll(() => {
  installObsidianDomMocks();
});

jest.mock('obsidian', () => ({
  Platform: {
    isMobile: false,
  },
}));

let mockIsPhoneDevice = false;
jest.mock('../src/utils/mobile-utils', () => ({
  isPhoneDevice: () => mockIsPhoneDevice,
  TABLET_BREAKPOINT: 768,
}));

class TestDialog extends BaseDialog {
  hideCalled = false;
  cleanupCalled = false;

  static resetActiveDialog(): void {
    (BaseDialog as any).activeDialog = null;
  }

  show(x: number, y: number, width = 200, height = 150): void {
    this.containerEl = activeDocument.body.createDiv({ cls: 'test-dialog' });
    this.isShowing = true;
    this.closeActiveDialog();
    this.registerAsActiveDialog();
    this.positionDialog(x, y, width, height);
    this.attachGlobalListeners();
  }

  hide(): void {
    this.hideCalled = true;
    this.isShowing = false;
    this.detachGlobalListeners();
    this.removeBackdrop();
    this.containerEl?.remove();
    this.containerEl = null;
    this.unregisterAsActiveDialog();
  }

  isVisible(): boolean {
    return this.isShowing;
  }

  cleanup(): void {
    this.cleanupCalled = true;
    this.detachGlobalListeners();
    this.removeBackdrop();
    this.containerEl?.remove();
    this.containerEl = null;
    this.unregisterAsActiveDialog();
  }

  addFocusableItems(count: number): void {
    for (let i = 0; i < count; i++) {
      const item = activeDocument.createElement('button');
      item.textContent = `Item ${i}`;
      item.focus = jest.fn();
      item.click = jest.fn();
      this.containerEl?.appendChild(item);
      this.focusableItems.push(item);
    }
  }

  exposeAddBackdrop(): void {
    this.addBackdrop();
  }

  exposeRemoveBackdrop(): void {
    this.removeBackdrop();
  }

  exposePositionDialog(
    x: number,
    y: number,
    defaultWidth: number,
    defaultHeight: number,
  ): void {
    this.positionDialog(x, y, defaultWidth, defaultHeight);
  }

  exposeHandleKeyDown(e: KeyboardEvent): void {
    this.handleKeyDown(e);
  }

  exposeMoveFocus(direction: number): void {
    this.moveFocus(direction);
  }

  setContainerEl(el: HTMLElement | null): void {
    this.containerEl = el;
  }

  setShowing(val: boolean): void {
    this.isShowing = val;
  }
}

describe('BaseDialog', () => {
  let dialog: TestDialog;

  beforeEach(() => {
    activeDocument.body.innerHTML = '';
    TestDialog.resetActiveDialog();
    mockIsPhoneDevice = false;
    jest.useFakeTimers();
    dialog = new TestDialog();
  });

  afterEach(() => {
    dialog.cleanup();
    jest.useRealTimers();
  });

  describe('global dialog management', () => {
    it('should register as active dialog', () => {
      dialog.show(100, 100);
      expect(BaseDialog.closeAnyActiveDialog).not.toThrow();
    });

    it('should close previous active dialog when a new one opens', () => {
      const dialog1 = new TestDialog();
      const dialog2 = new TestDialog();

      dialog1.show(100, 100);
      expect(dialog1.isVisible()).toBe(true);

      dialog2.show(200, 200);
      expect(dialog1.hideCalled).toBe(true);
      expect(dialog2.isVisible()).toBe(true);

      dialog2.cleanup();
    });

    it('should not close itself when opening again', () => {
      dialog.show(100, 100);
      expect(dialog.hideCalled).toBe(false);
    });

    it('should unregister active dialog on hide', () => {
      dialog.show(100, 100);
      dialog.hide();
      expect(dialog.isVisible()).toBe(false);
    });

    it('static closeAnyActiveDialog should hide active dialog', () => {
      dialog.show(100, 100);
      expect(dialog.isVisible()).toBe(true);

      BaseDialog.closeAnyActiveDialog();
      expect(dialog.hideCalled).toBe(true);
    });

    it('static closeAnyActiveDialog should be safe when no dialog is active', () => {
      expect(() => BaseDialog.closeAnyActiveDialog()).not.toThrow();
    });

    it('should only unregister itself, not other dialogs', () => {
      const dialog1 = new TestDialog();
      const dialog2 = new TestDialog();

      dialog1.show(100, 100);
      dialog1.hide();

      dialog2.show(200, 200);
      dialog1.hide();

      expect(dialog2.isVisible()).toBe(true);

      dialog2.cleanup();
    });
  });

  describe('backdrop management', () => {
    it('should add backdrop element before dialog', () => {
      dialog.show(100, 100);
      dialog.exposeAddBackdrop();

      const backdrop = activeDocument.querySelector('.todoseq-backdrop');
      expect(backdrop).not.toBeNull();
      expect(backdrop?.nextElementSibling?.hasClass('test-dialog')).toBe(true);
    });

    it('should remove backdrop on cleanup', () => {
      dialog.show(100, 100);
      dialog.exposeAddBackdrop();
      expect(activeDocument.querySelector('.todoseq-backdrop')).not.toBeNull();

      dialog.exposeRemoveBackdrop();
      expect(activeDocument.querySelector('.todoseq-backdrop')).toBeNull();
    });

    it('should hide dialog when backdrop is clicked', () => {
      dialog.show(100, 100);
      dialog.exposeAddBackdrop();

      const backdrop = activeDocument.querySelector('.todoseq-backdrop')!;
      backdrop.dispatchEvent(new MouseEvent('click'));

      expect(dialog.hideCalled).toBe(true);
    });

    it('should not add backdrop if containerEl is null', () => {
      dialog.setContainerEl(null);
      dialog.exposeAddBackdrop();
      expect(activeDocument.querySelector('.todoseq-backdrop')).toBeNull();
    });

    it('should not insert backdrop if containerEl has no parentNode', () => {
      const orphan = activeDocument.createElement('div');
      orphan.addClass('test-dialog');
      dialog.setContainerEl(orphan);
      dialog.exposeAddBackdrop();

      expect(dialog['backdropEl']).not.toBeNull();
    });

    it('removeBackdrop should be safe when no backdrop exists', () => {
      dialog.exposeRemoveBackdrop();
      expect(activeDocument.querySelector('.todoseq-backdrop')).toBeNull();
    });
  });

  describe('positionDialog', () => {
    let originalInnerWidth: number;
    let originalInnerHeight: number;

    beforeEach(() => {
      originalInnerWidth = window.innerWidth;
      originalInnerHeight = window.innerHeight;
    });

    afterEach(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: originalInnerWidth,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: originalInnerHeight,
      });
      mockIsPhoneDevice = false;
    });

    function setViewport(width: number, height: number): void {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: width,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: height,
      });
    }

    it('should position at cursor on desktop', () => {
      mockIsPhoneDevice = false;
      setViewport(1920, 1080);
      dialog.show(100, 200);
      const el = activeDocument.querySelector('.test-dialog') as HTMLElement;
      expect(el.style.left).toBe('100px');
      expect(el.style.top).toBe('200px');
    });

    it('should center dialog on phone', () => {
      mockIsPhoneDevice = true;
      setViewport(375, 667);
      dialog.show(0, 0);
      const el = activeDocument.querySelector('.test-dialog') as HTMLElement;
      const left = parseFloat(el.style.left);
      const top = parseFloat(el.style.top);
      expect(left).toBeCloseTo((375 - 200) / 2, 0);
      expect(top).toBeCloseTo((667 - 150) / 2, 0);
    });

    it('should clamp to right edge when dialog overflows right', () => {
      mockIsPhoneDevice = false;
      setViewport(400, 600);
      dialog.show(350, 100);
      const el = activeDocument.querySelector('.test-dialog') as HTMLElement;
      const left = parseFloat(el.style.left);
      expect(left).toBeLessThanOrEqual(400 - 8);
    });

    it('should clamp to left edge when dialog would go off-screen left', () => {
      mockIsPhoneDevice = false;
      setViewport(400, 600);
      dialog.show(2, 100);
      const el = activeDocument.querySelector('.test-dialog') as HTMLElement;
      expect(parseFloat(el.style.left)).toBeGreaterThanOrEqual(8);
    });

    it('should clamp to bottom edge when dialog overflows bottom', () => {
      mockIsPhoneDevice = false;
      setViewport(600, 400);
      dialog.show(100, 350);
      const el = activeDocument.querySelector('.test-dialog') as HTMLElement;
      const top = parseFloat(el.style.top);
      expect(top).toBeLessThanOrEqual(400 - 8);
    });

    it('should clamp to top edge when dialog would go off-screen top', () => {
      mockIsPhoneDevice = false;
      setViewport(600, 400);
      dialog.show(100, 2);
      const el = activeDocument.querySelector('.test-dialog') as HTMLElement;
      expect(parseFloat(el.style.top)).toBeGreaterThanOrEqual(8);
    });

    it('should do nothing if containerEl is null', () => {
      const d = new TestDialog();
      d.setContainerEl(null);
      expect(() => d.exposePositionDialog(100, 100, 200, 150)).not.toThrow();
    });

    it('should use default dimensions when getBoundingClientRect returns 0', () => {
      mockIsPhoneDevice = false;
      setViewport(1920, 1080);
      const el = activeDocument.createElement('div');
      el.setAttr('style', 'position: absolute');
      activeDocument.body.appendChild(el);
      const d = new TestDialog();
      d.setContainerEl(el);
      d.setShowing(true);

      jest.spyOn(el, 'getBoundingClientRect').mockReturnValue({
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        toJSON: () => ({}),
      });

      d.exposePositionDialog(100, 100, 300, 200);
      expect(el.style.left).toBe('100px');
      expect(el.style.top).toBe('100px');
    });
  });

  describe('keyboard navigation', () => {
    beforeEach(() => {
      dialog.show(100, 100);
      dialog.addFocusableItems(3);
    });

    function createKeyEvent(
      key: string,
      options?: Partial<KeyboardEventInit>,
    ): KeyboardEvent {
      return new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...options,
      });
    }

    it('should hide on Escape', () => {
      const e = createKeyEvent('Escape');
      jest.spyOn(e, 'preventDefault');
      jest.spyOn(e, 'stopPropagation');
      dialog.exposeHandleKeyDown(e);
      expect(dialog.hideCalled).toBe(true);
      expect(e.preventDefault).toHaveBeenCalled();
    });

    it('should move focus down on ArrowDown', () => {
      const e = createKeyEvent('ArrowDown');
      jest.spyOn(e, 'preventDefault');
      dialog.exposeHandleKeyDown(e);
      expect(dialog['focusedIndex']).toBe(0);
    });

    it('should move focus up on ArrowUp', () => {
      dialog['focusedIndex'] = 1;
      const e = createKeyEvent('ArrowUp');
      jest.spyOn(e, 'preventDefault');
      dialog.exposeHandleKeyDown(e);
      expect(dialog['focusedIndex']).toBe(0);
    });

    it('should click focused item on Enter', () => {
      dialog['focusedIndex'] = 1;
      const e = createKeyEvent('Enter');
      jest.spyOn(e, 'preventDefault');
      dialog.exposeHandleKeyDown(e);
      expect(dialog['focusableItems'][1].click).toHaveBeenCalled();
    });

    it('should click focused item on Space', () => {
      dialog['focusedIndex'] = 0;
      const e = createKeyEvent(' ');
      jest.spyOn(e, 'preventDefault');
      dialog.exposeHandleKeyDown(e);
      expect(dialog['focusableItems'][0].click).toHaveBeenCalled();
    });

    it('should not click if no item is focused (focusedIndex = -1)', () => {
      dialog['focusedIndex'] = -1;
      const e = createKeyEvent('Enter');
      dialog.exposeHandleKeyDown(e);
      expect(dialog['focusableItems'][0].click).not.toHaveBeenCalled();
    });

    it('should not click if focusedIndex is out of bounds', () => {
      dialog['focusedIndex'] = 99;
      const e = createKeyEvent('Enter');
      dialog.exposeHandleKeyDown(e);
      for (const item of dialog['focusableItems']) {
        expect(item.click).not.toHaveBeenCalled();
      }
    });

    it('should ignore unknown keys', () => {
      const e = createKeyEvent('Tab');
      dialog.exposeHandleKeyDown(e);
      expect(dialog.hideCalled).toBe(false);
    });

    it('should do nothing when not showing', () => {
      dialog.hide();
      const e = createKeyEvent('Escape');
      dialog.exposeHandleKeyDown(e);
    });
  });

  describe('moveFocus', () => {
    beforeEach(() => {
      dialog.show(100, 100);
      dialog.addFocusableItems(3);
    });

    it('should move focus forward', () => {
      dialog.exposeMoveFocus(1);
      expect(dialog['focusedIndex']).toBe(0);
      dialog.exposeMoveFocus(1);
      expect(dialog['focusedIndex']).toBe(1);
    });

    it('should move focus backward', () => {
      dialog['focusedIndex'] = 2;
      dialog.exposeMoveFocus(-1);
      expect(dialog['focusedIndex']).toBe(1);
    });

    it('should wrap from last to first', () => {
      dialog['focusedIndex'] = 2;
      dialog.exposeMoveFocus(1);
      expect(dialog['focusedIndex']).toBe(0);
    });

    it('should wrap from first to last', () => {
      dialog.exposeMoveFocus(-1);
      expect(dialog['focusedIndex']).toBe(2);
    });

    it('should do nothing when no focusable items', () => {
      dialog['focusableItems'] = [];
      dialog.exposeMoveFocus(1);
      expect(dialog['focusedIndex']).toBe(-1);
    });

    it('should remove is-focused class from previously focused item', () => {
      dialog.exposeMoveFocus(1);
      expect(dialog['focusableItems'][0].hasClass('is-focused')).toBe(true);

      dialog.exposeMoveFocus(1);
      expect(dialog['focusableItems'][0].hasClass('is-focused')).toBe(false);
      expect(dialog['focusableItems'][1].hasClass('is-focused')).toBe(true);
    });

    it('should call focus() on newly focused item', () => {
      dialog.exposeMoveFocus(1);
      expect(dialog['focusableItems'][0].focus).toHaveBeenCalled();
    });
  });

  describe('global listeners', () => {
    it('should hide on outside click after setTimeout', () => {
      dialog.show(100, 100);
      jest.runAllTimers();

      const outsideEl = activeDocument.createElement('div');
      activeDocument.body.appendChild(outsideEl);
      outsideEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(dialog.hideCalled).toBe(true);
    });

    it('should not hide on click inside dialog', () => {
      dialog.show(100, 100);
      jest.runAllTimers();

      const innerEl = activeDocument.createElement('span');
      dialog['containerEl']!.appendChild(innerEl);
      innerEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(dialog.hideCalled).toBe(false);
    });

    it('should hide on outside contextmenu after setTimeout', () => {
      dialog.show(100, 100);
      jest.runAllTimers();

      const outsideEl = activeDocument.createElement('div');
      activeDocument.body.appendChild(outsideEl);
      outsideEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

      expect(dialog.hideCalled).toBe(true);
    });

    it('should hide on scroll', () => {
      dialog.show(100, 100);
      jest.runAllTimers();

      window.dispatchEvent(new Event('scroll'));

      expect(dialog.hideCalled).toBe(true);
    });

    it('should detach all listeners on cleanup', () => {
      dialog.show(100, 100);
      jest.runAllTimers();
      dialog.cleanup();

      const outsideEl = activeDocument.createElement('div');
      activeDocument.body.appendChild(outsideEl);
      outsideEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      window.dispatchEvent(new Event('scroll'));

      expect(dialog.hideCalled).toBe(false);
    });

    it('should handle keydown via attached listener', () => {
      dialog.show(100, 100);
      jest.runAllTimers();

      const keyEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      activeDocument.dispatchEvent(keyEvent);

      expect(dialog.hideCalled).toBe(true);
    });
  });

  describe('mobile click suppression', () => {
    it('should suppress click events briefly on mobile', () => {
      Platform.isMobile = true;

      dialog.show(100, 100);
      jest.runAllTimers();

      const outsideEl = activeDocument.createElement('div');
      activeDocument.body.appendChild(outsideEl);

      const clickSpy = jest.fn();
      dialog.hide = clickSpy;

      outsideEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(clickSpy).not.toHaveBeenCalled();

      Platform.isMobile = false;
    });

    it('should suppress contextmenu events briefly on mobile', () => {
      Platform.isMobile = true;

      dialog.show(100, 100);
      jest.runAllTimers();

      const outsideEl = activeDocument.createElement('div');
      activeDocument.body.appendChild(outsideEl);

      const hideSpy = jest.fn();
      dialog.hide = hideSpy;

      outsideEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));

      expect(hideSpy).not.toHaveBeenCalled();

      Platform.isMobile = false;
    });

    it('should suppress scroll events briefly on mobile', () => {
      Platform.isMobile = true;

      dialog.show(100, 100);
      jest.runAllTimers();

      const hideSpy = jest.fn();
      dialog.hide = hideSpy;

      window.dispatchEvent(new Event('scroll'));

      expect(hideSpy).not.toHaveBeenCalled();

      Platform.isMobile = false;
    });
  });
});
