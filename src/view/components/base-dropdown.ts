import { Vault } from 'obsidian';

export abstract class BaseDropdown {
  protected containerEl: HTMLElement;
  protected inputEl: HTMLInputElement;
  protected vault: Vault;
  protected currentSuggestions: string[] = [];
  protected selectedIndex = -1;
  protected isShowing = false;

  protected documentClickHandler: (e: MouseEvent) => void;
  protected blurHandler: () => void;
  protected resizeHandler: () => void;
  protected scrollHandler: () => void;

  private onVisibilityChange: ((isVisible: boolean) => void) | null = null;

  constructor(inputEl: HTMLInputElement, vault: Vault) {
    this.inputEl = inputEl;
    this.vault = vault;

    this.containerEl = document.createElement('div');
    this.containerEl.addClass('todoseq-dropdown');

    document.body.appendChild(this.containerEl);

    this.updateWidth();
    this.setupBaseEventListeners();
  }

  protected setupBaseEventListeners(): void {
    this.documentClickHandler = (e: MouseEvent) => {
      const target = e.target as Node;

      if (this.containerEl.contains(target)) {
        return;
      }

      if (target === this.inputEl) {
        return;
      }

      if (this.shouldPreventHide()) {
        return;
      }

      this.hide();
    };

    this.blurHandler = () => {
      requestAnimationFrame(() => {
        if (!this.shouldPreventHide()) {
          this.hide();
        }
      });
    };

    this.resizeHandler = () => {
      this.updateWidth();
    };

    this.scrollHandler = () => {
      this.updatePosition();
    };

    document.addEventListener('click', this.documentClickHandler);
    this.inputEl.addEventListener('blur', this.blurHandler);
    window.addEventListener('resize', this.resizeHandler);
    window.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  protected shouldPreventHide(): boolean {
    return false;
  }

  protected updateWidth(): void {
    const inputRect = this.inputEl.getBoundingClientRect();
    this.containerEl.style.width = `${inputRect.width}px`;
  }

  public updatePosition(): void {
    const inputRect = this.inputEl.getBoundingClientRect();

    const leftPos = window.scrollX + inputRect.left;
    const topPos = window.scrollY + inputRect.bottom + 2;

    this.containerEl.style.left = `${leftPos}px`;
    this.containerEl.style.top = `${topPos}px`;
  }

  public show(): void {
    if (this.isShowing) return;

    this.updatePosition();
    this.containerEl.addClass('show');
    this.isShowing = true;

    if (this.onVisibilityChange) {
      this.onVisibilityChange(true);
    }

    const selectedItem = this.containerEl.querySelector('.is-selected');
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }

  public hide(): void {
    if (!this.isShowing) return;

    this.containerEl.removeClass('show');
    this.isShowing = false;
    this.selectedIndex = -1;

    if (this.onVisibilityChange) {
      this.onVisibilityChange(false);
    }
  }

  public isVisible(): boolean {
    return this.isShowing;
  }

  public setOnVisibilityChange(callback: (isVisible: boolean) => void): void {
    this.onVisibilityChange = callback;
  }

  public cleanup(): void {
    document.removeEventListener('click', this.documentClickHandler);
    this.inputEl.removeEventListener('blur', this.blurHandler);
    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('scroll', this.scrollHandler);

    if (this.containerEl && this.containerEl.parentNode) {
      this.containerEl.remove();
    }
  }

  protected updateSelection(): void {
    const items = this.containerEl.querySelectorAll('.search-suggest-item');
    items.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.addClass('is-selected');
      } else {
        item.removeClass('is-selected');
      }
    });
  }

  protected getTotalItems(): number {
    return this.currentSuggestions.length;
  }

  public handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.isShowing) return false;

    const totalItems = this.getTotalItems();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, totalItems - 1);
        this.updateSelection();
        return true;

      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        this.updateSelection();
        return true;

      case 'Enter':
        if (this.selectedIndex >= 0 && this.selectedIndex < totalItems) {
          event.preventDefault();
          this.handleSelection(this.currentSuggestions[this.selectedIndex]);
          return true;
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.hide();
        return true;

      case 'Tab':
        if (this.selectedIndex >= 0 && this.selectedIndex < totalItems) {
          event.preventDefault();
          this.handleSelection(this.currentSuggestions[this.selectedIndex]);
          return true;
        }
        break;
    }

    return false;
  }

  protected async showDropdown(searchTerm = ''): Promise<void> {
    await this.renderDropdown();
    this.show();
  }

  protected abstract renderDropdown(): Promise<void>;
  protected abstract handleSelection(value: string): void;
}
