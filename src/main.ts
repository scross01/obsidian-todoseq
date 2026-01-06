import { Plugin, TFile, TAbstractFile, WorkspaceLeaf, Editor, MarkdownView } from 'obsidian';
import { Task, NEXT_STATE, DEFAULT_COMPLETED_STATES } from './task';
import { TodoView, TaskViewMode } from "./view/task-view";
import { TodoTrackerSettingTab, TodoTrackerSettings, DefaultSettings } from "./settings/settings";
import { TaskParser } from './parser/task-parser';
import { TaskEditor } from './view/task-editor';
import { taskKeywordPlugin, TaskKeywordDecorator } from './view/task-formatting';
import { EditorKeywordMenu } from './view/editor-keyword-menu';
import { VaultScanner } from './services/vault-scanner';
import { StatusBarManager } from './view/status-bar';

export const TASK_VIEW_ICON = "list-todo";

export default class TodoTracker extends Plugin {
  settings: TodoTrackerSettings;
  tasks: Task[] = [];

  // Vault scanner service for handling all vault scanning operations
  private vaultScanner: VaultScanner | null = null;

  // Task editor instance for updating tasks
  private taskEditor: TaskEditor | null = null;
  
  // Editor keyword menu for right-click context menu
  private editorKeywordMenu: EditorKeywordMenu | null = null;

  // Task formatting instances - stores various types of formatting-related objects
  private taskFormatters: Map<string, any> = new Map();

  // Status bar manager for task count
  private statusBarManager: StatusBarManager | null = null;

  // Shared comparator to avoid reallocation and ensure consistent ordering
  private readonly taskComparator = (a: Task, b: Task): number => {
    if (a.path === b.path) return a.line - b.line;
    return a.path.localeCompare(b.path);
  };

  // Public getter methods for internal services
  public getVaultScanner(): VaultScanner | null {
    return this.vaultScanner;
  }

  public getTasks(): Task[] {
    return this.tasks;
  }

 // Obsidian lifecycle method called when the plugin is loaded.
 async onload() {
   await this.loadSettings();

   // Initialize VaultScanner service
   this.vaultScanner = new VaultScanner(this.app, this.settings, TaskParser.create(this.settings));
   
   // Listen to VaultScanner events
   this.vaultScanner.on('tasks-changed', (tasks) => {
     this.tasks = tasks;
     this.refreshOpenTaskViews();
   });
   
   // Register the custom view type
   this.registerView(
     TodoView.viewType,
     (leaf) => new TodoView(leaf, this.tasks, this.settings.taskViewMode, this.settings)
   );
 
   // Persist view-mode changes coming from TodoView toolbars
   const handler = async (e: Event) => {
     const detail = (e as CustomEvent).detail as { mode: TaskViewMode };
     if (!detail?.mode) return;
     this.settings.taskViewMode = detail.mode;
     await this.saveSettings();
     await this.refreshOpenTaskViews();
   };
   window.addEventListener('todoseq:view-mode-change', handler);
   this.register(() => window.removeEventListener('todoseq:view-mode-change', handler));
 
   this.addRibbonIcon(TASK_VIEW_ICON, 'Open TODOseq', () => {
     this.showTasks();
   });

   // Add settings tab
   this.addSettingTab(new TodoTrackerSettingTab(this.app, this));

   // Add command to show tasks
   this.addCommand({
     id: 'show-todo-tasks',
     name: 'Show TODO tasks',
     callback: () => this.showTasks()
   });

   // Add editor command to toggle task state
   this.addCommand({
     id: 'toggle-task-state',
     name: 'Toggle task state',
     editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
       return this.handleToggleTaskState(checking, editor, view);
     },
     hotkeys: [
       {
         modifiers: ['Ctrl'],
         key: 'Enter'
       }
     ]
   });

   // Initialize task editor
   this.taskEditor = new TaskEditor(this.app);
   
   // Initialize editor keyword menu
   this.editorKeywordMenu = new EditorKeywordMenu(this.app, this.settings, this.taskEditor);
   
   // Setup right-click event handlers for task keywords
   this.setupTaskKeywordContextMenu();

