import { TaskEditor } from './task-editor';
import { DEFAULT_COMPLETED_STATES } from '../task';
import { TodoTrackerSettings } from '../settings/settings';
import { App } from 'obsidian';
import { StateMenuBuilder } from './state-menu-builder';

export class EditorKeywordMenu {
  private menuBuilder: StateMenuBuilder;

  constructor(
    private app: App,
    private settings: TodoTrackerSettings,
    private taskEditor: TaskEditor
  ) {
    this.menuBuilder = new StateMenuBuilder(app, settings);
  }

  /**
   * Open context menu at mouse event location for changing task keyword state
   */
  public openStateMenuAtMouseEvent(state: string, keywordElement: HTMLElement, evt: MouseEvent): void {
    evt.preventDefault();
    evt.stopPropagation();
    
    // Use the shared menu builder
    const menu = this.menuBuilder.buildStateMenu(state, async (newState: string) => {
      await this.updateTaskKeywordState(state, keywordElement, newState);
    });
 
    // Show menu at mouse position
    menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
  }

  /**
   * Update the task keyword state by directly modifying the DOM element
   */
  private async updateTaskKeywordState(state: string, keywordElement: HTMLElement, newState: string): Promise<void> {
    
    // Directly update the DOM element text to reflect the new state
    if (keywordElement && keywordElement.textContent) {
      // Replace the keyword text directly in the DOM
      const currentText = keywordElement.textContent;
      const newText = currentText.replace(state, newState);
      keywordElement.textContent = newText;
      
      // Update data attribute to reflect new state
      keywordElement.setAttribute('data-task-keyword', newState);
      
      // Find and update the checkbox state based on the new task state
      this.updateCheckboxState(keywordElement, newState);
    }
  }
  
  /**
   * Find the checkbox element in the same task line and update its state
   */
  private updateCheckboxState(keywordElement: HTMLElement, newState: string): void {
    
    // Check if the new state is a completed state
    const isCompleted = DEFAULT_COMPLETED_STATES.has(newState);
    
    // Find the checkbox element in the same task line
    // The checkbox is an input element with class task-list-item-checkbox
    const taskLine = keywordElement.closest('.HyperMD-task-line, .cm-line');
    
    if (taskLine) {
      const checkbox = taskLine.querySelector('.task-list-item-checkbox, input[type="checkbox"]');
      if (checkbox && checkbox instanceof HTMLInputElement) {
        // Update the checkbox checked property for completed states
        checkbox.checked = isCompleted;
      }
    }
  }
}
