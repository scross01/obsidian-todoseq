/**
 * @jest-environment jsdom
 */

import { BaseDropdown } from '../src/view/components/base-dropdown';
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';

jest.mock('obsidian', () => ({
  Vault: jest.fn(),
}));

beforeAll(() => {
  installObsidianDomMocks();
});

class PreventHideDropdown extends BaseDropdown {
  protected shouldPreventHide(): boolean {
    return true;
  }

  protected async renderDropdown(): Promise<void> {}
  protected handleSelection(_value: string): void {
    this.hide();
  }
}

class TestDropdown extends BaseDropdown {
  public renderDropdownCalled = false;
  public lastSelectedValue: string | null = null;
  public renderDropdownPromise: Promise<void> = Promise.resolve();

  protected async renderDropdown(): Promise<void> {
    this.renderDropdownCalled = true;
    return this.renderDropdownPromise;
  }

  protected handleSelection(value: string): void {
    this.lastSelectedValue = value;
    this.hide();
  }

  public addSuggestionItems(items: string[]): void {
    this.currentSuggestions = items;
    const container = this['containerEl'] as HTMLElement;
    container.empty();
    for (const item of items) {
      const el = container.createEl('div');
      el.className = 'search-suggest-item';
      el.textContent = item;
    }
  }

  public exposeContainer(): HTMLElement {
    return this['containerEl'];
  }
}

