import { Task, DEFAULT_COMPLETED_STATES } from '../types/task';
import TodoTracker from '../main';
import { TaskStateManager } from './task-state-manager';
import { TFile } from 'obsidian';

/**
 * TaskUpdateCoordinator provides a centralized way to handle all task state updates
 * from any view (editor, reader, task list, embedded lists).
 *
 * It ensures consistent optimistic UI updates and embed reference refreshing
 * across all open views.
 */
export class TaskUpdateCoordinator {
  constructor(
    private plugin: TodoTracker,
    private taskStateManager: TaskStateManager,
  ) {}

  /**
   * Update a task's state from any view.
   * This is the single entry point for all task state updates.
   *
   * @param task - The task to update
   * @param newState - The new state to set
   * @param source - The source of the update (for debugging/tracking)
   * @returns Promise resolving to the updated task
   */
  async updateTaskState(
    task: Task,
    newState: string,
    source: 'editor' | 'reader' | 'task-list' | 'embedded' = 'editor',
  ): Promise<Task> {
    // 1. Optimistic UI update - update in-memory state immediately
    this.performOptimisticUpdate(task, newState);

    // 2. Update source file via TaskEditor
    let updatedTask: Task;
    const taskEditor = this.plugin.taskEditor;
    if (!taskEditor) {
      throw new Error('TaskEditor is not initialized');
    }
    try {
      updatedTask = await taskEditor.applyLineUpdate(task, newState);
    } catch (error) {
      console.error(
        `[TODOseq] File write failed for task at line ${task.line}:`,
        error,
      );
      // Rollback: re-read the file to restore state
      const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
      if (file instanceof TFile) {
        await this.plugin.vaultScanner?.processIncrementalChange(file);
      }
      throw error;
    }

    // 3. Perform direct DOM manipulation for embeds immediately
    // This updates the embed display without triggering a full re-render
    // which would cause flicker. The DOM update is synchronous and only
    // touches the specific elements that need to change.
    this.performDirectEmbedDOMUpdate(task, newState);

    // 4. Refresh all embedded task lists (code blocks) to reflect the task change
    // This ensures that any todoseq code blocks displaying this task are updated
    if (this.plugin.embeddedTaskListProcessor) {
      this.plugin.embeddedTaskListProcessor.refreshAllEmbeddedTaskLists();
    }

    // 5. Refresh editor decorations to update keyword styling in open editors
    // This ensures the keyword span is properly updated with the new state
    if (this.plugin.refreshVisibleEditorDecorations) {
      this.plugin.refreshVisibleEditorDecorations();
    }

    return updatedTask;
  }

  /**
   * Perform optimistic UI updates immediately.
   * This updates in-memory state and refreshes task list views.
   *
   * Note: Editor and reader views handle their own optimistic updates
   * via CodeMirror decorations and DOM manipulation.
   */
  private performOptimisticUpdate(task: Task, newState: string): void {
    // Update in-memory state
    this.taskStateManager.optimisticUpdate(task, newState);

    // Refresh task list views
    this.plugin.refreshAllTaskListViews();
  }

  /**
   * Perform direct DOM manipulation on embeds to update the task state display.
   * This updates the embed display without triggering a full re-render
   * which would cause flicker. The DOM update is synchronous and only
   * touches the specific elements that need to change.
   */
  private performDirectEmbedDOMUpdate(task: Task, newState: string): void {
    // Get the filename from the task path
    const fileName = task.path.split('/').pop()?.replace('.md', '');
    if (!fileName) return;

    // Find all embeds that reference this file
    const embeds = document.querySelectorAll('.internal-embed');

    embeds.forEach((embed) => {
      const src = embed.getAttribute('src');
      if (!src || !src.includes(fileName)) return;

      // If there's a specific embed reference, check if it matches
      if (task.embedReference) {
        const blockRef = task.embedReference.replace('^', '');
        if (!src.includes(blockRef)) return;
      }

      // Find the keyword element within this embed
      // It might have the old state (task.state) or be stale
      const keywordEl = embed.querySelector('[data-task-keyword]');
      if (!keywordEl) return;

      // Get the old state from the element
      const oldState = keywordEl.getAttribute('data-task-keyword');
      if (!oldState || oldState === newState) return;

      // Update the keyword element
      keywordEl.textContent = newState;
      keywordEl.setAttribute('data-task-keyword', newState);
      keywordEl.setAttribute('aria-label', `Task keyword: ${newState}`);

      // Handle completed task styling
      const wasCompleted = DEFAULT_COMPLETED_STATES.has(oldState);
      const isNowCompleted = DEFAULT_COMPLETED_STATES.has(newState);

      if (wasCompleted && !isNowCompleted) {
        // Transitioning from completed to non-completed: remove strikethrough
        const completedContainer = keywordEl.closest(
          '.todoseq-completed-task-text',
        );
        if (completedContainer && completedContainer.parentNode) {
          // Unwrap the content: move all children out of the completed container
          const parent = completedContainer.parentNode;
          // Move the keyword element first
          parent.insertBefore(keywordEl, completedContainer);
          // Move any other children
          while (completedContainer.firstChild) {
            parent.insertBefore(
              completedContainer.firstChild,
              completedContainer,
            );
          }
          // Remove the empty completed container
          parent.removeChild(completedContainer);
        }
      } else if (!wasCompleted && isNowCompleted) {
        // Transitioning from non-completed to completed: add strikethrough
        // Find the task container
        const taskContainer = keywordEl.closest('.todoseq-task');
        if (taskContainer) {
          // Create completed container
          const completedContainer = document.createElement('span');
          completedContainer.className = 'todoseq-completed-task-text';
          completedContainer.setAttribute('data-completed-task', 'true');

          // Move keyword and all siblings after it into the completed container
          let currentNode = keywordEl.nextSibling;
          const nodesToMove: Node[] = [];
          while (currentNode) {
            nodesToMove.push(currentNode);
            currentNode = currentNode.nextSibling;
          }

          // Add nodes to completed container
          nodesToMove.forEach((node) => {
            completedContainer.appendChild(node);
          });

          // Insert completed container after keyword
          keywordEl.parentNode?.insertBefore(
            completedContainer,
            keywordEl.nextSibling,
          );

          // Move keyword into completed container at the beginning
          completedContainer.insertBefore(
            keywordEl,
            completedContainer.firstChild,
          );
        }
      }
    });
  }
}
