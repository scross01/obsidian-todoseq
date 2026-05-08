/**
 * Base class for modal dialogs (context menu, date picker, etc.)
 * Provides common functionality for dialog management:
 * - Backdrop management for phones
 * - Positioning logic (centered on phones, cursor-based on desktop/tablet)
 * - Event listener management
 * - Show/hide lifecycle
 * - Keyboard navigation
 * - Global menu management (only one menu open at a time)
 */
import { Platform } from 'obsidian';
import { isPhoneDevice } from '../../utils/mobile-utils';

export abstract class BaseDialog {
  protected containerEl: HTMLElement | null = null;
  protected isShowing = false;
  protected focusedIndex = -1;
  protected focusableItems: HTMLElement[] = [];
  protected backdropEl: HTMLElement | null = null;

  // Bound handlers for cleanup
  protected documentClickHandler: ((e: MouseEvent) => void) | null = null;
  protected contextmenuHandler: ((e: MouseEvent) => void) | null = null;
  protected keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  protected scrollHandler: (() => void) | null = null;

  // Global menu management - only one menu can be open at a time
  private static activeDialog: BaseDialog | null = null;

  /**
   * Close any currently active dialog before opening a new one.
   * This ensures only one menu/dialog is visible at a time.
   */
  protected closeActiveDialog(): void {
    if (BaseDialog.activeDialog && BaseDialog.activeDialog !== this) {
      BaseDialog.activeDialog.hide();
    }
  }

  /**
   * Register this dialog as the active dialog.
   */
  protected registerAsActiveDialog(): void {
    BaseDialog.activeDialog = this;
  }

  /**
   * Unregister this dialog as the active dialog.
   */
  protected unregisterAsActiveDialog(): void {
    if (BaseDialog.activeDialog === this) {
      BaseDialog.activeDialog = null;
    }
  }

  /**
   * Close any currently active dialog.
   * This can be called from outside BaseDialog subclasses (e.g., from keyword menu)
   * to ensure only one menu is visible at a time.
   */
  public static closeAnyActiveDialog(): void {
    if (BaseDialog.activeDialog) {
      BaseDialog.activeDialog.hide();
    }
  }

  /**
   * Add a backdrop element to blur background on phones.
   * This improves UX by focusing attention on the dialog.
   */
  protected addBackdrop(): void {
    if (!this.containerEl) return;

    this.backdropEl = document.createElement('div');
    this.backdropEl.className = 'todoseq-backdrop';
    this.backdropEl.addEventListener('click', () => {
      this.hide();
    });

    // Insert backdrop before the dialog
    if (this.containerEl.parentNode) {
      this.containerEl.parentNode.insertBefore(
        this.backdropEl,
        this.containerEl,
      );
    }
  }

  /**
   * Remove the backdrop element.
   */
  protected removeBackdrop(): void {
    if (this.backdropEl && this.backdropEl.parentNode) {
      this.backdropEl.remove();
      this.backdropEl = null;
    }
  }

  /**
   * Hide and destroy the dialog.
   */
  abstract hide(): void;

  /**
   * Whether the dialog is currently visible.
   */
  abstract isVisible(): boolean;

  /**
   * Clean up all resources.
   */
  abstract cleanup(): void;