   // Initial scan using VaultScanner
   await this.vaultScanner.scanVault();

   // Setup task formatting based on current settings
   this.setupTaskFormatting();

   // Setup status bar manager
   this.setupStatusBarManager();

   // Set up periodic refresh using VaultScanner
   this.vaultScanner.setupPeriodicRefresh(this.settings.refreshInterval);

   // Register file change events that delegate to VaultScanner
   this.registerEvent(
     this.app.vault.on('modify', (file) => this.vaultScanner?.handleFileChange(file))
   );
   this.registerEvent(
     this.app.vault.on('delete', (file) => this.vaultScanner?.handleFileChange(file))
   );
   this.registerEvent(
     this.app.vault.on('create', (file) => this.vaultScanner?.handleFileChange(file))
   );
   this.registerEvent(
     // Obsidian passes (file, oldPath) for rename
     this.app.vault.on('rename', (file, oldPath) => this.vaultScanner?.handleFileRename(file, oldPath))
   );
 }

  // Helper: refresh all open Todo views to reflect this.tasks without stealing focus
  private async refreshOpenTaskViews(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(TodoView.viewType);
    for (const leaf of leaves) {
      if (leaf.view instanceof TodoView) {
        // Update data source
        leaf.view.tasks = this.tasks;
        // Update the dropdown's task reference so it uses the latest tasks
        leaf.view.updateTasks(this.tasks);
        // Lighter refresh: only update the visible list rather than full onOpen re-init
        leaf.view.refreshVisibleList();
      }
    }
  }

  // Obsidian lifecycle method called when the plugin is unloaded
  onunload() {
    // Clean up VaultScanner resources
    this.vaultScanner?.destroy();
  
    // Clean up status bar manager
    if (this.statusBarManager) {
      this.statusBarManager.cleanup();
      this.statusBarManager = null;
    }
  }

  // Obsidian lifecycle method called to settings are loaded
  async loadSettings() {
    const loaded = await this.loadData();  // eslint-disable-line @typescript-eslint/no-unsafe-assignment
    this.settings = Object.assign({}, DefaultSettings, loaded as Partial<TodoTrackerSettings>);
    // Normalize settings shape after migration: ensure additionalTaskKeywords exists
    if (!this.settings.additionalTaskKeywords) {
      this.settings.additionalTaskKeywords = [];
    }
    // Update VaultScanner with new settings if it exists
    if (this.vaultScanner) {
      this.vaultScanner.updateSettings(this.settings);
    }
  }

  // Public method to update parser in VaultScanner with current settings
  public recreateParser(): void {
    if (this.vaultScanner) {
      this.vaultScanner.updateParser(TaskParser.create(this.settings));
    }
  }
  
  // Public method to trigger a vault scan using VaultScanner
  public async scanVault(): Promise<void> {
    if (this.vaultScanner) {
      await this.vaultScanner.scanVault();
    }
  }
  
  // Public method to update periodic refresh using VaultScanner
  public setupPeriodicRefresh(): void {
    if (this.vaultScanner) {
      this.vaultScanner.setupPeriodicRefresh(this.settings.refreshInterval);
    }
  }

  // Obsidian lifecycle method called to save settings
  async saveSettings() {
    await this.saveData(this.settings);
  }

  // Update task formatting in all views
  public updateTaskFormatting(): void {
    // Always clear existing formatters first to prevent stacking
    this.clearTaskFormatting();
    
    if (!this.settings.formatTaskKeywords) {
      // When disabling formatting, we're done after clearing
      return;
    }
    
    // Setup editor decorations
    this.setupEditorDecorations();
    
    // Force refresh of all visible markdown editors to apply new formatting
    this.refreshVisibleEditorDecorations();
  }

  // Setup status bar manager for task count
  private setupStatusBarManager(): void {
    import('./view/status-bar').then((module) => {
      this.statusBarManager = new module.StatusBarManager(this);
      this.statusBarManager.setupStatusBarItem();
    }).catch(error => {
      console.error('Failed to load status bar manager:', error);
    });
  }
  
  // Force refresh of editor decorations in all visible markdown editors
  public refreshVisibleEditorDecorations(): void {
    // Get all visible markdown editors
    const leaves = this.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.editor) {
        // Force the editor to refresh its decorations by triggering a viewport change
        const editorView = (view.editor as any).cm;
        if (editorView && typeof editorView.requestMeasure === 'function') {
          // Request a measurement update which will trigger decoration refresh
          editorView.requestMeasure();
        }
        
        // Additional force refresh: trigger a viewport change to ensure decorations are re-evaluated
        if (editorView && typeof editorView.dispatch === 'function') {
          // Dispatch a dummy transaction to force re-render and clear any stacked decorations
          editorView.dispatch({
            selection: editorView.state.selection
          });
          
          // Force a second update to ensure decorations are properly applied/removed
          setTimeout(() => {
            if (editorView && typeof editorView.requestMeasure === 'function') {
              editorView.requestMeasure();
            }
          }, 0);
        }
      }
    }
  }
  
  // Setup task formatting based on current settings
  private setupTaskFormatting(): void {
    this.updateTaskFormatting();
    this.setupCheckboxEventListeners();
  }

  private setupEditorDecorations(): void {
    // Register editor extension for all markdown editors
    const extension = this.registerEditorExtension([
      taskKeywordPlugin(this.settings)
    ]);
    this.taskFormatters.set('editor-extension', extension);
  }

  private setupCheckboxEventListeners(): void {
    if (!this.settings.formatTaskKeywords) {
      return;
    }

    // Set up event listeners on all active markdown editors immediately
    const setupEditorListeners = () => {
      const leaves = this.app.workspace.getLeavesOfType('markdown');
      leaves.forEach((leaf) => {
        const view = leaf.view;
        if (view instanceof MarkdownView && view.editor) {
          const cmEditor = (view.editor as any)?.cm;
          if (cmEditor && cmEditor.dom) {
            const editorContent = cmEditor.dom;
            
            // Add event listener for click events on checkboxes and task keywords
            const clickHandler = (event: MouseEvent) => {
              const target = event.target as HTMLElement;
 
              // Handle checkbox clicks
              if (target.classList.contains('task-list-item-checkbox')) {
                this.handleCheckboxToggle(target as HTMLInputElement);
              }
              // Handle task keyword clicks
              else if (target.classList.contains('todoseq-keyword-formatted')) {
                // Handle task state update with double-click detection
                this.handleTaskKeywordClickWithDoubleClickDetection(target, view, event);
              }
            };

            editorContent.addEventListener('click', clickHandler, { capture: true });

            // Store the click handler for cleanup
            const handlerId = 'checkbox-click-handler-' + Math.random().toString(36).substr(2, 9);
            this.taskFormatters.set(handlerId, clickHandler);
          }
        }
      });
    };

    // Set up listeners on currently active editors
    setupEditorListeners();

    // Also listen for new editors being opened
    this.registerEvent(
      this.app.workspace.on('layout-change', setupEditorListeners)
    );
  }

  private handleCheckboxToggle(checkbox: HTMLInputElement): void {
    // Find the task keyword span in the same line
    const lineElement = checkbox.closest('.cm-line, .HyperMD-task-line');
    if (!lineElement) {
      return;
    }

    // Find the task keyword span
    const keywordSpan = lineElement.querySelector('.todoseq-keyword-formatted');
    if (!keywordSpan) {
      return;
    }

    // Get current keyword
    const currentKeyword = keywordSpan.getAttribute('data-task-keyword');
    if (!currentKeyword) {
      return;
    }

    // Determine new state based on checkbox state
    let newKeyword = currentKeyword;
    if (checkbox.checked) {
      // Checkbox checked -> change to DONE
      newKeyword = 'DONE';
    } else {
      // Checkbox unchecked -> change to TODO
      newKeyword = 'TODO';
    }

    // Update the keyword text and data attribute directly in the DOM
    keywordSpan.textContent = newKeyword;
    keywordSpan.setAttribute('data-task-keyword', newKeyword);
    keywordSpan.setAttribute('aria-label', `Task keyword: ${newKeyword}`);
  }

  private async handleTaskKeywordClick(keywordElement: HTMLElement, view: MarkdownView): Promise<void> {
    // Prevent default behavior and stop propagation
    const event = window.event as MouseEvent;
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Get current keyword
    const currentKeyword = keywordElement.getAttribute('data-task-keyword');
    if (!currentKeyword) {
      return;
    }

    // Cycle to the next state using NEXT_STATE map
    const nextState = NEXT_STATE.get(currentKeyword) || 'TODO';

    // Update the task state directly in the DOM
    keywordElement.textContent = nextState;
    keywordElement.setAttribute('data-task-keyword', nextState);
    keywordElement.setAttribute('aria-label', `Task keyword: ${nextState}`);

    // Update the checkbox state to match the new task state
    this.updateCheckboxState(keywordElement, nextState);
  }

  /**
   * Handle task keyword click with double-click detection
   * Uses a timeout to determine if a second click occurs (double-click)
   */
  private pendingClickTimeout: number | null = null;
  private lastClickedElement: HTMLElement | null = null;
  private lastClickTime: number = 0;

  private handleTaskKeywordClickWithDoubleClickDetection(keywordElement: HTMLElement, view: MarkdownView, event: MouseEvent): void {
    const currentTime = Date.now();
    const isDoubleClick = (
      this.lastClickedElement === keywordElement &&
      currentTime - this.lastClickTime < 300
    );

    // Clear any pending single click timeout
    if (this.pendingClickTimeout) {
      clearTimeout(this.pendingClickTimeout);
      this.pendingClickTimeout = null;
    }

    // If this is a double click, don't process it - let browser handle word selection
    if (isDoubleClick) {
      this.lastClickedElement = null;
      this.lastClickTime = 0;
      return; // Don't process this as a single click
    }

    // Store the clicked element and time for double-click detection
    this.lastClickedElement = keywordElement;
    this.lastClickTime = currentTime;

    // Set a timeout to process as single click if no second click occurs
    this.pendingClickTimeout = window.setTimeout(() => {
      this.pendingClickTimeout = null;
      this.lastClickedElement = null;
      this.lastClickTime = 0;
      
      // Process as single click
      this.handleTaskKeywordClick(keywordElement, view);
    }, 300); // Standard double-click detection window
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

  private clearEditorDecorations(): void {
    // Clear editor decorations by registering an empty extension
    const emptyExtension = this.registerEditorExtension([]);
    this.taskFormatters.set('editor-extension', emptyExtension);
  }

  private setupTaskKeywordContextMenu(): void {
    // Add event listener for right-click on task keywords
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          // Small delay to allow editor to fully load
          setTimeout(() => {
            this.addContextMenuToEditor();
          }, 100);
        }
      })
    );
    
    // Also add to currently active editor if any
    this.addContextMenuToEditor();
  }

  private addContextMenuToEditor(): void {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      const editorContainer = activeView.containerEl;
      const cmEditor = editorContainer.querySelector('.cm-editor');
      
      if (cmEditor) {
        cmEditor.addEventListener('contextmenu', (evt: MouseEvent) => {
          const target = evt.target as HTMLElement;
          
          // Check if the right-click was on a task keyword element
          if (target.hasAttribute('data-task-keyword')) {
            evt.preventDefault();
            evt.stopPropagation();
            
            // Get the task keyword and line information
            const keyword = target.getAttribute('data-task-keyword');
            
            if (keyword && activeView.file) {
              // Open the context menu
              this.editorKeywordMenu?.openStateMenuAtMouseEvent(keyword, target, evt);
            }
          }
        });
      }
    }
  }

  private getLineNumberFromElement(element: HTMLElement): number | null {
    // Find the line number by walking up the DOM tree to find the line element
    let currentElement: HTMLElement | null = element;
    
    while (currentElement && !currentElement.classList.contains('cm-line')) {
      currentElement = currentElement.parentElement;
    }
    
    if (currentElement) {
      // Get the line number from the data-line attribute or by counting
      const lineAttr = currentElement.getAttribute('data-line');
      if (lineAttr) {
        return parseInt(lineAttr, 10);
      }
      
      // Alternative: count lines from the top
      const lineElements = document.querySelectorAll('.cm-line');
      for (let i = 0; i < lineElements.length; i++) {
        if (lineElements[i] === currentElement) {
          return i;
        }
      }
    }
    
    return null;
  }
  
  
  private clearTaskFormatting(): void {
    // Clear editor decorations
    this.clearEditorDecorations();
    this.taskFormatters.clear();
  }


  // Serialize scans to avoid overlapping runs
  private _isScanning = false;
  
  // Show tasks in the task view
  async showTasks() {
    const { workspace } = this.app;
    
    // Create new leaf or use existing
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(TodoView.viewType);

    if (leaves.length > 0) {
      leaf = leaves[0];
      // Only reveal if the leaf is not already active to avoid focus stealing
      const activeLeaf = workspace.activeLeaf;
      if (activeLeaf !== leaf) {
        await workspace.revealLeaf(leaf);
      }
    } else {
      leaf = workspace.getLeaf(true);
      leaf.setViewState({ type: TodoView.viewType, active: true });
      // Only reveal if the leaf is not already active to avoid focus stealing
      const activeLeaf = workspace.activeLeaf;
      if (activeLeaf !== leaf) {
        await workspace.revealLeaf(leaf);
      }
    }
  }

  /**
   * Handle the toggle task state command
   * @param checking - Whether this is just a check to see if the command is available
   * @param editor - The editor instance
   * @param view - The markdown view
   * @returns boolean indicating if the command is available
   */
  private handleToggleTaskState(checking: boolean, editor: Editor, view: MarkdownView): boolean {
    if (!this.taskEditor || !this.vaultScanner) {
      return false;
    }

    // Get the current line from the editor
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    
    // Check if this line contains a valid task using VaultScanner's parser
    const parser = this.vaultScanner.getParser();
    if (!parser?.testRegex.test(line)) {
      return false;
    }

    if (checking) {
      return true;
    }

    // Parse the task from the current line
    const task = this.parseTaskFromLine(line, cursor.line, view.file?.path || '');
    
    if (task) {
      // Update the task state
      this.taskEditor.updateTaskState(task);
    }

    return true;
  }

  /**
   * Parse a task from a line of text
   * @param line - The line of text containing the task
   * @param lineNumber - The line number in the file
   * @param filePath - The path to the file
   * @returns Parsed Task object or null if not a valid task
   */
  private parseTaskFromLine(line: string, lineNumber: number, filePath: string): Task | null {
    if (!this.vaultScanner) {
      return null;
    }

    const parser = this.vaultScanner.getParser();
    if (!parser) {
      return null;
    }

    const match = parser.captureRegex.exec(line);
    if (!match) {
      return null;
    }

    // Extract task details using the same logic as TaskParser
    const indent = match[1] || "";
    const listMarker = (match[2] || "") + (match[3] || "");
    const state = match[4];
    const taskText = match[5];
    const tail = match[6];

    // Extract priority
    let priority: 'high' | 'med' | 'low' | null = null;
    const cleanedText = taskText.replace(/(\s*)\[#([ABC])\](\s*)/, (match: string, before: string, letter: string, after: string) => {
      if (letter === 'A') priority = 'high';
      else if (letter === 'B') priority = 'med';
      else if (letter === 'C') priority = 'low';
      return ' ';
    }).replace(/[ \t]+/g, ' ').trimStart();

    // Extract checkbox state
    let completed = false;
    const checkboxMatch = line.match(/^(\s*)([-*+]\s*\[(\s|x)\]\s*)\s+([^\s]+)\s+(.+)$/);
    if (checkboxMatch) {
      const [, , , checkboxStatus] = checkboxMatch;
      completed = checkboxStatus === 'x';
    } else {
      completed = new Set(['DONE', 'CANCELED', 'CANCELLED']).has(state);
    }

    return {
      path: filePath,
      line: lineNumber,
      rawText: line,
      indent,
      listMarker,
      text: cleanedText,
      state: state as Task['state'],
      completed,
      priority,
      scheduledDate: null,
      deadlineDate: null,
      tail
    };
  }
}