function createMockInput(): HTMLInputElement {
  const input = activeDocument.createElement('input');
  input.type = 'text';
  activeDocument.body.appendChild(input);
  input.getBoundingClientRect = () =>
    ({
      width: 300,
      height: 30,
      top: 100,
      left: 50,
      bottom: 130,
      right: 350,
      x: 50,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;
  return input;
}

function createMockVault() {
  return {} as import('obsidian').Vault;
}

describe('BaseDropdown', () => {
  let dropdown: TestDropdown;
  let input: HTMLInputElement;

  beforeEach(() => {
    activeDocument.body.innerHTML = '';
    input = createMockInput();
    dropdown = new TestDropdown(input, createMockVault());
  });

  afterEach(() => {
    dropdown.cleanup();
  });

  describe('constructor', () => {
    it('creates container with todoseq-dropdown class', () => {
      const container = activeDocument.querySelector('.todoseq-dropdown');
      expect(container).not.toBeNull();
    });

    it('appends container to body', () => {
      const container = activeDocument.body.querySelector('.todoseq-dropdown');
      expect(container).not.toBeNull();
    });

    it('sets width matching input', () => {
      const container = activeDocument.querySelector('.todoseq-dropdown');
      expect((container as HTMLElement).style.width).toBe('300px');
    });
  });

  describe('show / hide', () => {
    it('show adds class and sets isVisible', () => {
      dropdown.show();
      expect(dropdown.isVisible()).toBe(true);
      expect(dropdown.exposeContainer().classList.contains('show')).toBe(true);
    });

    it('show is no-op when already showing', () => {
      dropdown.show();
      const cb = jest.fn();
      dropdown.setOnVisibilityChange(cb);
      dropdown.show();
      expect(cb).not.toHaveBeenCalled();
    });

    it('show scrolls selected item into view', () => {
      dropdown.addSuggestionItems(['a', 'b']);
      dropdown['selectedIndex'] = 0;
      dropdown['updateSelection']();
      const selectedEl = dropdown
        .exposeContainer()
        .querySelector('.is-selected')! as HTMLElement & {
        scrollIntoView: jest.Mock;
      };
      const mockScroll = jest.fn();
      selectedEl.scrollIntoView = mockScroll;

      dropdown.show();
      expect(mockScroll).toHaveBeenCalledWith({ block: 'nearest' });
    });

    it('hide removes class and resets state', () => {
      dropdown.show();
      dropdown['selectedIndex'] = 2;
      dropdown.hide();
      expect(dropdown.isVisible()).toBe(false);
      expect(dropdown['selectedIndex']).toBe(-1);
      expect(dropdown.exposeContainer().classList.contains('show')).toBe(false);
    });

    it('hide is no-op when not showing', () => {
      const cb = jest.fn();
      dropdown.setOnVisibilityChange(cb);
      dropdown.hide();
      expect(cb).not.toHaveBeenCalled();
    });

    it('fires visibility callback on show and hide', () => {
      const cb = jest.fn();
      dropdown.setOnVisibilityChange(cb);
      dropdown.show();
      expect(cb).toHaveBeenCalledWith(true);
      dropdown.hide();
      expect(cb).toHaveBeenCalledWith(false);
    });
  });

  describe('updatePosition', () => {
    it('positions container below input accounting for scroll', () => {
      Object.defineProperty(window, 'scrollX', { value: 10, writable: true });
      Object.defineProperty(window, 'scrollY', { value: 20, writable: true });

      dropdown.updatePosition();

      const style = dropdown.exposeContainer().style;
      expect(style.left).toBe('60px');
      expect(style.top).toBe('150px');

      Object.defineProperty(window, 'scrollX', { value: 0, writable: true });
      Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
    });
  });

  describe('documentClickHandler', () => {
    it('hides on click outside container and input', () => {
      dropdown.show();
      expect(dropdown.isVisible()).toBe(true);

      const outside = activeDocument.createElement('div');
      activeDocument.body.appendChild(outside);
      outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(dropdown.isVisible()).toBe(false);
    });

    it('does not hide on click inside container', () => {
      dropdown.show();
      dropdown
        .exposeContainer()
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(dropdown.isVisible()).toBe(true);
    });

    it('does not hide on click on input', () => {
      dropdown.show();
      input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(dropdown.isVisible()).toBe(true);
    });

    it('does not hide when shouldPreventHide returns true', () => {
      const preventInput = createMockInput();
      const preventDropdown = new PreventHideDropdown(
        preventInput,
        createMockVault(),
      );
      preventDropdown.show();
      expect(preventDropdown.isVisible()).toBe(true);

      const outside = activeDocument.createElement('div');
      activeDocument.body.appendChild(outside);
      outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(preventDropdown.isVisible()).toBe(true);
      preventDropdown.cleanup();
      preventInput.remove();
    });
  });

  describe('blurHandler', () => {
    it('hides on input blur after animation frame', () => {
      dropdown.show();
      input.dispatchEvent(new Event('blur'));

      return new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          expect(dropdown.isVisible()).toBe(false);
          resolve();
        });
      });
    });
  });

  describe('resizeHandler', () => {
    it('updates width on window resize', () => {
      input.getBoundingClientRect = () =>
        ({
          width: 500,
          height: 30,
          top: 100,
          left: 50,
          bottom: 130,
          right: 550,
          x: 50,
          y: 100,
          toJSON: () => ({}),
        }) as DOMRect;

      window.dispatchEvent(new Event('resize'));

      expect(dropdown.exposeContainer().style.width).toBe('500px');
    });
  });

  describe('scrollHandler', () => {
    it('updates position on window scroll', () => {
      Object.defineProperty(window, 'scrollX', { value: 5, writable: true });
      Object.defineProperty(window, 'scrollY', { value: 15, writable: true });

      window.dispatchEvent(new Event('scroll'));

      expect(dropdown.exposeContainer().style.left).toBe('55px');
      expect(dropdown.exposeContainer().style.top).toBe('145px');

      Object.defineProperty(window, 'scrollX', { value: 0, writable: true });
      Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
    });
  });

  describe('handleKeyDown', () => {
    beforeEach(() => {
      dropdown.addSuggestionItems(['alpha', 'beta', 'gamma']);
      dropdown.show();
    });

    it('returns false when not showing', () => {
      dropdown.hide();
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      expect(dropdown.handleKeyDown(event)).toBe(false);
    });

    it('ArrowDown moves selection forward', () => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      expect(dropdown.handleKeyDown(event)).toBe(true);
      expect(dropdown['selectedIndex']).toBe(0);
    });

    it('ArrowDown clamps at last item', () => {
      dropdown['selectedIndex'] = 2;
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      dropdown.handleKeyDown(event);
      expect(dropdown['selectedIndex']).toBe(2);
    });

    it('ArrowUp moves selection backward', () => {
      dropdown['selectedIndex'] = 1;
      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      dropdown.handleKeyDown(event);
      expect(dropdown['selectedIndex']).toBe(0);
    });

    it('ArrowUp clamps at -1', () => {
      dropdown['selectedIndex'] = 0;
      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      dropdown.handleKeyDown(event);
      expect(dropdown['selectedIndex']).toBe(-1);
    });

    it('ArrowDown calls preventDefault', () => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      const preventSpy = jest.spyOn(event, 'preventDefault');
      dropdown.handleKeyDown(event);
      expect(preventSpy).toHaveBeenCalled();
    });

    it('Enter selects current item and returns true', () => {
      dropdown['selectedIndex'] = 1;
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      expect(dropdown.handleKeyDown(event)).toBe(true);
      expect(dropdown.lastSelectedValue).toBe('beta');
    });

    it('Enter calls preventDefault when item selected', () => {
      dropdown['selectedIndex'] = 0;
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      const preventSpy = jest.spyOn(event, 'preventDefault');
      dropdown.handleKeyDown(event);
      expect(preventSpy).toHaveBeenCalled();
    });

    it('Enter returns false when no item selected', () => {
      dropdown['selectedIndex'] = -1;
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      expect(dropdown.handleKeyDown(event)).toBe(false);
    });

    it('Tab selects current item and returns true', () => {
      dropdown['selectedIndex'] = 2;
      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      expect(dropdown.handleKeyDown(event)).toBe(true);
      expect(dropdown.lastSelectedValue).toBe('gamma');
    });

    it('Tab calls preventDefault when item selected', () => {
      dropdown['selectedIndex'] = 0;
      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      const preventSpy = jest.spyOn(event, 'preventDefault');
      dropdown.handleKeyDown(event);
      expect(preventSpy).toHaveBeenCalled();
    });

    it('Tab returns false when no item selected', () => {
      dropdown['selectedIndex'] = -1;
      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      expect(dropdown.handleKeyDown(event)).toBe(false);
    });

    it('Escape hides dropdown and returns true', () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      expect(dropdown.handleKeyDown(event)).toBe(true);
      expect(dropdown.isVisible()).toBe(false);
    });

    it('Escape calls preventDefault', () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      const preventSpy = jest.spyOn(event, 'preventDefault');
      dropdown.handleKeyDown(event);
      expect(preventSpy).toHaveBeenCalled();
    });

    it('returns false for unhandled keys', () => {
      const event = new KeyboardEvent('keydown', { key: 'a' });
      expect(dropdown.handleKeyDown(event)).toBe(false);
    });
  });

  describe('updateSelection', () => {
    it('adds is-selected to correct item and removes from others', () => {
      dropdown.addSuggestionItems(['a', 'b', 'c']);
      dropdown['selectedIndex'] = 1;
      dropdown['updateSelection']();

      const items = dropdown
        .exposeContainer()
        .querySelectorAll('.search-suggest-item');
      expect(items[0].classList.contains('is-selected')).toBe(false);
      expect(items[1].classList.contains('is-selected')).toBe(true);
      expect(items[2].classList.contains('is-selected')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('removes all event listeners and removes container from DOM', () => {
      const removeSpy = jest.spyOn(dropdown.exposeContainer(), 'remove');
      dropdown.cleanup();
      expect(removeSpy).toHaveBeenCalled();
    });

    it('does not throw if container already removed', () => {
      dropdown.exposeContainer().remove();
      expect(() => dropdown.cleanup()).not.toThrow();
    });
  });

  describe('showDropdown', () => {
    it('renders dropdown then shows', async () => {
      await dropdown['showDropdown']('test');
      expect(dropdown.renderDropdownCalled).toBe(true);
      expect(dropdown.isVisible()).toBe(true);
    });
  });
});
