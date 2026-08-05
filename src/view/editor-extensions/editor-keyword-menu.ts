import { MarkdownView } from 'obsidian';
import { StateMenuBuilder } from '../components/state-menu-builder';
import { BaseDialog } from '../components/base-dialog';
import TodoTracker from '../../main';

export class EditorKeywordMenu {
  private menuBuilder: StateMenuBuilder;

  constructor(private plugin: TodoTracker) {
    this.refreshMenuBuilder();
  }

  /**
   * Refresh menu builder when settings change
   */
  private refreshMenuBuilder(): void {
    this.menuBuilder = new StateMenuBuilder(this.plugin);
  }

  /**
   * Open context menu at mouse event location for changing task keyword state
   */
  public openStateMenuAtMouseEvent(
    state: string,
    keywordElement: HTMLElement,
    evt: MouseEvent,
  ): void {
    evt.preventDefault();
    evt.stopPropagation();

    // Close any active dialog (task context menu, date picker, etc.)
    BaseDialog.closeAnyActiveDialog();

    // Use the shared menu builder
    const menu = this.menuBuilder.buildStateMenu(state, (newState: string) => {
      this.updateTaskKeywordState(state, keywordElement, newState);
    });

    // Show menu at mouse position
    menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
  }

  /**
   * Update the task keyword state using UIManager and EditorController
   */
  private updateTaskKeywordState(
    state: string,
    keywordElement: HTMLElement,
    newState: string,
  ): void {
    const currentLine = this.plugin.uiManager.getLineForElement(keywordElement);

    if (currentLine !== null) {
      const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (view && view.editor) {
        const cellIndex = this.getCellIndexFromKeywordElement(keywordElement);
        this.plugin.editorController.handleUpdateTaskStateAtLine(
          false,
          currentLine - 1,
          view.editor,
          view,
          newState,
          cellIndex,
        );
      }
    }
  }

  /**
   * Find the cell index of a keyword element within its table row.
   * Returns undefined if the element is not inside a table cell.
   */
  private getCellIndexFromKeywordElement(
    keywordElement: HTMLElement,
  ): number | undefined {
    const cell = keywordElement.closest('td, .table-cell-wrapper');
    if (!cell) return undefined;

    const row = cell.parentElement;
    if (!row) return undefined;

    const cells = row.querySelectorAll('td, .table-cell-wrapper');
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === cell) {
        return i;
      }
    }

    return undefined;
  }

  /**
   * Update settings - refresh menu builder with current keyword manager
   */
  public updateSettings(): void {
    this.refreshMenuBuilder();
  }
}
