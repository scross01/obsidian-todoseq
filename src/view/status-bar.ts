import TodoTracker from '../main';
import { Task } from '../task';
import { TaskListView } from './task-list-view';
import { TFile } from 'obsidian';

export class StatusBarManager {
  private statusBarItem: HTMLElement | null = null;

  constructor(private plugin: TodoTracker) {}

  // Setup status bar item for task count
  setupStatusBarItem(): void {
    // Create status bar item
    this.statusBarItem = this.plugin.addStatusBarItem();
    this.statusBarItem.addClass('mod-clickable');
    this.statusBarItem.addClass('todoseq-status-bar');

    // Add click event listener
    if (this.statusBarItem) {
      this.statusBarItem.addEventListener('click', () => {
        this.handleStatusBarClick();
      });
    }

    // Subscribe to TaskStateManager for task changes
    this.plugin.taskStateManager.subscribe((tasks: Task[]) => {
      this.updateStatusBarItem(tasks);
    });

    // Update status bar item when active file changes
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('active-leaf-change', () => {
        this.updateStatusBarItem(this.getTasks());
      }),
    );
  }

  // Update status bar item with current task count
  updateStatusBarItem(tasks?: Task[]): void {
    if (!this.statusBarItem) return;

    const activeFile = this.plugin.app.workspace.getActiveFile();
    if (!activeFile) {
      this.statusBarItem.setText('');
      return;
    }

    // Use provided tasks or get from plugin
    const taskList = tasks ?? this.getTasks();

    // Count incomplete tasks for the current file
    const incompleteTasks = taskList.filter(
      (task) => task.path === activeFile.path && !task.completed,
    );

    // Format as "X tasks" instead of "Tasks: X"
    const taskCount = incompleteTasks.length;
    this.statusBarItem.setText(
      `${taskCount} task${taskCount !== 1 ? 's' : ''}`,
    );
  }

  // Update task count from current state
  updateTaskCount(): void {
    this.updateStatusBarItem();
  }

  // Handle click on status bar item
  handleStatusBarClick(): void {
    const activeFile = this.plugin.app.workspace.getActiveFile();
    if (!activeFile) return;

    // Open/focus the TODOseq Task List
    this.plugin.uiManager.showTasks();

    // Populate the search filter with file name only
    // Omit path filter for files without parent directory
    const hasParentDirectory = activeFile.path.contains('/');
    const pathFilter =
      hasParentDirectory && activeFile instanceof TFile
        ? `path:"${activeFile.parent?.path || ''}" `
        : '';
    const fileFilter = `file:"${activeFile.basename}"`;
    const searchQuery = pathFilter + fileFilter;

    const leaves = this.plugin.app.workspace.getLeavesOfType(
      TaskListView.viewType,
    );
    if (leaves.length > 0) {
      const view = leaves[0].view as TaskListView;
      if (view) {
        // Use the public method to set search query
        this.setTaskListViewSearchQuery(view, searchQuery);
      }
    }
  }

  // Public method to set search query on a TodoView
  private setTaskListViewSearchQuery(view: TaskListView, query: string): void {
    // Access the private method through the content element attribute
    view.contentEl.setAttr('data-search', query);
    // Also update the search input element if it exists
    const searchInput = view.contentEl.querySelector(
      '.search-input-container input',
    );
    if (searchInput instanceof HTMLInputElement) {
      searchInput.value = query;
    }
    // Trigger a refresh to apply the new search query
    view.refreshVisibleList();
  }

  // Clean up status bar item
  cleanup(): void {
    if (this.statusBarItem) {
      this.statusBarItem.remove();
      this.statusBarItem = null;
    }
  }

  // Helper methods to access plugin internals
  private getVaultScanner() {
    return (this.plugin as TodoTracker).getVaultScanner();
  }

  private getTasks(): Task[] {
    return (this.plugin as TodoTracker).getTasks();
  }
}
