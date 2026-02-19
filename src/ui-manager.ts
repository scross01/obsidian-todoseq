import { MarkdownView, WorkspaceLeaf, TFile } from 'obsidian';
import { EditorView } from '@codemirror/view';
import TodoTracker from './main';
import { DEFAULT_COMPLETED_STATES } from './types/task';
import { taskKeywordPlugin } from './view/editor-extensions/task-formatting';
import { dateAutocompleteExtension } from './view/editor-extensions/date-autocomplete';
import { TaskListView } from './view/task-list/task-list-view';

/**
 * Manages UI elements and interactions in the editor
 */
export class UIManager {
  constructor(private plugin: TodoTracker) {}

  /**
   * Setup task formatting based on current settings
   */
  setupTaskFormatting(): void {
    this.updateTaskFormatting();
    this.setupCheckboxEventListeners();
  }

  /**
   * Setup editor decorations for task formatting
   */
  setupEditorDecorations(): void {
    // Register editor extension for all markdown editors
    // Pass a function that gets the parser dynamically from VaultScanner
    // This ensures that when the parser is recreated (e.g., when custom keywords are added),
    // the editor decorations will use the updated parser
    const extension = this.plugin.registerEditorExtension([
      taskKeywordPlugin(
        this.plugin.settings,
        () => this.plugin.vaultScanner?.getParser() ?? null,
      ),
      dateAutocompleteExtension(this.plugin.settings),
    ]);
    this.plugin.taskFormatters.set('editor-extension', extension);
  }

  /**
   * Setup event listeners for checkbox interactions
   */
  // Track registered event listeners for cleanup
  private registeredEventListeners: {
    target: EventTarget;
    type: string;
    handler: EventListener;
    options?: AddEventListenerOptions;
  }[] = [];

  setupCheckboxEventListeners(): void {
    if (!this.plugin.settings.formatTaskKeywords) {
      return;
    }

    // Track which editors have had listeners attached to avoid duplicates
    const attachedEditors = new Set<HTMLElement>();

    // Set up event listeners on all active markdown editors immediately
    const setupEditorListeners = () => {
      const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
      leaves.forEach((leaf) => {
        const view = leaf.view;
        if (view instanceof MarkdownView && view.editor) {
          const cmEditor = (view.editor as { cm?: EditorView })?.cm;
          if (cmEditor && cmEditor.dom) {
            const editorContent = cmEditor.dom;

            // Skip if we've already attached listeners to this editor
            if (attachedEditors.has(editorContent)) {
              return;
            }
            attachedEditors.add(editorContent);

            // Handle click events on checkboxes and task keywords
            const clickHandler = (event: MouseEvent) => {
              const target = event.target as HTMLElement;

              // Handle checkbox clicks
              if (target.classList.contains('task-list-item-checkbox')) {
                this.handleCheckboxToggle(target as HTMLInputElement);
              }
              // Handle task keyword clicks (check target or any ancestor)
              else {
                const keywordElement = target.closest(
                  '.todoseq-keyword-formatted',
                );
                if (keywordElement) {
                  // Handle task state update with double-click detection
                  this.handleTaskKeywordClickWithDoubleClickDetection(
                    keywordElement as HTMLElement,
                    view,
                    event,
                  );
                }
              }
            };

            // Handle touch events to prevent text selection and ensure consistent behavior
            let touchStartTime: number;
            const touchHandler = (event: TouchEvent) => {
              const target = event.target as HTMLElement;
              const keywordElement = target.closest(
                '.todoseq-keyword-formatted',
              );

              if (keywordElement && event.touches.length === 1) {
                if (event.type === 'touchstart') {
                  // Record touch start time
                  touchStartTime = Date.now();
                } else if (event.type === 'touchend') {
                  // Calculate touch duration
                  const touchDuration = Date.now() - touchStartTime;

                  // Distinguish between single tap (short duration) and long press (long duration)
                  if (touchDuration < 500) {
                    // 500ms threshold for single tap
                    event.preventDefault();
                    event.stopPropagation();

                    // Create a synthetic click event
                    const touch = event.changedTouches[0];
                    const clickEvent = new MouseEvent('click', {
                      bubbles: true,
                      cancelable: true,
                      view: window,
                      clientX: touch.clientX,
                      clientY: touch.clientY,
                    });

                    keywordElement.dispatchEvent(clickEvent);
                  }
                  // For long presses (>= 500ms), we allow the default behavior (context menu)
                }
              }
            };

            // Store cleanup information and add event listeners
            this.registeredEventListeners.push(
              {
                target: editorContent,
                type: 'click',
                handler: clickHandler,
                options: { capture: true },
              },
              {
                target: editorContent,
                type: 'touchstart',
                handler: touchHandler,
                options: { capture: true },
              },
              {
                target: editorContent,
                type: 'touchend',
                handler: touchHandler,
                options: { capture: true },
              },
            );

            editorContent.addEventListener('click', clickHandler, {
              capture: true,
            });
            editorContent.addEventListener('touchstart', touchHandler, {
              capture: true,
            });
            editorContent.addEventListener('touchend', touchHandler, {
              capture: true,
            });
          }
        }
      });
    };

    setupEditorListeners();

    // Also set up listeners for newly opened editors
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('layout-change', setupEditorListeners),
    );

