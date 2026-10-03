import TodoTracker from '../../main';
import { Task } from '../../types/task';
import { TFile, Notice } from 'obsidian';

export class StatusBarManager {
  private statusBarItem: HTMLElement | null = null;
  private unsubscribeFromStateManager: (() => void) | null = null;
  private statusBarTimeout: number | null = null;

  constructor(private plugin: TodoTracker) {}

  // Setup status bar item for task count
  setupStatusBarItem(): void {
    if (this.statusBarItem || this.unsubscribeFromStateManager) return;

    // Create status bar item
    this.statusBarItem = this.plugin.addStatusBarItem();
    this.statusBarItem.addClass('mod-clickable');
    this.statusBarItem.addClass('todoseq-status-bar');

    // Add click event listener
    if (this.statusBarItem) {
      this.statusBarItem.addEventListener('click', (evt) => {
        this.handleStatusBarClick(evt);
      });
    }

    // Subscribe to TaskStateManager for task changes
    // Use debouncing to prevent excessive updates during rapid changes
    const STATUS_BAR_DEBOUNCE_MS = 150;

    this.unsubscribeFromStateManager = this.plugin.taskStateManager.subscribe(
      (tasks: Task[]) => {
        if (this.statusBarTimeout !== null) {
          window.clearTimeout(this.statusBarTimeout);
        }
        this.statusBarTimeout = window.setTimeout(() => {
          // Clear timeout reference to indicate no pending debounced update
          this.statusBarTimeout = null;
          this.updateStatusBarItem(tasks);
        }, STATUS_BAR_DEBOUNCE_MS);
      },
    );

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
  // Plain click: open/focus the task list in the sidebar and filter to the
  // active file. Cmd (mac) / Ctrl (win/linux) click: open a new main tab,
  // matching the dashboard drill-through behavior.
  handleStatusBarClick(evt?: MouseEvent): void {
    const activeFile = this.plugin.app.workspace.getActiveFile();
    if (!activeFile) return;

    // Populate the search filter with file name only
    // Omit path filter for files without parent directory
    const hasParentDirectory = activeFile.path.contains('/');
    const pathFilter =
      hasParentDirectory && activeFile instanceof TFile
        ? `path:"${activeFile.parent?.path || ''}" `
        : '';
    const fileFilter = `file:"${activeFile.basename}.${activeFile.extension}"`;
    const searchQuery = pathFilter + fileFilter;

    // Route through the dashboard drill-through entry point so the reveal
    // target and the query target are the same leaf. Applying the query via
    // leaves[0] while revealing by sidebar priority could land the filter on
    // an unfocused main-tab task list that the user never sees.
    const openInNewTab =
      evt instanceof MouseEvent && (evt.metaKey || evt.ctrlKey);
    this.plugin.uiManager
      .showTasksWithQuery(searchQuery, openInNewTab)
      .catch((error) => {
        new Notice('Failed to open task list');
        console.error('Error opening task list:', error);
      });
  }

  // Clean up status bar item
  cleanup(): void {
    if (this.statusBarTimeout !== null) {
      window.clearTimeout(this.statusBarTimeout);
      this.statusBarTimeout = null;
    }

    if (this.unsubscribeFromStateManager) {
      this.unsubscribeFromStateManager();
      this.unsubscribeFromStateManager = null;
    }

    if (this.statusBarItem) {
      this.statusBarItem.remove();
      this.statusBarItem = null;
    }
  }

  // Helper methods to access plugin internals
  private getVaultScanner() {
    return this.plugin.getVaultScanner();
  }

  private getTasks(): Task[] {
    return this.plugin.getTasks();
  }
}
