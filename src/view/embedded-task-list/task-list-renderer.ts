import {
  Task,
  DEFAULT_COMPLETED_STATES,
  DEFAULT_ACTIVE_STATES,
  DEFAULT_PENDING_STATES,
} from '../../task';
import { TaskEditor } from '../task-editor';
import TodoTracker from '../../main';
import { TodoseqParameters } from './code-block-parser';
import { MarkdownView, Menu, WorkspaceLeaf, TFile, Platform } from 'obsidian';
import { getPluginSettings } from '../../utils/settings-utils';
import { truncateMiddle } from '../../utils/task-utils';
import { TAG_PATTERN } from '../../utils/patterns';
import { DateUtils } from '../../utils/date-utils';

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
   * @param totalTasksCount Total number of tasks before applying limit
   */
  renderTaskList(
    container: HTMLElement,
    tasks: Task[],
    params: TodoseqParameters,
    totalTasksCount?: number,
  ): void {
    // Clear existing content
    container.empty();

    // Create task list container
    const taskListContainer = container.createEl('div', {
      cls: 'embedded-task-list-container',
    });

    // Add title if provided
    if (params.title) {
      taskListContainer.createEl('div', {
        cls: 'embedded-task-list-title',
        text: params.title,
      });
    }

    // Add header with search/sort info (only if showQuery is not explicitly false)
    const showQueryHeader = params.showQuery !== false;
    const hasHeaderContent =
      showQueryHeader &&
      (params.searchQuery ||
        params.sortMethod !== 'default' ||
        params.completed !== undefined ||
        params.future !== undefined ||
        params.limit !== undefined);

    if (hasHeaderContent) {
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

      if (params.completed !== undefined) {
        header.createEl('span', {
          cls: 'embedded-task-list-completed',
          text: `Completed: ${params.completed}`,
        });
      }

      if (params.future !== undefined) {
        header.createEl('span', {
          cls: 'embedded-task-list-future',
          text: `Future: ${params.future}`,
        });
      }

      if (params.limit !== undefined) {
        header.createEl('span', {
          cls: 'embedded-task-list-limit',
          text: `Limit: ${params.limit}`,
        });
      }
    }

    // Add bottom border to title if there's no header and no task list border will be added
    if (params.title && !hasHeaderContent) {
      const titleEl = taskListContainer.querySelector(
        '.embedded-task-list-title',
      );
      if (titleEl) {
        titleEl.addClass('embedded-task-list-title-bordered');
      }
    }

    // Create task list
    const taskList = taskListContainer.createEl('ul', {
      cls: 'embedded-task-list',
    });

    // Render each task
    tasks.forEach((task, index) => {
      const taskItem = this.createTaskListItem(task, index, params);
      taskList.appendChild(taskItem);
    });

    // Add truncated indicator if results were limited
    if (
      params.limit &&
      totalTasksCount !== undefined &&
      totalTasksCount > params.limit
    ) {
      const truncatedIndicator = taskListContainer.createEl('div', {
        cls: 'embedded-task-list-truncated',
      });
      const moreTasksCount = totalTasksCount - params.limit;
      truncatedIndicator.textContent = `${moreTasksCount} more task${moreTasksCount > 1 ? 's' : ''} not shown`;
    }

    // Add empty state if no tasks
    if (tasks.length === 0) {
      const emptyState = taskListContainer.createEl('div', {
        cls: 'embedded-task-list-empty',
      });

      // Check if we should show scanning message
      // This includes both plugin scanning and Obsidian's internal index building
      const isScanning =
        this.plugin.vaultScanner?.shouldShowScanningMessage() ?? false;

      // Check if we're in initial load state (before first scan has started)
      // This prevents "No tasks found" from flashing before the scan begins
      const allTasks = this.plugin.vaultScanner?.getTasks() ?? [];
      const isInitialLoad = !isScanning && allTasks.length === 0;

      if (isScanning || isInitialLoad) {
        emptyState.createEl('div', {
          cls: 'embedded-task-list-empty-title',
          text: isScanning ? 'Scanning vault...' : 'Loading tasks...',
        });
        emptyState.createEl('div', {
          cls: 'embedded-task-list-empty-subtitle',
          text: isScanning
            ? 'Please wait while your tasks are being indexed'
            : 'Please wait while your vault is being indexed',
        });
      } else {
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
  }

  /**
   * Strip Markdown formatting to produce display-only plain text
   */
  private stripMarkdown(input: string): string {
    if (!input) return '';
    let out = input;

    // HTML tags - use DOMParser to safely strip HTML tags
    const doc = new DOMParser().parseFromString(out, 'text/html');
    out = doc.body.textContent || '';

    // Images: ![alt](url) -> alt
    out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');

    // Inline code: `code` -> code
    out = out.replace(/`([^`]+)`/g, '$1');

    // Headings
    out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '');

    // Emphasis/strong
    out = out.replace(/(\*\*|__)(.*?)\1/g, '$2');
    out = out.replace(/(\*|_)(.*?)\1/g, '$2');

    // Strike/highlight/math
    out = out.replace(/~~(.*?)~~/g, '$1');
    out = out.replace(/==(.*?)==/g, '$1');
    out = out.replace(/\$\$(.*?)\$\$/g, '$1');

    // Normalize whitespace
    out = out.replace(/\r/g, '');
    out = out.replace(/[ \t]+\n/g, '\n');
    out = out.replace(/\n{3,}/g, '\n\n');
    out = out.trim();

    return out;
  }

  // Render Obsidian-style links and tags as non-clickable, styled spans inside task text.
  // Supports:
  //  - Wiki links: [[Note]] and [[Note|Alias]]
  //  - Markdown links: [Alias](url-or-path)
  //  - Bare URLs: http(s)://...
  //  - Tags: #tag
  private renderTaskTextWithLinks(text: string, parent: HTMLElement) {
    // For display only, strip any markdown formatting first
    const textToProcess = this.stripMarkdown(text) || '';
    const patterns: { type: 'wiki' | 'md' | 'url' | 'tag'; regex: RegExp }[] = [
      // [[Page]] or [[Page|Alias]]
      { type: 'wiki', regex: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g },
      // [Alias](target) - improved regex to handle brackets in link text
      { type: 'md', regex: /\[([^\]]*(?:\[[^\]]*\][^\]]*)*)\]\(([^)]+)\)/g },
      // bare URLs
      { type: 'url', regex: /\bhttps?:\/\/[^\s)]+/g },
      // #tags (must come after URLs to avoid conflicts with URLs containing #)
      { type: 'tag', regex: TAG_PATTERN },
    ];

    let i = 0;
    while (i < textToProcess.length) {
      let nextMatch: {
        type: 'wiki' | 'md' | 'url' | 'tag';
        match: RegExpExecArray;
      } | null = null;

      for (const p of patterns) {
        p.regex.lastIndex = i;
        const m = p.regex.exec(textToProcess);
        if (m) {
          if (!nextMatch || m.index < nextMatch.match.index) {
            nextMatch = { type: p.type, match: m };
          }
        }
      }

      if (!nextMatch) {
        // Append any remaining text
        parent.appendText(textToProcess.slice(i));
        break;
      }

      // Append plain text preceding the match
      if (nextMatch.match.index > i) {
        parent.appendText(textToProcess.slice(i, nextMatch.match.index));
      }

      // Create appropriate styled element based on type
      if (nextMatch.type === 'tag') {
        // Create a tag-like span using our custom tag styling
        const span = parent.createEl('span', { cls: 'embedded-task-tag' });
        const tagName = nextMatch.match[0]; // Full #tag text including #
        span.setText(tagName);
        span.setAttribute('title', tagName);
      } else {
        // Create a non-interactive, link-like span for other types
        const span = parent.createEl('span', {
          cls: 'embedded-task-link-like',
        });

        if (nextMatch.type === 'wiki') {
          const target = nextMatch.match[1];
          const alias = nextMatch.match[2];
          span.setText(alias ?? target);
          span.setAttribute('title', target);
        } else if (nextMatch.type === 'md') {
          const label = nextMatch.match[1];
          const url = nextMatch.match[2];
          span.setText(label);
          span.setAttribute('title', url);
        } else {
          const url = nextMatch.match[0];
          span.setText(url);
          span.setAttribute('title', url);
        }
      }

      // Advance past the match
      i = nextMatch.match.index + nextMatch.match[0].length;
    }
  }

  /**
   * Determine the date category for a task based on its scheduled and deadline dates
   * @param task The task to analyze
   * @returns Date category: 'overdue', 'today', 'soon', 'later', or 'none'
   */
  private getDateCategory(
    task: Task,
  ): 'overdue' | 'today' | 'soon' | 'later' | 'none' {
    const now = new Date();
    const today = this.getDateOnly(now);

    // Get the earliest date if both exist, or the single available date
    let targetDate: Date | null = null;

    if (task.scheduledDate && task.deadlineDate) {
      targetDate =
        task.scheduledDate < task.deadlineDate
          ? task.scheduledDate
          : task.deadlineDate;
    } else if (task.scheduledDate) {
      targetDate = task.scheduledDate;
    } else if (task.deadlineDate) {
      targetDate = task.deadlineDate;
    }

    // If no dates, return 'none'
    if (!targetDate) {
      return 'none';
    }

    const target = this.getDateOnly(targetDate);

    // Check if overdue (before today)
    if (target < today) {
      return 'overdue';
    }

    // Check if due today
    if (target.getTime() === today.getTime()) {
      return 'today';
    }

    // Check if due soon (within next 7 days)
    const soonDate = this.getDateOnly(
      new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    );
    if (target <= soonDate) {
      return 'soon';
    }

    // Otherwise, it's later
    return 'later';
  }

  /**
   * Get date only (time part set to 00:00:00.000)
   * @param date The date to normalize
   * @returns A new Date object at midnight of the same day
   */
  private getDateOnly(date: Date): Date {
    return DateUtils.getDateOnly(date);
  }

  /**
   * Create a single task list item element
   * @param task The task to render
   * @param index The index of the task in the list
   * @param params Code block parameters
   * @returns HTML list item element
   */
  private createTaskListItem(
    task: Task,
    index: number,
    params: TodoseqParameters,
  ): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'embedded-task-item';

    // Apply date-based background styling if the task has scheduled or deadline dates
    const dateCategory = this.getDateCategory(task);
    if (dateCategory !== 'none') {
      li.classList.add(`embedded-task-item-date-${dateCategory}`);
    }

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
    stateSpan.setAttribute('role', 'button');
    stateSpan.setAttribute('tabindex', '0');
    stateSpan.setAttribute('aria-checked', String(task.completed));

    // Right-click to open state selection menu
    stateSpan.addEventListener('contextmenu', (evt: MouseEvent) => {
      this.openStateMenuAtMouseEvent(task, evt);
    });

    // Long-press for mobile
    let touchTimer: number | null = null;
    let suppressNextContextMenu = false;

    stateSpan.addEventListener(
      'touchstart',
      (evt: TouchEvent) => {
        if (evt.touches.length !== 1) return;
        const touch = evt.touches[0];
        suppressNextContextMenu = true;
        touchTimer = window.setTimeout(() => {
          const x = touch.clientX;
          const y = touch.clientY;
          this.openStateMenuAtPosition(task, { x, y });
        }, 450);
      },
      { passive: true },
    );

    const clearTouch = () => {
      if (touchTimer) {
        window.clearTimeout(touchTimer);
        touchTimer = null;
      }
      window.setTimeout(() => {
        suppressNextContextMenu = false;
      }, 250);
    };

    stateSpan.addEventListener('touchend', clearTouch, { passive: true });
    stateSpan.addEventListener('touchcancel', clearTouch, { passive: true });

    // Prevent duplicate context menu on Android
    stateSpan.addEventListener('contextmenu', (evt: MouseEvent) => {
      if (suppressNextContextMenu) {
        evt.preventDefault();
        evt.stopPropagation();
        return;
      }
      this.openStateMenuAtMouseEvent(task, evt);
    });

    textContainer.appendChild(stateSpan);

    // Create priority indicator if present
    if (task.priority) {
      const pri = task.priority; // 'high' | 'med' | 'low'
      const prioritySpan = document.createElement('span');
      prioritySpan.className = ['priority-badge', `priority-${pri}`].join(' ');
      prioritySpan.textContent =
        pri === 'high' ? 'A' : pri === 'med' ? 'B' : 'C';
      prioritySpan.setAttribute('aria-label', `Priority ${pri}`);
      prioritySpan.setAttribute('title', `Priority ${pri}`);
      textContainer.appendChild(prioritySpan);
    }

    // Create task text if present
    if (task.text) {
      const textSpan = document.createElement('span');
      textSpan.className = 'embedded-task-text';
      if (textContainer.children.length > 0) {
        textSpan.appendText(' ');
      }
      this.renderTaskTextWithLinks(task.text, textSpan);
      textContainer.appendChild(textSpan);
    }

    // Create file info if show-file is not explicitly false
    if (params.showFile !== false) {
      const fileInfo = document.createElement('div');
      fileInfo.className = 'embedded-task-file-info';
      const fileName = task.path.split('/').pop() || task.path;
      // Strip .md extension from display name
      const displayName = fileName.replace(/\.md$/, '');
      const displayText = `${displayName}:${task.line + 1}`;
      // Apply middle truncation with 23 character limit
      fileInfo.textContent = truncateMiddle(displayText, 32);
      fileInfo.setAttribute('title', task.path);

      // Assemble the item
      li.appendChild(checkbox);
      li.appendChild(textContainer);
      li.appendChild(fileInfo);
    } else {
      // Assemble the item without file info
      li.appendChild(checkbox);
      li.appendChild(textContainer);
    }

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
        await this.updateTaskState(task, newState);
      } catch (error) {
        console.error('Error updating task state:', error);
        // Revert checkbox on error
        checkbox.checked = !checkbox.checked;
      }
    });

    // Click handler for navigation (excluding checkbox)
    li.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        this.navigateToTask(task, e);
      }
    });
  }

  /**
   * Return default keyword sets (non-completed and completed) and additional keywords using constants from task.ts
   */
  private getKeywordSets(): {
    pendingActive: string[];
    completed: string[];
    additional: string[];
  } {
    const pendingActiveDefaults = [
      ...Array.from(DEFAULT_PENDING_STATES),
      ...Array.from(DEFAULT_ACTIVE_STATES),
    ];
    const completedDefaults = Array.from(DEFAULT_COMPLETED_STATES);

    const settings = getPluginSettings(this.plugin.app);
    const configured = settings?.additionalTaskKeywords;
    const additional = Array.isArray(configured)
      ? configured.filter(
          (v): v is string => typeof v === 'string' && v.length > 0,
        )
      : [];

    return {
      pendingActive: pendingActiveDefaults,
      completed: completedDefaults,
      additional,
    };
  }

  /**
   * Build the list of selectable states for the context menu, excluding the current state
   * @param current Current task state
   */
  private getSelectableStatesForMenu(
    current: string,
  ): { group: string; states: string[] }[] {
    const { pendingActive, completed, additional } = this.getKeywordSets();

    const dedupe = (arr: string[]) => Array.from(new Set(arr));
    const nonCompleted = dedupe([...pendingActive, ...additional]);
    const completedOnly = dedupe(completed);

    // Present two groups: Non-completed and Completed
    const groups: { group: string; states: string[] }[] = [
      {
        group: 'Not completed',
        states: nonCompleted.filter((s) => s && s !== current),
      },
      {
        group: 'Completed',
        states: completedOnly.filter((s) => s && s !== current),
      },
    ];
    return groups.filter((g) => g.states.length > 0);
  }

  /**
   * Open Obsidian Menu at a specific screen position
   * @param task The task to update
   * @param pos The position to show the menu
   */
  private openStateMenuAtPosition(
    task: Task,
    pos: { x: number; y: number },
  ): void {
    const menu = new Menu();
    const groups = this.getSelectableStatesForMenu(task.state);

    for (const g of groups) {
      menu.addItem((item) => {
        item.setTitle(g.group);
        item.setDisabled(true);
      });
      for (const state of g.states) {
        menu.addItem((item) => {
          item.setTitle(state);
          item.onClick(async () => {
            await this.updateTaskState(task, state);
          });
        });
      }
      menu.addSeparator();
    }
    menu.showAtPosition({ x: pos.x, y: pos.y });
  }

  /**
   * Open Obsidian Menu at mouse event location listing default and additional keywords (excluding current)
   * @param task The task to update
   * @param evt The mouse event
   */
  private openStateMenuAtMouseEvent(task: Task, evt: MouseEvent): void {
    evt.preventDefault();
    evt.stopPropagation();
    const menu = new Menu();
    const groups = this.getSelectableStatesForMenu(task.state);

    for (const g of groups) {
      // Section header (disabled item)
      menu.addItem((item) => {
        item.setTitle(g.group);
        item.setDisabled(true);
      });
      for (const state of g.states) {
        menu.addItem((item) => {
          item.setTitle(state);
          item.onClick(async () => {
            await this.updateTaskState(task, state);
          });
        });
      }
      // Divider between groups when both exist
      menu.addSeparator();
    }

    // Prefer API helper when available; fallback to explicit coordinates
    const maybeShowAtMouseEvent = (
      menu as unknown as { showAtMouseEvent?: (e: MouseEvent) => void }
    ).showAtMouseEvent;
    if (typeof maybeShowAtMouseEvent === 'function') {
      maybeShowAtMouseEvent.call(menu, evt);
    } else {
      menu.showAtPosition({ x: evt.clientX, y: evt.clientY });
    }
  }

  /**
   * Update task state with proper error handling
   * @param task The task to update
   * @param newState The new state
   */
  private async updateTaskState(task: Task, newState: string): Promise<void> {
    try {
      // Update task state using existing TaskEditor
      // Use forceVaultApi=true to prevent focus from jumping to the source task
      await this.taskEditor.updateTaskState(task, newState, true);

      // Update the task in the plugin's task list
      this.updateTaskInPlugin(task, newState);
    } catch (error) {
      console.error('Error updating task state:', error);
    }
  }

  /**
   * Navigate to the task's location in the vault with smart tab management
   * @param task The task to navigate to
   * @param evt The mouse event to determine click behavior
   */
  private navigateToTask(task: Task, evt?: MouseEvent): void {
    try {
      const { workspace } = this.plugin.app;
      const isMac = Platform.isMacOS;
      const isMiddle = evt?.button === 1;
      const metaOrCtrl = isMac ? evt?.metaKey : evt?.ctrlKey;

      const file = this.plugin.app.vault.getAbstractFileByPath(task.path);
      if (!(file instanceof TFile)) return;

      // Helper functions
      const isMarkdownLeaf = (
        leaf: WorkspaceLeaf | null | undefined,
      ): boolean => {
        if (!leaf) return false;
        if (leaf.view instanceof MarkdownView) return true;
        return leaf.view?.getViewType?.() === 'markdown';
      };

      const isTodoSeqLeaf = (
        leaf: WorkspaceLeaf | null | undefined,
      ): boolean => {
        if (!leaf) return false;
        return leaf.view?.getViewType() === 'todoseq';
      };

      const findExistingLeafForFile = (): WorkspaceLeaf | null => {
        const leaves = workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
          if (isTodoSeqLeaf(leaf)) continue;
          if (leaf.view instanceof MarkdownView) {
            const openFile = leaf.view.file;
            if (openFile && openFile.path === file.path) {
              return leaf;
            }
          }
        }
        return null;
      };

      const forceNewTab = isMiddle || metaOrCtrl;
      const doSplit = evt?.shiftKey;

      let targetLeaf: WorkspaceLeaf | null = null;

      // Shift-click: Always open new tab in split pane, even if already open
      if (doSplit) {
        targetLeaf = workspace.getLeaf('split');
        // For shift-click, we should ALWAYS use the split leaf, even if it's not perfect
        // Don't fall back to existing leaves - this ensures the page opens in the split
      }
      // Cmd/Ctrl-click: Always open new tab, even if page is already open
      else if (forceNewTab) {
        targetLeaf = workspace.getLeaf('tab');
        // For cmd/ctrl-click, we should ALWAYS use the new tab, even if it's not perfect
        // Don't fall back to existing leaves - this ensures the page opens in the new tab
      }
      // Default click: Order of preference
      // 1. Bring page into focus if already open
      // 2. Reuse existing open tab to display new page
      // 3. Open in current active tab if it's markdown
      // 4. Open new tab if no pages already open
      else {
        const currentActiveLeaf = workspace.activeLeaf;
        const isCurrentActiveMarkdown =
          currentActiveLeaf && isMarkdownLeaf(currentActiveLeaf);

        // Priority 1: If file is already open, focus it
        const existingLeafForFile = findExistingLeafForFile();
        if (existingLeafForFile) {
          targetLeaf = existingLeafForFile;
        }
        // Priority 2: Reuse existing markdown leaf (any leaf, not just same file)
        else {
          const allLeaves = workspace.getLeavesOfType('markdown');
          for (const leaf of allLeaves) {
            if (isMarkdownLeaf(leaf) && !isTodoSeqLeaf(leaf)) {
              targetLeaf = leaf;
              break;
            }
          }
          // Priority 3: If current active tab is markdown, use it
          if (!targetLeaf && isCurrentActiveMarkdown) {
            targetLeaf = currentActiveLeaf;
          }
          // Priority 4: Create new tab
          if (!targetLeaf) {
            targetLeaf = workspace.getLeaf('tab');
            // Guard against TODOseq leaf
            if (isTodoSeqLeaf(targetLeaf)) {
              const allLeaves = workspace.getLeavesOfType('markdown');
              for (const leaf of allLeaves) {
                if (isMarkdownLeaf(leaf) && !isTodoSeqLeaf(leaf)) {
                  targetLeaf = leaf;
                  break;
                }
              }
              // If still no good leaf, create regular tab
              if (isTodoSeqLeaf(targetLeaf) || !isMarkdownLeaf(targetLeaf)) {
                targetLeaf = workspace.getLeaf('tab');
              }
            }
          }
        }
      }

      // Open the file in the target leaf
      targetLeaf.openFile(file).then(() => {
        // Focus the editor and move cursor to the task line with highlighting
        setTimeout(() => {
          const activeView = workspace.getActiveViewOfType(MarkdownView);
          if (activeView && activeView.editor) {
            const lineContent = activeView.editor.getLine(task.line);
            const pos = { line: task.line, ch: lineContent.length };

            // Set cursor position
            activeView.editor.setCursor(pos);

            // Try to set ephemeral state for better navigation
            try {
              (
                activeView as MarkdownView & {
                  setEphemeralState?: (state: {
                    line: number;
                    col: number;
                  }) => void;
                }
              ).setEphemeralState?.({
                line: task.line,
                col: lineContent.length,
              });
            } catch (_) {
              // Ignore if ephemeral state is not available
            }

            // Scroll into view with highlighting
            activeView.editor.scrollIntoView({ from: pos, to: pos }, true);

            // Focus the editor
            activeView.editor.focus();
          }
        }, 100);
      });

      // Reveal the leaf to ensure proper focus
      workspace.revealLeaf(targetLeaf);
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

      // Trigger refresh of all task list views, including embedded ones
      this.plugin.refreshAllTaskListViews();
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
