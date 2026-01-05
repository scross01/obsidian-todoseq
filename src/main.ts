import { Plugin, TFile, TAbstractFile, WorkspaceLeaf, Editor, MarkdownView } from 'obsidian';
import { Task } from './task';
import { TodoView, TaskViewMode } from "./view/task-view";
import { TodoTrackerSettingTab, TodoTrackerSettings, DefaultSettings } from "./settings/settings";
import { TaskParser } from './parser/task-parser';
import { TaskEditor } from './view/task-editor';
import { taskKeywordPlugin } from './view/task-formatting';
import { EditorKeywordMenu } from './view/editor-keyword-menu';
import { VaultScanner } from './services/vault-scanner';

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

  // Task formatting instances
  private taskFormatters: Map<string, any> = new Map();

  // Shared comparator to avoid reallocation and ensure consistent ordering
  private readonly taskComparator = (a: Task, b: Task): number => {
    if (a.path === b.path) return a.line - b.line;
    return a.path.localeCompare(b.path);
  };

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
  }

  private setupEditorDecorations(): void {
    // Register editor extension for all markdown editors
    const extension = this.registerEditorExtension([
      taskKeywordPlugin(this.settings)
    ]);
    this.taskFormatters.set('editor-extension', extension);
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
            const lineNumber = this.getLineNumberFromElement(target);
            
            if (keyword && lineNumber !== null && activeView.file) {
              // Parse the task from the line
              const line = activeView.editor.getLine(lineNumber);
              const task = this.parseTaskFromLine(line, lineNumber, activeView.file.path);
              
              if (task) {
                // Open the context menu
                this.editorKeywordMenu?.openStateMenuAtMouseEvent(task, target, evt);
              }
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
