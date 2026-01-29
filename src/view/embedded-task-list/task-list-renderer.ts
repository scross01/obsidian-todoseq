import { Task, DEFAULT_COMPLETED_STATES } from '../../task';
import { TaskEditor } from '../task-editor';
import TodoTracker from '../../main';
import { TodoseqParameters } from './code-block-parser';
import { MarkdownView } from 'obsidian';

/**
 * Renders interactive task lists within code blocks.
 * Handles task state changes and navigation.
 */
export class EmbeddedTaskListRenderer {
  private plugin: TodoTracker;
  private taskEditor: TaskEditor;

  constructor(plugin: TodoTracker) {
    this.plugin = plugin;
    this.taskEditor = new TaskEditor(plugin.app);
  }

  /**
   * Render a task list within the given container element
   * @param container The container element to render into
   * @param tasks Tasks to render
   * @param params Code block parameters for context
   */
  renderTaskList(
    container: HTMLElement,
    tasks: Task[],
    params: TodoseqParameters,
  ): void {
    // Clear existing content
    container.empty();

    // Create task list container
    const taskListContainer = container.createEl('div', {
      cls: 'embedded-task-list-container',
    });

    // Add header with search/sort info
    if (params.searchQuery || params.sortMethod !== 'default') {
      const header = taskListContainer.createEl('div', {
        cls: 'embedded-task-list-header',
      });

      if (params.searchQuery) {
        header.createEl('span', {
          cls: 'embedded-task-list-search',
          text: `Search: ${params.searchQuery}`,
        });
      }

      if (params.sortMethod !== 'default') {
        header.createEl('span', {
          cls: 'embedded-task-list-sort',
          text: `Sort: ${params.sortMethod}`,
        });
      }
    }

    // Create task list
    const taskList = taskListContainer.createEl('ul', {
      cls: 'embedded-task-list',
    });

    // Render each task
    tasks.forEach((task, index) => {
      const taskItem = this.createTaskListItem(task, index);
      taskList.appendChild(taskItem);
    });

    // Add empty state if no tasks
    if (tasks.length === 0) {
      const emptyState = taskListContainer.createEl('div', {
        cls: 'embedded-task-list-empty',
      });
      emptyState.createEl('div', {
        cls: 'embedded-task-list-empty-title',
        text: 'No tasks found',
      });
      emptyState.createEl('div', {
        cls: 'embedded-task-list-empty-subtitle',
        text: 'Try adjusting your search or sort parameters',
      });
    }
  }

  /**
   * Create a single task list item element
   * @param task The task to render
   * @param index The index of the task in the list
   * @returns HTML list item element
   */
  private createTaskListItem(task: Task, index: number): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'embedded-task-item';
    li.setAttribute('data-path', task.path);
    li.setAttribute('data-line', String(task.line));
    li.setAttribute('data-index', String(index));

    // Create checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'embedded-task-checkbox';
    checkbox.checked = task.completed;
    checkbox.setAttribute(
      'aria-label',
      `Toggle task: ${task.text || task.state}`,
    );

    // Create task text container
    const textContainer = document.createElement('div');
    textContainer.className = 'embedded-task-text-container';

    // Create task state
    const stateSpan = document.createElement('span');
    stateSpan.className = 'embedded-task-state';
    stateSpan.textContent = task.state;
    textContainer.appendChild(stateSpan);

    // Create task text if present
    if (task.text) {
      const textSpan = document.createElement('span');
      textSpan.className = 'embedded-task-text';
      textSpan.textContent = task.text;
      textContainer.appendChild(textSpan);
    }

    // Create priority indicator if present
    if (task.priority) {
      const prioritySpan = document.createElement('span');
      prioritySpan.className = 'embedded-task-priority';
      prioritySpan.textContent = `[#${task.priority.toUpperCase()}]`;
      textContainer.appendChild(prioritySpan);
    }

    // Create file info
    const fileInfo = document.createElement('div');
    fileInfo.className = 'embedded-task-file-info';
    const fileName = task.path.split('/').pop() || task.path;
    fileInfo.textContent = `${fileName}:${task.line + 1}`;
    fileInfo.setAttribute('title', task.path);

    // Assemble the item
    li.appendChild(checkbox);
    li.appendChild(textContainer);
    li.appendChild(fileInfo);

    // Add event listeners
    this.addTaskEventListeners(li, checkbox, task);

    return li;
  }

  /**
   * Add event listeners to a task list item
   * @param li The list item element
   * @param checkbox The checkbox element
   * @param task The task data
   */
  private addTaskEventListeners(
    li: HTMLLIElement,
    checkbox: HTMLInputElement,
    task: Task,
  ): void {
    // Checkbox change handler
    checkbox.addEventListener('change', async (e) => {
      e.stopPropagation();

      try {
        const newCompleted = checkbox.checked;
        const newState = newCompleted ? 'DONE' : 'TODO';

        // Update task state using existing TaskEditor
        await this.taskEditor.updateTaskState(task, newState);

        // Update the task in the plugin's task list
        this.updateTaskInPlugin(task, newState);
      } catch (error) {
        console.error('Error updating task state:', error);
        // Revert checkbox on error
        checkbox.checked = !checkbox.checked;
      }
    });

    // Click handler for navigation (excluding checkbox)
    li.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        this.navigateToTask(task);
      }
    });
  }

  /**
   * Navigate to the task's location in the vault
   * @param task The task to navigate to
   */
  private navigateToTask(task: Task): void {
    try {
      const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
      if (file) {
        // Open the file and navigate to the task line
        this.plugin.app.workspace.openLinkText(task.path, '', true);

        // Focus the editor and move cursor to the task line
        setTimeout(() => {
          const activeView =
            this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
          if (activeView && activeView.editor) {
            activeView.editor.setCursor({ line: task.line, ch: 0 });
            activeView.editor.focus();
          }
        }, 100);
      }
    } catch (error) {
      console.error('Error navigating to task:', error);
    }
  }

  /**
   * Update a task in the plugin's task list
   * @param task The task to update
   * @param newState The new state for the task
   */
  private updateTaskInPlugin(task: Task, newState: string): void {
    // Find the task in the plugin's task list and update it via TaskStateManager
    const tasks = this.plugin.getTasks();
    const taskToUpdate = tasks.find(
      (t) => t.path === task.path && t.line === task.line,
    );

    if (taskToUpdate) {
      // Update the task via the centralized TaskStateManager
      this.plugin.taskStateManager.updateTask(taskToUpdate, {
        state: newState,
        completed: DEFAULT_COMPLETED_STATES.has(newState),
      });

      // Trigger refresh of other views
      this.plugin.uiManager.refreshOpenTaskListViews();
    }
  }

  /**
   * Render an error message in the container
   * @param container The container element
   * @param errorMessage The error message to display
   */
  renderError(container: HTMLElement, errorMessage: string): void {
    container.empty();

    const errorContainer = container.createEl('div', {
      cls: 'embedded-task-list-error',
    });

    errorContainer.createEl('div', {
      cls: 'embedded-task-list-error-title',
      text: 'Error rendering task list',
    });

    errorContainer.createEl('div', {
      cls: 'embedded-task-list-error-message',
      text: errorMessage,
    });

    errorContainer.createEl('div', {
      cls: 'embedded-task-list-error-help',
      text: 'Check your search and sort parameters for syntax errors.',
    });
  }
}