    // Set up listeners when a new file is opened (for the first editor)
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('file-open', () => {
        // Small delay to allow the editor to fully initialize
        setTimeout(() => {
          setupEditorListeners();
        }, 100);
      }),
    );
  }

  /**
   * When the task checkbox is updated update the task keyword to match.
   * The keyword state is updated in the DOM directly, and optimistic updates
   * are triggered for dependent views. The file update is handled by Obsidian's
   * natural checkbox behavior.
   */
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
    // Only change state if there's a mismatch between current state and checkbox
    if (checkbox.checked && !DEFAULT_COMPLETED_STATES.has(currentKeyword)) {
      // Checkbox checked but current state is not completed -> change to DONE
      newKeyword = 'DONE';
    } else if (
      !checkbox.checked &&
      DEFAULT_COMPLETED_STATES.has(currentKeyword)
    ) {
      // Checkbox unchecked but current state is completed -> change to TODO
      newKeyword = 'TODO';
    }
    // If checkbox state matches current state, keep current keyword

    // Update the keyword text and data attribute directly in the DOM
    keywordSpan.textContent = newKeyword;
    keywordSpan.setAttribute('data-task-keyword', newKeyword);
    keywordSpan.setAttribute('aria-label', `Task keyword: ${newKeyword}`);

    // Trigger optimistic update for task list views
    // The file will be updated by Obsidian's natural checkbox behavior
    const currentLine = this.getLineForElement(checkbox);
    if (currentLine !== null) {
      const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (view && view.file) {
        const lineNumber = currentLine - 1; // Convert to 0-indexed
        const filePath = view.file.path;

        // Parse the task from the line for optimistic update
        const line = view.editor.getLine(lineNumber);
        const task = this.plugin.editorController.parseTaskFromLine(
          line,
          lineNumber,
          filePath,
        );

        if (task && this.plugin.taskStateManager) {
          // Perform optimistic update without file modification
          // File will be updated by Obsidian's checkbox handling
          this.plugin.taskStateManager.optimisticUpdate(task, newKeyword);
          // Refresh task list views
          this.plugin.refreshAllTaskListViews();
        }
      }
    }
  }

  /**
   * Handles the single-click event on the task keyword to cycle the task state
   */
  private async handleTaskKeywordClick(
    keywordElement: HTMLElement,
    view: MarkdownView,
  ): Promise<void> {
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

    const currentLine = this.getLineForElement(keywordElement);
    if (currentLine !== null) {
      // The cursor positioning is now handled by TaskEditor.applyLineUpdate
      // which detects when the cursor is on the same line and positions it
      // after the new keyword
      this.plugin.editorController.handleUpdateTaskStateAtLine(
        false,
        currentLine - 1,
        view.editor,
        view,
      );
    }
  }

  /**
   * Handle task keyword click with double-click detection
   * Uses a timeout to determine if a second click occurs (double-click)
   */
  private pendingClickTimeout: number | null = null;
  private lastClickedElement: HTMLElement | null = null;
  private lastClickTime = 0;
  private isMouseDownOnKeyword = false;
  private mouseMoveHandler: ((event: MouseEvent) => void) | null = null;
  private mouseUpHandler: ((event: MouseEvent) => void) | null = null;

  private handleTaskKeywordClickWithDoubleClickDetection(
    keywordElement: HTMLElement,
    view: MarkdownView,
    event: MouseEvent,
  ): void {
    const currentTime = Date.now();
    const isDoubleClick =
      this.lastClickedElement === keywordElement &&
      currentTime - this.lastClickTime < 300;

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
    let clickCancelled = false;

    // Set up mouse movement tracking to detect if mouse leaves the element
    this.mouseMoveHandler = (moveEvent: MouseEvent) => {
      if (moveEvent.buttons === 1) {
        // Left mouse button is down
        const relatedTarget = moveEvent.relatedTarget as HTMLElement | null;
        // Check if mouse has moved outside the keyword element
        if (!keywordElement.contains(relatedTarget)) {
          // Mouse has moved away from the keyword element while button is down
          // This indicates text selection, not a single click
          clickCancelled = true;
        }
      }
    };

    // Set up mouse up tracking to detect when mouse button is released
    this.mouseUpHandler = (upEvent: MouseEvent) => {
      if (!keywordElement.contains(upEvent.target as HTMLElement)) {
        // Mouse was released outside the keyword element
        // This indicates text selection, not a single click
        clickCancelled = true;
      }
    };

    // Add temporary event listeners for mouse tracking
    document.addEventListener('mousemove', this.mouseMoveHandler);
    document.addEventListener('mouseup', this.mouseUpHandler);

    // Set a timeout to process as single click if no second click occurs
    this.pendingClickTimeout = window.setTimeout(() => {
      // Clean up mouse event listeners
      if (this.mouseMoveHandler) {
        document.removeEventListener('mousemove', this.mouseMoveHandler);
        this.mouseMoveHandler = null;
      }
      if (this.mouseUpHandler) {
        document.removeEventListener('mouseup', this.mouseUpHandler);
        this.mouseUpHandler = null;
      }

      this.pendingClickTimeout = null;
      this.lastClickedElement = null;
      this.lastClickTime = 0;

      // Process as single click only if click wasn't cancelled
      if (!clickCancelled) {
        this.handleTaskKeywordClick(keywordElement, view);
      }
    }, 300); // Standard double-click detection window
  }

  /**
   * Cancel pending click processing when mouse moves away during click
   */
  private cancelPendingClick(): void {
    if (this.pendingClickTimeout) {
      clearTimeout(this.pendingClickTimeout);
      this.pendingClickTimeout = null;
    }

    // Remove mouse event listeners
    if (this.mouseMoveHandler) {
      document.removeEventListener('mousemove', this.mouseMoveHandler);
      this.mouseMoveHandler = null;
    }
    if (this.mouseUpHandler) {
      document.removeEventListener('mouseup', this.mouseUpHandler);
      this.mouseUpHandler = null;
    }

    this.lastClickedElement = null;
    this.lastClickTime = 0;
    this.isMouseDownOnKeyword = false;
  }

  /**
   * Get the line number for a DOM element in the editor
   */
  public getLineForElement(element: HTMLElement): number | null {
    // Get the EditorView for this element
    const editorView = this.getEditorViewFromElement(element);
    if (!editorView) {
      return null;
    }

    try {
      // Use CodeMirror 6's posAtDOM to get the position of the element
      const pos = editorView.posAtDOM(element);

      // Get the line number from the position
      const lineNumber = editorView.state.doc.lineAt(pos).number;

      return lineNumber;
    } catch (error) {
      console.warn('Failed to get line number for element:', error);
      return null;
    }
  }

  /**
   * Get the EditorView from a DOM element
   */
  public getEditorViewFromElement(element: HTMLElement): EditorView | null {
    // Find the closest CodeMirror editor container
    const editorContainer = element.closest('.cm-editor') as HTMLElement | null;
    if (!editorContainer) {
      return null;
    }

    // Try to find the MarkdownView that contains this editor container
    const allLeaves = this.plugin.app.workspace.getLeavesOfType('markdown');
    for (const leaf of allLeaves) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.editor) {
        const cmEditor = (view.editor as { cm?: EditorView })?.cm;
        if (cmEditor && cmEditor.dom === editorContainer) {
          return cmEditor;
        }
      }
    }

    // Fallback: try to get the active view
    const activeView =
      this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView && activeView.editor) {
      const cmEditor = (activeView.editor as { cm?: EditorView })?.cm;
      if (cmEditor) {
        return cmEditor;
      }
    }

    return null;
  }

  /**
   * Update task formatting based on current settings
   */
  updateTaskFormatting(): void {
    // Clear existing decorations
    this.clearEditorDecorations();

    // Re-setup decorations with current settings
    if (this.plugin.settings.formatTaskKeywords) {
      this.setupEditorDecorations();
    }
  }

  /**
   * Clear editor decorations
   */
  clearEditorDecorations(): void {
    // Clear editor decorations by registering an empty extension
    const emptyExtension = this.plugin.registerEditorExtension([]);
    this.plugin.taskFormatters.set('editor-extension', emptyExtension);
  }

  /**
   * Setup task keyword context menu
   */
  setupTaskKeywordContextMenu(): void {
    // Add event listener for right-click on task keywords
    this.plugin.registerEvent(
      this.plugin.app.workspace.on('file-open', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          // Small delay to allow editor to fully load
          setTimeout(() => {
            this.addContextMenuToEditor();
          }, 100);
        }
      }),
    );

    // Also add to currently active editor if any
    this.addContextMenuToEditor();
  }

  /**
   * Add context menu to the current editor
   */
  private addContextMenuToEditor(): void {
    const activeView =
      this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView) {
      const editorContainer = activeView.containerEl;
      const cmEditor = editorContainer.querySelector('.cm-editor');

      if (cmEditor) {
        const contextMenuHandler = (evt: MouseEvent) => {
          const target = evt.target as HTMLElement;

          // Check if the right-click was on a task keyword element or its parent
          let keywordElement = target;
          let keyword = target.getAttribute('data-task-keyword');

          // If the target doesn't have the attribute, check parent elements
          if (!keyword && target.parentElement) {
            keywordElement = target.parentElement;
            keyword = keywordElement.getAttribute('data-task-keyword');
          }

          // Also check for footnote task keywords
          if (!keyword && target.closest('.footnote-task-keyword')) {
            keywordElement = target.closest(
              '.footnote-task-keyword',
            ) as HTMLElement;
            keyword = keywordElement.getAttribute('data-task-keyword');
          }

          if (keyword && activeView.file && this.plugin.editorKeywordMenu) {
            evt.preventDefault();
            evt.stopPropagation();

            // Open the context menu
            this.plugin.editorKeywordMenu.openStateMenuAtMouseEvent(
              keyword,
              keywordElement,
              evt,
            );
          }
        };

        // Store cleanup information for manual cleanup
        this.registeredEventListeners.push({
          target: cmEditor,
          type: 'contextmenu',
          handler: contextMenuHandler,
        });

        cmEditor.addEventListener('contextmenu', contextMenuHandler);
      }
    }
  }

  /**
   * Show the tasks view
   * @param reveal - Whether to reveal/open the sidebar panel (default: true)
   */
  async showTasks(reveal = true): Promise<void> {
    const { workspace } = this.plugin.app;

    // Create new leaf or use existing
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(TaskListView.viewType);

    if (leaves.length > 0) {
      leaf = leaves[0];
      // Only reveal if the leaf is not already active to avoid focus stealing
      const activeLeaf = workspace.activeLeaf;
      if (activeLeaf !== leaf && reveal) {
        await workspace.revealLeaf(leaf);
      }
    } else {
      // Open in right sidebar instead of main area
      // Use try-catch to handle workspace initialization issues
      try {
        leaf = workspace.getRightLeaf(false);
        if (!leaf) {
          // If no right leaf exists, create one by splitting the active leaf
          const activeLeaf = workspace.getLeaf(false);
          if (activeLeaf) {
            leaf = workspace.createLeafBySplit(activeLeaf, 'vertical');
          } else {
            // Fallback to main area if no active leaf is available
            leaf = workspace.getLeaf(true);
          }
        }
        // Use active: false to prevent focus stealing on first install
        leaf.setViewState({ type: TaskListView.viewType, active: false });
        // Only reveal if the leaf is not already active to avoid focus stealing
        const activeLeaf = workspace.activeLeaf;
        if (activeLeaf !== leaf && reveal) {
          await workspace.revealLeaf(leaf);
        }
      } catch (error) {
        console.warn(
          'Failed to open task view in right sidebar, falling back to main area:',
          error,
        );
        // Fallback to main area if right sidebar access fails
        leaf = workspace.getLeaf(true);
        leaf.setViewState({ type: TaskListView.viewType, active: false });
      }
    }
  }

  /**
   * Clean up all registered event listeners
   */
  cleanup(): void {
    // Remove all registered event listeners
    this.registeredEventListeners.forEach(
      ({ target, type, handler, options }) => {
        try {
          target.removeEventListener(type, handler, options);
        } catch (error) {
          console.warn(
            'Failed to remove event listener during cleanup:',
            error,
          );
        }
      },
    );
    this.registeredEventListeners = [];

    // Clear any pending timeouts and mouse handlers
    this.cancelPendingClick();

    // Clear editor decorations
    this.clearEditorDecorations();
  }

  /**
   * Refresh all open task views
   */
  async refreshOpenTaskListViews(): Promise<void> {
    const { workspace } = this.plugin.app;
    const leaves = workspace.getLeavesOfType(TaskListView.viewType);
    const tasks = this.plugin.getTasks();

    for (const leaf of leaves) {
      if (leaf.view instanceof TaskListView) {
        // Update the dropdown's task reference so it uses the latest tasks
        leaf.view.updateTasks(tasks);
        // Full refresh of the visible list
        leaf.view.refreshVisibleList();
      }
    }
  }
}
