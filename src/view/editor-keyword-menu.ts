import { MarkdownView } from 'obsidian';
import { StateMenuBuilder } from './state-menu-builder';
import TodoTracker from '../main';

export class EditorKeywordMenu {
  private menuBuilder: StateMenuBuilder;

  constructor(private plugin: TodoTracker) {
    this.menuBuilder = new StateMenuBuilder(plugin.app, plugin.settings);
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

    // Use the shared menu builder
    const menu = this.menuBuilder.buildStateMenu(
      state,
      async (newState: string) => {
        await this.updateTaskKeywordState(state, keywordElement, newState);
      },
    );

    // Show menu at mouse position
    menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
  }

  /**
   * Update the task keyword state using UIManager and TaskManager
   */
  private async updateTaskKeywordState(
    state: string,
    keywordElement: HTMLElement,
    newState: string,
  ): Promise<void> {
    // Use UIManager's methods to get line number and update through TaskManager
    const currentLine = this.plugin.uiManager.getLineForElement(keywordElement);

    if (currentLine !== null) {
      const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (view && view.editor) {
        // Save current cursor position
        const cursorPosition = view.editor.getCursor();

        // handleUpdateTaskStateAtLine is now async, so we need to await it
        const result =
          await this.plugin.taskManager.handleUpdateTaskStateAtLine(
            false,
            currentLine - 1,
            view.editor,
            view,
            newState,
          );

        // Refresh editor decorations to show the updated task state
        if (result && this.plugin.refreshVisibleEditorDecorations) {
          this.plugin.refreshVisibleEditorDecorations();
        }

        // Restore cursor position after update
        view.editor.setCursor(cursorPosition);
      }
    }
  }
}