  /**
   * Position dialog at the given coordinates.
   * Subclasses can override this to provide custom positioning logic.
   * Default implementation centers the dialog on phones, follows cursor on desktop/tablet.
   * @param x - The x coordinate for the dialog position.
   * @param y - The y coordinate for the dialog position.
   * @param defaultWidth - The default width of the dialog in pixels.
   * @param defaultHeight - The default height of the dialog in pixels.
   */
  protected positionDialog(
    x: number,
    y: number,
    defaultWidth: number,
    defaultHeight: number,
  ): void {
    if (!this.containerEl) return;

    // Position initially off-screen to measure
    this.containerEl.style.left = '-9999px';
    this.containerEl.style.top = '-9999px';

    // Force layout to get dimensions
    const rect = this.containerEl.getBoundingClientRect();
    const dialogWidth = rect.width || defaultWidth;
    const dialogHeight = rect.height || defaultHeight;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left: number;
    let top: number;

    // On phones, center the dialog in viewport
    if (isPhoneDevice()) {
      left = (viewportWidth - dialogWidth) / 2;
      top = (viewportHeight - dialogHeight) / 2;
    } else {
      // Desktop/tablet: position at cursor with viewport bounds checking
      left = x;
      top = y;

      if (left + dialogWidth > viewportWidth) {
        left = viewportWidth - dialogWidth - 8;
      }
      if (left < 8) {
        left = 8;
      }

      if (top + dialogHeight > viewportHeight) {
        top = viewportHeight - dialogHeight - 8;
      }
      if (top < 8) {
        top = 8;
      }
    }

    this.containerEl.style.left = `${left}px`;
    this.containerEl.style.top = `${top}px`;
  }

  /**
   * Attach global event listeners.
   */
  protected attachGlobalListeners(): void {
    const suppressUntil = Platform.isMobile ? Date.now() + 500 : 0;

    this.documentClickHandler = (e: MouseEvent) => {
      if (Date.now() < suppressUntil) return;
      const target = e.target as Node;
      if (this.containerEl && !this.containerEl.contains(target)) {
        this.hide();
      }
    };

    this.contextmenuHandler = (e: MouseEvent) => {
      if (Date.now() < suppressUntil) return;
      const target = e.target as Node;
      if (this.containerEl && !this.containerEl.contains(target)) {
        this.hide();
      }
    };

    this.keydownHandler = (e: KeyboardEvent) => {
      this.handleKeyDown(e);
    };

    this.scrollHandler = () => {
      if (Date.now() < suppressUntil) return;
      this.hide();
    };

    // Use setTimeout to avoid the same click that opened the menu from closing it
    const clickHandler = this.documentClickHandler;
    const contextmenuHandler = this.contextmenuHandler;
    window.setTimeout(() => {
      if (clickHandler) {
        document.addEventListener('click', clickHandler);
      }
      if (contextmenuHandler) {
        document.addEventListener('contextmenu', contextmenuHandler);
      }
    }, 0);
    document.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  /**
   * Detach global event listeners.
   */
  protected detachGlobalListeners(): void {
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
      this.documentClickHandler = null;
    }
    if (this.contextmenuHandler) {
      document.removeEventListener('contextmenu', this.contextmenuHandler);
      this.contextmenuHandler = null;
    }
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler);
      this.scrollHandler = null;
    }
  }

  /**
   * Handle keyboard navigation.
   */
  protected handleKeyDown(e: KeyboardEvent): void {
    if (!this.isShowing) return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.hide();
        break;

      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        this.moveFocus(1);
        break;

      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        this.moveFocus(-1);
        break;

      case 'Enter':
      case ' ':
        if (
          this.focusedIndex >= 0 &&
          this.focusedIndex < this.focusableItems.length
        ) {
          e.preventDefault();
          e.stopPropagation();
          this.focusableItems[this.focusedIndex].click();
        }
        break;
    }
  }

  /**
   * Move focus in the specified direction.
   */
  protected moveFocus(direction: number): void {
    if (this.focusableItems.length === 0) return;

    // Remove current focus
    if (
      this.focusedIndex >= 0 &&
      this.focusedIndex < this.focusableItems.length
    ) {
      this.focusableItems[this.focusedIndex].removeClass('is-focused');
    }

    // Calculate new index
    this.focusedIndex += direction;
    if (this.focusedIndex < 0) {
      this.focusedIndex = this.focusableItems.length - 1;
    } else if (this.focusedIndex >= this.focusableItems.length) {
      this.focusedIndex = 0;
    }

    // Apply focus
    const item = this.focusableItems[this.focusedIndex];
    item.addClass('is-focused');
    item.focus();
  }
}
