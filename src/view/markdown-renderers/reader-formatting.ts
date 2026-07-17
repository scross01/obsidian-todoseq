import TodoTracker from '../../main';
import { Task } from '../../types/task';
import { TaskParser } from '../../parser/task-parser';
import { VaultScanner } from '../../services/vault-scanner';
import { stripMarkdownForDisplay } from '../../utils/task-utils';
import { KeywordManager } from '../../utils/keyword-manager';
import {
  createSettingsChangeDetector,
  SettingsChangeDetector,
} from '../../utils/settings-utils';
import { PRIORITY_TOKEN_REGEX } from '../../utils/patterns';
import { getPriorityLevelName } from '../../utils/task-format';
import { MarkdownPostProcessorContext, TFile, setTooltip } from 'obsidian';
import { StateMenuBuilder } from '../components/state-menu-builder';
import { getStateTransitionManager } from '../../services/task-update-coordinator';

/**
 * Cached regex for priority tokens with global flag.
 * Created once at module load time to avoid repeated compilation.
 */
const PRIORITY_TOKEN_REGEX_GLOBAL = new RegExp(
  PRIORITY_TOKEN_REGEX.source,
  'g',
);

/**
 * Handles task keyword formatting in the reader view
 * Applies styling to task keywords, SCHEDULED, and DEADLINE lines
 */
export class ReaderViewFormatter {
  private settingsDetector: SettingsChangeDetector;
  private menuBuilder: StateMenuBuilder;

  // Per-callback cache of source-file lines keyed by `context.sourcePath`.
  // Cleared at the top of every markdown post-processor invocation so that
  // file reads are amortized across all metadata paragraphs and date
  // paragraphs in the same render pass.
  private readonly sourceLinesCache: Map<string, string[]> = new Map();

  // Double-click detection state
  private lastClickTime = 0;
  private lastClickedElement: HTMLElement | null = null;
  private pendingClickTimeout: number | null = null;
  private readonly DOUBLE_CLICK_THRESHOLD = 300; // ms

  constructor(
    private plugin: TodoTracker,
    private vaultScanner: VaultScanner,
  ) {
    // Initialize settings change detector
    this.settingsDetector = createSettingsChangeDetector(this.plugin.settings);

    // Initialize menu builder for state selection dropdown
    this.menuBuilder = new StateMenuBuilder(this.plugin);
  }

  /**
   * Get the shared task parser from VaultScanner
   */
  private getTaskParser(): TaskParser | null {
    return this.vaultScanner.getParser();
  }

  /**
   * Create a keyword span element with proper attributes using Obsidian DOM helpers
   * All keywords use the same styling - no group-based CSS classes
   * @param keyword - The keyword text to display
   * @param isCompleted - Whether the keyword is a completed keyword (for strikethrough styling)
   * @param isArchived - Whether the keyword is an archived keyword (for muted styling)
   */
  private createKeywordSpan(
    keyword: string,
    isCompleted = false,
    isArchived = false,
  ): HTMLSpanElement {
    let cssClasses = 'todoseq-keyword-formatted';
    if (isArchived) {
      cssClasses += ' todoseq-archived-keyword';
    } else if (isCompleted) {
      cssClasses += ' todoseq-completed-keyword';
    }
    const span = createSpan({
      cls: cssClasses,
      text: keyword,
      attr: {
        'data-task-keyword': keyword,
        'aria-label': `Task keyword: ${keyword}`,
        role: 'mark',
        tabindex: '0',
      },
    });
    return span;
  }

  /**
   * Create a task container span element using Obsidian DOM helpers
   */
  private createTaskContainer(): HTMLSpanElement {
    return createSpan({ cls: 'todoseq-task' });
  }

  /**
   * Create a completed task container span element using Obsidian DOM helpers
   */
  private createCompletedTaskContainer(): HTMLSpanElement {
    return createSpan({
      cls: 'todoseq-completed-task-text',
      attr: {
        'data-completed-task': 'true',
      },
    });
  }

  /**
   * Create an archived task container span element using Obsidian DOM helpers
   */
  private createArchivedTaskContainer(): HTMLSpanElement {
    return createSpan({
      cls: 'todoseq-archived-task-text',
      attr: {
        'data-archived-task': 'true',
      },
    });
  }

  /**
   * Get all valid task keywords (default + user-defined)
   * Uses the KeywordManager from VaultScanner to ensure consistency
   * between rendering and task-finding operations.
   */
  private getAllTaskKeywords(): string[] {
    // Use the KeywordManager from VaultScanner to ensure consistency
    const keywordManager = this.vaultScanner.getKeywordManager();
    return keywordManager.getAllKeywords();
  }

  /**
   * Ensure the task parser is up to date with current settings
   * Uses SettingsChangeDetector to detect when settings that affect
   * task formatting have changed, consistent with the editor formatter.
   */
  private ensureParserUpToDate(): void {
    // Check if settings have changed using the change detector
    if (this.settingsDetector.hasChanged(this.plugin.settings)) {
      // Update the previous state to match current settings
      this.settingsDetector.markCurrent(this.plugin.settings);
    }
  }

  /**
   * Register the markdown post processor for reader view formatting
   */
  registerPostProcessor(): void {
    this.plugin.registerMarkdownPostProcessor(async (element, context) => {
      if (!this.plugin.settings.formatTaskKeywords) {
        return;
      }

      // Clear any stale cache from a previous post-processor invocation
      // before reading the source file for the new render pass.
      this.sourceLinesCache.clear();

      // Check if we need to update the parser (e.g., if settings changed)
      this.ensureParserUpToDate();

      // Process task keywords in the rendered content
      this.processTaskKeywords(element);

      // Process priority pills in task lines
      this.processPriorityPills(element);

      // Process SCHEDULED and DEADLINE lines. May need to consult the source
      // file (via context) to find a preceding task when Obsidian chunked the
      // rendered DOM such that the heading task and the metadata paragraph
      // are in separate post-processor invocations (close+reopen path).
      try {
        await this.processDateLines(element, context);

        // Process DESCRIPTION lines. Same chunked-render caveat as above.
        await this.processDescriptionLines(element, context);
      } catch (error) {
        // Don't let a failed async source-file read tear down the rest of
        // the post-processor — checkbox / keyword handlers must still
        // attach so the user can still interact with the rendered task.
        console.debug(
          '[TODOseq] Source-file fallback in markdown post-processor failed:',
          error,
        );
      }

      // Attach checkbox click handlers for task state toggling
      this.attachCheckboxClickHandlers(element, context);

      // Attach keyword click handlers for task state toggling and context menu
      this.attachKeywordClickHandlers(element, context);
    });
  }

  /**
   * Attach click event handlers to checkboxes for task state toggling
   */
  private attachCheckboxClickHandlers(
    element: HTMLElement,
    context: { sourcePath: string },
  ): void {
    const checkboxes = element.querySelectorAll('.task-list-item-checkbox');

    checkboxes.forEach((checkbox) => {
      if (!checkbox.instanceOf(HTMLElement)) {
        return;
      }
      // Check if this checkbox is inside an embedded transclusion
      const embed = checkbox.closest('.internal-embed');
      if (embed) {
        // For embedded content, get the source from the embed element
        const src = embed.getAttribute('src');
        if (src) {
          // Extract file path from src (format: "filename.md#^blockid" or "filename.md")
          const filePath = src.split('#')[0];
          if (filePath) {
            // Use registerDomEvent for automatic cleanup
            this.plugin.registerDomEvent(checkbox, 'click', (event: Event) => {
              void this.handleCheckboxClick(event, filePath);
            });
            return;
          }
        }
      }
      // Use registerDomEvent for automatic cleanup
      this.plugin.registerDomEvent(checkbox, 'click', (event: Event) => {
        void this.handleCheckboxClick(event, context.sourcePath);
      });
    });
  }

  /**
   * Handle checkbox click event to toggle task state
   */
  private async handleCheckboxClick(
    event: Event,
    sourcePath: string,
  ): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const isChecked = checkbox.checked;
    // Find the task list item containing this checkbox
    const taskListItem = checkbox.closest('.task-list-item');
    if (!taskListItem) {
      return;
    }

    // Get the file
    const file = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) {
      return;
    }

    // Check if this is a checkbox-only subtask (no keyword)
    // These have no .todoseq-keyword-formatted child element
    const keywordSpan = taskListItem.querySelector(
      '.todoseq-keyword-formatted',
    );
    if (!keywordSpan) {
      // This is a checkbox-only subtask - handle with optimistic update
      const lineAttr = taskListItem.getAttribute('data-line');
      if (lineAttr !== null) {
        const lineNumber = parseInt(lineAttr, 10);

        // Read file to get line content and extract indent
        try {
          const content = await this.plugin.app.vault.read(file);
          const lines = content.split('\n');
          if (lineNumber >= 0 && lineNumber < lines.length) {
            const lineContent = lines[lineNumber];
            const indentMatch = lineContent.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1] : '';

            // wasCompleted is opposite of the new checkbox state
            // (if checkbox is now checked, task was NOT completed before)
            const wasCompleted = !isChecked;

            // Update parent subtask counts optimistically for immediate UI
            this.plugin.taskStateManager.updateParentSubtaskCountsForCheckbox(
              sourcePath,
              lineNumber,
              indent,
              wasCompleted,
              isChecked,
              true,
            );
          }
        } catch (error) {
          console.debug(
            '[TODOseq] Failed to read file for checkbox-only subtask update:',
            error,
          );
        }
      }
      return; // Let Obsidian handle the file update
    }

    // Find the task associated with this checkbox (for tasks with keywords)
    const task = await this.findTaskForCheckbox(taskListItem, file);
    if (!task) {
      return;
    }

    // CRITICAL: Get fresh task from state manager to ensure we have latest data
    // The task object may be stale (e.g., old rawText)
    const freshTask = this.plugin.taskStateManager.findTaskByPathAndLine(
      task.path,
      task.line,
      task.tableCell?.cellIndex,
    );
    // Use fresh task if found, otherwise fall back to captured task
    const taskToUpdate = freshTask || task;

    const stateManager = getStateTransitionManager(
      this.plugin.taskUpdateCoordinator,
      this.plugin.keywordManager,
      this.plugin.settings?.stateTransitions,
    );

    let newState: string | null = null;
    if (isChecked) {
      newState = stateManager.getNextCompletedOrArchivedState(
        taskToUpdate.state,
      );
    } else {
      newState = stateManager.getNextState(taskToUpdate.state);
      if (newState === taskToUpdate.state) {
        checkbox.checked = true;
        return;
      }
    }

    // If no state change, don't proceed
    if (newState === taskToUpdate.state) {
      return;
    }

    // Use unified updateTaskByPath method - handles fresh lookup, optimistic update,
    // file write, recurrence, line adjustment, and UI refresh
    if (this.plugin.taskUpdateCoordinator) {
      await this.plugin.taskUpdateCoordinator.updateTaskByPath(
        taskToUpdate.path,
        taskToUpdate.line,
        newState,
        'reader',
        taskToUpdate.tableCell?.cellIndex,
      );
    } else if (this.plugin.taskEditor) {
      // Fallback to TaskEditor if coordinator not available
      await this.plugin.taskEditor.updateTaskState(
        taskToUpdate,
        newState,
        true,
      );
    }

    // Refresh the reader view to show changes (like CLOSED date line added/removed)
    if (this.plugin.refreshReaderViewFormatter) {
      this.plugin.refreshReaderViewFormatter();
    }
  }

  /**
   * Find the task associated with a checkbox element
   */
  private async findTaskForCheckbox(
    taskListItem: Element,
    file: TFile,
  ): Promise<Task | null> {
    // Get the text content of the task list item
    // Note: textContent includes the checkbox state character which we need to handle
    const taskText = taskListItem.textContent || '';

    // Read the file content to find the matching line
    const content = await this.plugin.app.vault.read(file);
    const lines = content.split('\n');

    // Get the task parser
    const taskParser = this.getTaskParser();
    if (!taskParser) {
      return null;
    }

    // Parse all tasks in the file
    const allTasks = taskParser.parseFile(content, file.path, file);

    // The rendered text doesn't include the checkbox marker (- [ ] or - [x])
    // It also doesn't include block reference IDs (^reference)
    // But it DOES include date lines (CLOSED, SCHEDULED, DEADLINE) as part of the task text
    // We need to remove these date lines when matching against file lines
    let normalizedTaskText = taskText.trim().replace(/\s+/g, ' ');

    // Remove date lines from taskText (CLOSED, SCHEDULED, DEADLINE lines)
    // These are rendered on separate lines in the preview but are NOT part of the actual task line
    normalizedTaskText = normalizedTaskText
      .replace(/\s*CLOSED:.*$/im, '')
      .replace(/\s*SCHEDULED:.*$/im, '')
      .replace(/\s*DEADLINE:.*$/im, '')
      .trim();

    // Find the line that matches this task
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (taskParser.testRegex.test(line)) {
        // For checkbox tasks, the line format is: "- [ ] TODO text" or "- [x] TODO text"
        // We need to compare just the task part (after the checkbox)
        // Also remove any block reference ID (^reference) from the end
        const normalizedLine = line
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/\s*\^[a-zA-Z0-9-]+$/, '');

        // Check if the line ends with the task text
        // The rendered text is just the task content without the checkbox prefix or block reference
        if (normalizedLine.endsWith(normalizedTaskText)) {
          // The Task.line property is 0-indexed (line index), matching the array index
          const matchingTask = allTasks.find((t) => t.line === i);
          if (matchingTask) {
            return matchingTask;
          }
        }
      }
    }

    return null;
  }

  /**
   * Process task keywords in the rendered HTML
   * Finds all task formats and applies formatting to keywords
   */
  private processTaskKeywords(element: HTMLElement): void {
    const taskParser = this.getTaskParser();
    if (!taskParser) {
      console.warn(
        'Task parser not initialized, skipping task keyword processing',
      );
      return;
    }

    // Check if we should skip quote/callout blocks
    const includeCalloutBlocks =
      this.plugin.settings?.includeCalloutBlocks ?? true;

    // Process task list items with checkboxes (checking each individually for quote/callout context)
    this.processTaskListItems(element, includeCalloutBlocks);

    // Process regular paragraphs with task keywords (checking each individually for quote/callout context)
    this.processRegularParagraphs(element, includeCalloutBlocks);

    // Process heading elements with task keywords (h1-h6)
    this.processHeadings(element, includeCalloutBlocks);

    // Process bullet list items without checkboxes (checking each individually for quote/callout context)
    this.processBulletListItems(element, includeCalloutBlocks);

    // Process table cells with task keywords (experimental)
    if (this.plugin.settings?.experimentalTableTasks) {
      this.processTableCells(element);
    }
  }

  /**
   * Check if an element is inside a quote or callout block
   */
  private isInQuoteOrCalloutBlock(element: HTMLElement): boolean {
    let current: HTMLElement | null = element;

    while (current) {
      // Check if this is a blockquote element
      if (current.tagName === 'BLOCKQUOTE') {
        return true;
      }

      // Check for callout-specific classes
      if (
        current.classList?.contains('callout') ||
        current.classList?.contains('admonition')
      ) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  /**
   * Process task list items with checkboxes
   */
  private processTaskListItems(
    element: HTMLElement,
    includeCalloutBlocks: boolean,
  ): void {
    const taskElements = element.querySelectorAll('.task-list-item');

    taskElements.forEach((taskElement) => {
      // Skip if element is inside an embedded task list container
      if (taskElement.closest('.todoseq-embedded-task-list-container')) {
        return;
      }

      // Skip if quote/callout blocks are disabled and this element is inside one
      if (
        !includeCalloutBlocks &&
        taskElement.instanceOf(HTMLElement) &&
        this.isInQuoteOrCalloutBlock(taskElement)
      ) {
        return;
      }

      const taskParagraph = taskElement.querySelector('p');

      // Get keyword from the formatted keyword element (needed for checkbox styling)
      let keyword: string | null = null;
      if (taskElement.instanceOf(HTMLElement)) {
        const keywordSpan = taskElement.querySelector(
          '.todoseq-keyword-formatted',
        );
        keyword = keywordSpan?.getAttribute('data-task-keyword') || null;
      }

      if (taskParagraph) {
        // Process tasks with paragraph elements (standard case)
        this.processParagraphForTasks(taskParagraph);
      } else if (taskElement.instanceOf(HTMLElement)) {
        // Process tasks without paragraph elements (direct text in li)
        this.processTaskListItemDirectly(taskElement);
      }

      // Add data-task attribute and checked state for checkbox styling
      // This allows CSS to apply the TODOseq active task style or theme styles
      if (taskElement.instanceOf(HTMLElement)) {
        const checkbox: HTMLInputElement | null = taskElement.querySelector(
          '.task-list-item-checkbox',
        );
        if (checkbox && keyword) {
          const keywordManager = this.vaultScanner.getKeywordManager();
          if (keywordManager) {
            const settings = keywordManager.getSettings();
            let dataTaskChar: string;
            if (settings.useExtendedCheckboxStyles) {
              // Theme handles styling via :checked + data-task selectors
              dataTaskChar = keywordManager.getCheckboxState(keyword, settings);
              checkbox.checked = dataTaskChar !== ' ';
            } else {
              // Default behavior: use standard checkbox states
              // For active keywords, use '/' so CSS can apply active styling
              if (keywordManager.isActive(keyword)) {
                dataTaskChar = '/';
              } else if (keywordManager.isCompleted(keyword)) {
                dataTaskChar = 'x';
              } else {
                dataTaskChar = ' ';
              }
              // Keep checked state based on the task's completed status
              checkbox.checked = checkbox.defaultChecked;
            }
            checkbox.setAttribute('data-task', dataTaskChar);
            // Also set data-task on the parent <li> element for theme compatibility.
            // Obsidian natively sets data-task on both <li> and <input>. Some themes
            // (Iridium, Velocity) target li[data-task] or [data-task] ancestor selectors
            // rather than input[data-task] directly (like Border does).
            taskElement.setAttribute('data-task', dataTaskChar);
          }
        }
      }
    });
  }

  /**
   * Process regular paragraphs with task keywords
   */
  private processRegularParagraphs(
    element: HTMLElement,
    includeCalloutBlocks: boolean,
  ): void {
    const paragraphs = element.querySelectorAll('p:not(.task-list-item p)');

    paragraphs.forEach((paragraph) => {
      // Skip if element is inside an embedded task list container
      if (paragraph.closest('.todoseq-embedded-task-list-container')) {
        return;
      }

      if (paragraph.instanceOf(HTMLElement)) {
        // Skip if quote/callout blocks are disabled and this paragraph is inside one
        if (!includeCalloutBlocks && this.isInQuoteOrCalloutBlock(paragraph)) {
          return;
        }
        this.processParagraphForTasks(paragraph);
      }
    });
  }

  /**
   * Process heading elements (h1-h6) with task keywords
   * Headings containing task keywords should be styled with the heading font size
   */
  private processHeadings(
    element: HTMLElement,
    includeCalloutBlocks: boolean,
  ): void {
    const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');

    headings.forEach((heading) => {
      // Skip if element is inside an embedded task list container
      if (heading.closest('.todoseq-embedded-task-list-container')) {
        return;
      }

      if (heading.instanceOf(HTMLElement)) {
        // Skip if quote/callout blocks are disabled and this heading is inside one
        if (!includeCalloutBlocks && this.isInQuoteOrCalloutBlock(heading)) {
          return;
        }
        this.processParagraphForTasks(heading);
      }
    });
  }

  /**
   * Process bullet list items without checkboxes
   * Handles various list formats including:
   * - Indented bullets (with leading spaces)
   * - Different bullet markers (-, *, +)
   * - Numbered lists (1., 2), a., A))
   * - Letter lists (a., b., A), B))
   */
  private processBulletListItems(
    element: HTMLElement,
    includeCalloutBlocks: boolean,
  ): void {
    const listItems = element.querySelectorAll('li:not(.task-list-item)');

    listItems.forEach((listItem) => {
      // Skip if element is inside an embedded task list container
      if (listItem.closest('.todoseq-embedded-task-list-container')) {
        return;
      }

      // Skip if quote/callout blocks are disabled and this list item is inside one
      if (
        !includeCalloutBlocks &&
        listItem.instanceOf(HTMLElement) &&
        this.isInQuoteOrCalloutBlock(listItem)
      ) {
        return;
      }

      if (!listItem.instanceOf(HTMLElement)) {
        return;
      }

      // Try to find a paragraph first (standard case)
      const paragraph = listItem.querySelector('p');
      if (paragraph instanceof HTMLElement) {
        this.processParagraphForTasks(paragraph);
        return;
      }

      // Handle list items without paragraphs (direct text content)
      // This is common for simple bullet items like:
      // <li><span class="list-bullet"></span>TODO task text</li>
      this.processListItemDirectly(listItem);
    });
  }

  /**
   * Process table cells with task keywords (experimental).
   * Markdown renders table cells as <td> elements. We check each cell's text
   * for task keywords and apply the same keyword formatting as other task types.
   */
  private processTableCells(element: HTMLElement): void {
    const taskParser = this.getTaskParser();
    if (!taskParser) return;

    const cells = element.querySelectorAll('td');
    cells.forEach((cell) => {
      if (!cell.instanceOf(HTMLElement)) return;

      const text = cell.textContent || '';
      if (!text.trim()) return;

      // Split on <br> for multi-line cells, check first part for task keyword
      const firstPart =
        text.split(/\s*<br\s*\/?>\s*/i)[0]?.trim() || text.trim();
      if (!taskParser.testRegex.test(firstPart)) return;

      const match = taskParser.testRegex.exec(firstPart);
      if (!match || !match[4]) return;

      const keyword = match[4];
      const isCompleted = KeywordManager.isCompletedKeyword(
        keyword,
        this.plugin.settings,
      );
      const isArchived = KeywordManager.isArchivedKeyword(
        keyword,
        this.plugin.settings,
      );

      const keywordSpan = this.createKeywordSpan(
        keyword,
        isCompleted,
        isArchived,
      );

      // Find keyword position in the first part text
      const keywordStart =
        (match[1]?.length || 0) +
        (match[2]?.length || 0) +
        (match[3]?.length || 0);

      // Find and replace the keyword in the cell's text nodes
      this.replaceKeywordInTaskElement(
        cell,
        keyword,
        keywordStart,
        keywordSpan,
      );

      // Style completed/archived task text after keyword
      if (isCompleted || isArchived) {
        const kwSpan = cell.querySelector('.todoseq-keyword-formatted');
        if (kwSpan && kwSpan.nextSibling) {
          const completedContainer = createSpan({
            cls: isCompleted
              ? 'todoseq-completed-task-text'
              : 'todoseq-archived-task-text',
          });
          const remaining: ChildNode[] = [];
          let cur: ChildNode | null = kwSpan.nextSibling;
          while (cur !== null) {
            remaining.push(cur);
            cur = cur.nextSibling;
          }
          remaining.forEach((n) => completedContainer.appendChild(n));
          kwSpan.parentNode?.insertBefore(
            completedContainer,
            kwSpan.nextSibling,
          );
        }
      }
    });
  }

  /**
   * Process priority tokens [#A], [#B], [#C] in task lines and replace with styled pills
   * Called after task keyword processing to avoid interference
   */
  private processPriorityPills(element: HTMLElement): void {
    // Skip if formatting is disabled
    if (!this.plugin.settings.formatTaskKeywords) {
      return;
    }

    // Check if we should skip quote/callout blocks
    const includeCalloutBlocks =
      this.plugin.settings?.includeCalloutBlocks ?? true;

    // Find all task list items
    const taskItems = element.querySelectorAll('.task-list-item');

    taskItems.forEach((taskItem) => {
      // Skip if element is inside an embedded task list container
      if (taskItem.closest('.todoseq-embedded-task-list-container')) {
        return;
      }

      // Skip if quote/callout blocks are disabled and this element is inside one
      if (
        !includeCalloutBlocks &&
        taskItem.instanceOf(HTMLElement) &&
        this.isInQuoteOrCalloutBlock(taskItem)
      ) {
        return;
      }

      if (!taskItem.instanceOf(HTMLElement)) {
        return;
      }

      // Process priority tokens in this task item
      this.processPriorityPillsInElement(taskItem);
    });

    // Also process regular list items that might have tasks
    const listItems = element.querySelectorAll('li:not(.task-list-item)');

    listItems.forEach((listItem) => {
      // Skip if element is inside an embedded task list container
      if (listItem.closest('.todoseq-embedded-task-list-container')) {
        return;
      }

      // Skip if quote/callout blocks are disabled and this element is inside one
      if (
        !includeCalloutBlocks &&
        listItem.instanceOf(HTMLElement) &&
        this.isInQuoteOrCalloutBlock(listItem)
      ) {
        return;
      }

      if (!listItem.instanceOf(HTMLElement)) {
        return;
      }

      // Process priority tokens in this list item
      this.processPriorityPillsInElement(listItem);
    });

    // Process paragraphs that might contain tasks
    const paragraphs = element.querySelectorAll('p');

    paragraphs.forEach((paragraph) => {
      // Skip if element is inside an embedded task list container
      if (paragraph.closest('.todoseq-embedded-task-list-container')) {
        return;
      }

      // Skip if quote/callout blocks are disabled and this paragraph is inside one
      if (
        !includeCalloutBlocks &&
        paragraph.instanceOf(HTMLElement) &&
        this.isInQuoteOrCalloutBlock(paragraph)
      ) {
        return;
      }

      if (!paragraph.instanceOf(HTMLElement)) {
        return;
      }

      // Only process priority pills in lines that contain task keywords
      // This matches the editor behavior which checks isTaskLine() before processing
      const taskParser = this.getTaskParser();
      if (
        taskParser &&
        !taskParser.testRegex.test(paragraph.textContent || '') &&
        !(
          taskParser.isHeadingTaskLine &&
          taskParser.isHeadingTaskLine(paragraph.textContent || '')
        )
      ) {
        return;
      }

      // Process priority tokens in this paragraph
      this.processPriorityPillsInElement(paragraph);
    });

    // Process heading elements that might contain tasks
    const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');

    headings.forEach((heading) => {
      // Skip if element is inside an embedded task list container
      if (heading.closest('.todoseq-embedded-task-list-container')) {
        return;
      }

      // Skip if quote/callout blocks are disabled and this heading is inside one
      if (
        !includeCalloutBlocks &&
        heading.instanceOf(HTMLElement) &&
        this.isInQuoteOrCalloutBlock(heading)
      ) {
        return;
      }

      if (!heading.instanceOf(HTMLElement)) {
        return;
      }

      // Only process priority pills in lines that contain task keywords
      const taskParser = this.getTaskParser();
      if (
        taskParser &&
        !taskParser.testRegex.test(heading.textContent || '') &&
        !(
          taskParser.isHeadingTaskLine &&
          taskParser.isHeadingTaskLine(heading.textContent || '')
        )
      ) {
        return;
      }

      // Process priority tokens in this heading
      this.processPriorityPillsInElement(heading);
    });

    // Process table cells with task keywords (experimental)
    if (this.plugin.settings?.experimentalTableTasks) {
      const tableCells = element.querySelectorAll('td');
      tableCells.forEach((cell) => {
        if (!cell.instanceOf(HTMLElement)) return;
        this.processPriorityPillsInElement(cell);
      });
    }
  }

  /**
   * Process priority tokens in a single element
   */
  private processPriorityPillsInElement(element: HTMLElement): void {
    // First, handle tag links that Obsidian has already rendered (e.g., [<a class="tag">#A</a>])
    this.processPriorityTagLinks(element);

    // Get all text nodes in the element
    const textNodes = this.getTextNodes(element);

    // Process each text node for priority tokens
    // We need to process in reverse order to avoid offset issues when replacing
    for (let i = textNodes.length - 1; i >= 0; i--) {
      const textNode = textNodes[i];
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
        continue;
      }

      this.processPriorityPillsInTextNode(textNode);
    }
  }

  /**
   * Process priority tokens that Obsidian has rendered as tag links
   * Handles the case where [#A] becomes [<a href="#A" class="tag">#A</a>]
   */
  private processPriorityTagLinks(element: HTMLElement): void {
    // Find all anchor tags with class "tag" that might be priority tokens
    const tagLinks = element.querySelectorAll('a.tag');

    tagLinks.forEach((tagLink) => {
      if (!tagLink.instanceOf(HTMLElement)) {
        return;
      }

      // Get the href and text content
      const href = tagLink.getAttribute('href') || '';
      const text = tagLink.textContent || '';

      // Check if this is a priority tag (#A, #B, or #C)
      const priorityMatch = href.match(/^#([ABC])$/);
      if (!priorityMatch) {
        return;
      }

      const letter = priorityMatch[1];

      // Verify the text content matches
      if (text !== `#${letter}`) {
        return;
      }

      // Check if this tag link is wrapped in brackets [ ]
      const parentNode = tagLink.parentNode;
      if (!parentNode) {
        return;
      }

      // Get the previous and next siblings
      const prevSibling = tagLink.previousSibling;
      const nextSibling = tagLink.nextSibling;

      // Check if previous sibling is a text node ending with '['
      let hasOpeningBracket = false;
      let bracketTextNode: Text | null = null;

      if (prevSibling && prevSibling.nodeType === Node.TEXT_NODE) {
        const prevText = prevSibling.textContent || '';
        if (prevText.endsWith('[')) {
          hasOpeningBracket = true;
          bracketTextNode = prevSibling as Text;
        }
      }

      // Check if next sibling is a text node starting with ']'
      let hasClosingBracket = false;
      let closingBracketTextNode: Text | null = null;

      if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
        const nextText = nextSibling.textContent || '';
        if (nextText.startsWith(']')) {
          hasClosingBracket = true;
          closingBracketTextNode = nextSibling as Text;
        }
      }

      // Only process if both brackets are present
      if (!hasOpeningBracket || !hasClosingBracket) {
        return;
      }

      // Create the priority pill
      const pill = this.createPriorityPill(letter);

      // Handle the opening bracket text node - remove the '['
      if (bracketTextNode) {
        const prevText = bracketTextNode.textContent || '';
        const newText = prevText.slice(0, -1);
        if (newText.length === 0) {
          // Remove the entire text node if it only contained '['
          parentNode.removeChild(bracketTextNode);
        } else {
          bracketTextNode.textContent = newText;
        }
      }

      // Handle the closing bracket text node - remove the ']'
      if (closingBracketTextNode) {
        const nextText = closingBracketTextNode.textContent || '';
        const newText = nextText.slice(1);
        if (newText.length === 0) {
          // Remove the entire text node if it only contained ']'
          parentNode.removeChild(closingBracketTextNode);
        } else {
          closingBracketTextNode.textContent = newText;
        }
      }

      // Replace the tag link with the priority pill
      parentNode.replaceChild(pill, tagLink);
    });
  }

  /**
   * Process priority tokens in a single text node
   */
  private processPriorityPillsInTextNode(textNode: Node): void {
    const text = textNode.textContent || '';

    // Use cached regex with global flag to find all matches
    const regex = PRIORITY_TOKEN_REGEX_GLOBAL;
    let match: RegExpExecArray | null;

    // Collect all matches first (since we'll be modifying the DOM)
    const matches: Array<{
      index: number;
      leadingSpace: string;
      letter: string;
      trailingSpace: string;
      fullMatch: string;
    }> = [];

    while ((match = regex.exec(text)) !== null) {
      matches.push({
        index: match.index,
        leadingSpace: match[1] || '',
        letter: match[2],
        trailingSpace: match[3] || '',
        fullMatch: match[0],
      });
    }

    // If no matches, nothing to do
    if (matches.length === 0) {
      return;
    }

    // Process matches in reverse order to maintain correct offsets
    let currentNode = textNode;

    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      const tokenStart = m.index;
      const tokenEnd = tokenStart + m.fullMatch.length;

      // The actual [#A] part (without surrounding whitespace)
      const pillStart = tokenStart + m.leadingSpace.length;
      const pillEnd = tokenEnd - m.trailingSpace.length;

      // Create the priority pill
      const pill = this.createPriorityPill(m.letter);

      // Get the current text content
      const currentText = currentNode.textContent || '';

      // Split the text node
      const beforeText = currentText.substring(0, pillStart);
      const afterText = currentText.substring(pillEnd);

      // Create new text nodes
      const beforeNode = window.activeDocument.createTextNode(beforeText);
      const afterNode = window.activeDocument.createTextNode(afterText);

      // Replace the current node with before + pill + after
      const parentNode = currentNode.parentNode;
      if (parentNode) {
        parentNode.insertBefore(afterNode, currentNode);
        parentNode.insertBefore(pill, afterNode);
        parentNode.insertBefore(beforeNode, pill);
        parentNode.removeChild(currentNode);

        // Update current node reference for next iteration
        currentNode = afterNode;
      }
    }
  }

  /**
   * Create a styled priority pill element
   * @param letter - The priority letter: A, B, or C
   * @returns HTMLSpanElement with appropriate classes
   */
  private createPriorityPill(letter: string): HTMLSpanElement {
    // Map priority letter to CSS class
    const priorityClass =
      letter === 'A'
        ? 'priority-high'
        : letter === 'B'
          ? 'priority-med'
          : 'priority-low';
    const priorityName = getPriorityLevelName(letter);

    const span = createSpan({
      cls: `todoseq-priority-badge ${priorityClass}`,
      attr: {
        'data-priority': letter,
        'aria-label': `Priority ${letter}`,
        role: 'badge',
      },
    });
    setTooltip(span, `Priority ${priorityName}`);

    span.textContent = letter;

    return span;
  }

  /**
   * Process task list items that contain text directly (without <p> elements)
   */
  private processTaskListItemDirectly(taskElement: HTMLElement): void {
    const taskParser = this.getTaskParser();
    if (!taskParser) {
      return;
    }

    // Get the text content of the task element
    const taskText = taskElement.textContent || '';

    // Use the task parser to test this task text
    const testResult = taskParser.testRegex.test(taskText);

    if (testResult) {
      const match = taskParser.testRegex.exec(taskText);

      if (match && match[4]) {
        // match[4] contains the keyword
        const keyword = match[4];

        // Check if this is a completed keyword for styling
        const isCompleted = KeywordManager.isCompletedKeyword(
          keyword,
          this.plugin.settings,
        );

        // Check if this is an archived keyword for styling
        const isArchived = KeywordManager.isArchivedKeyword(
          keyword,
          this.plugin.settings,
        );

        // Create a span for the task keyword using helper method
        const keywordSpan = this.createKeywordSpan(
          keyword,
          isCompleted,
          isArchived,
        );

        // Find the keyword position in the task text
        const fullMatchStart = match.index || 0;
        const keywordStart =
          fullMatchStart +
          (match[1]?.length || 0) +
          (match[2]?.length || 0) +
          (match[3]?.length || 0);

        // Find and replace the keyword in the task element's text nodes
        this.replaceKeywordInTaskElement(
          taskElement,
          keyword,
          keywordStart,
          keywordSpan,
        );

        // Get or create the task container (this will be created by wrapTaskElementInContainer)
        // First, we need to wrap the content in a task container
        const taskContainer = this.createTaskContainer();

        // Move all children into the task container, but preserve checkbox and list-bullet elements
        // by keeping them outside the task container
        const childrenToWrap: ChildNode[] = [];
        const childrenToPreserve: ChildNode[] = [];

        taskElement.childNodes.forEach((child) => {
          if (child.nodeType === Node.ELEMENT_NODE) {
            const el = child as HTMLElement;
            // Preserve checkbox and list-bullet elements
            if (
              el.classList?.contains('task-list-item-checkbox') ||
              el.classList?.contains('list-bullet')
            ) {
              childrenToPreserve.push(child);
            } else {
              childrenToWrap.push(child);
            }
          } else {
            childrenToWrap.push(child);
          }
        });

        // Clear the task element
        while (taskElement.firstChild) {
          taskElement.removeChild(taskElement.firstChild);
        }

        // Add preserved children first (checkbox, list-bullet)
        childrenToPreserve.forEach((child) => {
          taskElement.appendChild(child);
        });

        // Add wrapped children to task container
        childrenToWrap.forEach((child) => {
          taskContainer.appendChild(child);
        });

        // Add the task container to the task element
        taskElement.appendChild(taskContainer);

        // Apply completed task text styling if needed
        if (isCompleted) {
          this.applyCompletedTaskStylingToTaskContainer(taskContainer, keyword);
        }
      }
    }
  }

  /**
   * Replace keyword in task element's text nodes
   */
  private replaceKeywordInTaskElement(
    taskElement: HTMLElement,
    keyword: string,
    keywordStart: number,
    keywordSpan: HTMLElement,
  ): void {
    // Get all text nodes in the task element
    const textNodes = this.getTextNodes(taskElement);
    let currentPosition = 0;

    for (const textNode of textNodes) {
      if (textNode.nodeType !== Node.TEXT_NODE) {
        continue;
      }

      const nodeText = textNode.textContent || '';
      const nodeStart = currentPosition;
      const nodeEnd = currentPosition + nodeText.length;

      // Check if this text node contains the keyword
      if (keywordStart >= nodeStart && keywordStart < nodeEnd) {
        const keywordStartInNode = keywordStart - nodeStart;
        const keywordEndInNode = keywordStartInNode + keyword.length;

        if (keywordEndInNode <= nodeText.length) {
          // Create text nodes for before, after, and replace the keyword
          const beforeText = nodeText.substring(0, keywordStartInNode);
          const afterText = nodeText.substring(keywordEndInNode);

          // Create new nodes
          const beforeSpan = window.activeDocument.createTextNode(beforeText);
          const afterSpan = window.activeDocument.createTextNode(afterText);

          // Replace the text node with our structured content
          textNode.parentNode?.insertBefore(afterSpan, textNode);
          textNode.parentNode?.insertBefore(keywordSpan, afterSpan);
          textNode.parentNode?.insertBefore(beforeSpan, keywordSpan);
          textNode.parentNode?.removeChild(textNode);

          break;
        }
      }

      currentPosition = nodeEnd;
    }
  }

  /**
   * Wrap a task element in a container span
   */
  private wrapTaskElementInContainer(
    taskElement: HTMLElement,
    container: HTMLElement,
  ): void {
    // Move all child nodes of the task element into the container
    while (taskElement.firstChild) {
      container.appendChild(taskElement.firstChild);
    }

    // Add the container to the task element (preserving the <li> structure)
    taskElement.appendChild(container);
  }

  /**
   * Find or create a task container for a task element
   * Returns the task container, creating one if it doesn't exist
   */
  private findOrCreateTaskContainer(taskElement: HTMLElement): HTMLElement {
    let taskContainer = taskElement.querySelector('.todoseq-task');
    if (!taskContainer) {
      taskContainer = this.createTaskContainer();
      // Move all children into the container first
      while (taskElement.firstChild) {
        taskContainer.appendChild(taskElement.firstChild);
      }
      taskElement.appendChild(taskContainer);
    }
    return taskContainer as HTMLElement;
  }

  /**
   * Apply completed task styling to task element's text nodes
   */
  private applyCompletedTaskStylingToTaskElement(
    taskElement: HTMLElement,
    keyword: string,
    keywordStart: number,
  ): void {
    // Get all text nodes in the task element
    const textNodes = this.getTextNodes(taskElement);
    let currentPosition = 0;
    let keywordFound = false;
    const nodesAfterKeyword: Node[] = [];

    for (const textNode of textNodes) {
      if (textNode.nodeType !== Node.TEXT_NODE) {
        continue;
      }

      const nodeText = textNode.textContent || '';
      const nodeStart = currentPosition;
      const nodeEnd = currentPosition + nodeText.length;

      // Check if this text node contains the keyword
      if (keywordStart >= nodeStart && keywordStart < nodeEnd) {
        keywordFound = true;
        // Add the part of this node after the keyword
        const keywordStartInNode = keywordStart - nodeStart;
        const afterText = nodeText.substring(
          keywordStartInNode + keyword.length,
        );
        if (afterText) {
          const afterSpan = window.activeDocument.createTextNode(afterText);
          nodesAfterKeyword.push(afterSpan);
        }
      } else if (keywordFound) {
        // This node is after the keyword, add it to nodes to style
        nodesAfterKeyword.push(textNode);
      }

      currentPosition = nodeEnd;
    }

    // Find the task container (the todoseq-task span we added)
    const taskContainer = taskElement.querySelector('.todoseq-task');
    if (!taskContainer) return;

    // Find the keyword span within the task container
    const keywordSpan = taskContainer.querySelector(
      '.todoseq-keyword-formatted[data-task-keyword="' + keyword + '"]',
    );
    if (keywordSpan && keywordSpan.parentNode) {
      // Create a container for the completed task using helper method
      const completedContainer = this.createCompletedTaskContainer();

      // Add all nodes after the keyword to the container
      nodesAfterKeyword.forEach((node) => {
        completedContainer.appendChild(node);
      });

      // Replace the keyword span with the completed container within the task container
      // This will also move the keyword span into the completed container
      keywordSpan.parentNode.replaceChild(completedContainer, keywordSpan);

      // Now move the keyword span into the completed container at the beginning
      completedContainer.insertBefore(
        keywordSpan,
        completedContainer.firstChild,
      );
    }
  }

  /**
   * Process a list item that contains text directly (without <p> elements)
   * Handles cases like:
   // <li data-line="0" dir="auto"><span class="list-bullet"></span>TODO in indented bullet</li>
   * <li data-line="0" dir="auto"><span class="list-bullet"></span>TODO task in a star * bullet</li>
   * <li data-line="0" dir="auto">TODO task in numbered bullet list 1</li>
   */
  private processListItemDirectly(listItem: HTMLElement): void {
    const taskParser = this.getTaskParser();
    if (!taskParser) {
      return;
    }

    // Get the text content of the list item
    const listItemText = listItem.textContent || '';

    // Use the task parser to test if this contains a task
    if (!taskParser.testRegex.test(listItemText)) {
      return;
    }

    const match = taskParser.testRegex.exec(listItemText);
    if (!match || !match[4]) {
      return;
    }

    // match[4] contains the keyword
    const keyword = match[4];

    // Check if this is a completed keyword for styling
    const isCompleted = KeywordManager.isCompletedKeyword(
      keyword,
      this.plugin.settings,
    );

    // Check if this is an archived keyword for styling
    const isArchived = KeywordManager.isArchivedKeyword(
      keyword,
      this.plugin.settings,
    );

    // Create a span for the task keyword
    const keywordSpan = this.createKeywordSpan(
      keyword,
      isCompleted,
      isArchived,
    );

    // Find the keyword position in the text
    const fullMatchStart = match.index || 0;
    const keywordStart =
      fullMatchStart +
      (match[1]?.length || 0) +
      (match[2]?.length || 0) +
      (match[3]?.length || 0);

    // Find and replace the keyword in the list item's text nodes
    this.replaceKeywordInListItem(listItem, keyword, keywordStart, keywordSpan);

    // Create a task container for styling
    const taskContainer = this.createTaskContainer();

    // Move all children into the task container, but preserve special elements
    // like list-bullet, list-collapse-indicator, and checkboxes
    const childrenToWrap: ChildNode[] = [];
    const childrenToPreserve: ChildNode[] = [];

    listItem.childNodes.forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        // Preserve list-related elements and checkboxes
        if (
          el.classList?.contains('task-list-item-checkbox') ||
          el.classList?.contains('list-bullet') ||
          el.classList?.contains('list-collapse-indicator') ||
          el.classList?.contains('collapse-indicator') ||
          el.classList?.contains('collapse-icon')
        ) {
          childrenToPreserve.push(child);
        } else {
          childrenToWrap.push(child);
        }
      } else {
        childrenToWrap.push(child);
      }
    });

    // Clear the list item
    while (listItem.firstChild) {
      listItem.removeChild(listItem.firstChild);
    }

    // Add preserved children first (checkbox, list-bullet, collapse indicator)
    childrenToPreserve.forEach((child) => {
      listItem.appendChild(child);
    });

    // Add wrapped children to task container
    childrenToWrap.forEach((child) => {
      taskContainer.appendChild(child);
    });

    // Add the task container to the list item
    listItem.appendChild(taskContainer);

    // Apply completed task text styling if needed
    if (isCompleted) {
      this.applyCompletedTaskStylingToTaskContainer(taskContainer, keyword);
    }
  }

  /**
   * Replace keyword in list item's text nodes
   */
  private replaceKeywordInListItem(
    listItem: HTMLElement,
    keyword: string,
    keywordStart: number,
    keywordSpan: HTMLElement,
  ): void {
    // Get all text nodes in the list item
    const textNodes = this.getTextNodes(listItem);
    let currentPosition = 0;

    for (const textNode of textNodes) {
      if (textNode.nodeType !== Node.TEXT_NODE) {
        continue;
      }

      const nodeText = textNode.textContent || '';
      const nodeStart = currentPosition;
      const nodeEnd = currentPosition + nodeText.length;

      // Check if this text node contains the keyword
      if (keywordStart >= nodeStart && keywordStart < nodeEnd) {
        const keywordStartInNode = keywordStart - nodeStart;
        const keywordEndInNode = keywordStartInNode + keyword.length;

        if (keywordEndInNode <= nodeText.length) {
          // Create text nodes for before, after, and replace the keyword
          const beforeText = nodeText.substring(0, keywordStartInNode);
          const afterText = nodeText.substring(keywordEndInNode);

          // Create new nodes
          const beforeNode = window.activeDocument.createTextNode(beforeText);
          const afterNode = window.activeDocument.createTextNode(afterText);

          // Replace the text node with our structured content
          const parent = textNode.parentNode;
          if (parent) {
            parent.insertBefore(afterNode, textNode);
            parent.insertBefore(keywordSpan, afterNode);
            parent.insertBefore(beforeNode, keywordSpan);
            parent.removeChild(textNode);
          }

          break;
        }
      }

      currentPosition = nodeEnd;
    }
  }

  /**
   * Process a paragraph for task keywords using the task parser's regex
   * Handles multiple task lines within the same paragraph (separated by <br> tags)
   */
  private processParagraphForTasks(paragraph: HTMLElement): void {
    const taskParser = this.getTaskParser();
    if (!taskParser) {
      return;
    }

    // Direct approach: process the paragraph by examining its child nodes
    // and handling text nodes and <br> elements appropriately
    this.processParagraphByChildNodes(paragraph);
  }

  /**
   * Process a paragraph by examining its child nodes directly
   * This handles multi-line paragraphs correctly by processing text nodes
   * and respecting <br> elements as line separators
   */
  private processParagraphByChildNodes(paragraph: HTMLElement): void {
    const taskParser = this.getTaskParser();
    if (!taskParser) {
      return;
    }

    // Get all child nodes of the paragraph
    const childNodes = Array.from(paragraph.childNodes);
    let currentLineText = '';
    let currentLineNodes: Node[] = [];

    for (let i = 0; i < childNodes.length; i++) {
      const node = childNodes[i];

      if (node.nodeType === Node.TEXT_NODE) {
        // Add text node to current line
        currentLineText += node.textContent;
        currentLineNodes.push(node);
      } else if (node.nodeName === 'BR') {
        // Found a line break - process the current line
        if (currentLineText.trim()) {
          this.processLineText(paragraph, currentLineText, currentLineNodes);
        }

        // Reset for next line
        currentLineText = '';
        currentLineNodes = [];
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        if (element.classList?.contains('todoseq-keyword-formatted')) {
          // Skip already processed keyword spans
          continue;
        }
        // Include element nodes (like <a> tags for priority markers) in the line
        currentLineText += element.textContent;
        currentLineNodes.push(node);
      }
    }

    // Process the last line if there's any remaining text
    if (currentLineText.trim() && currentLineNodes.length > 0) {
      this.processLineText(paragraph, currentLineText, currentLineNodes);
    }
  }

  /**
   * Process a single line of text for task keywords
   */
  private processLineText(
    paragraph: HTMLElement,
    lineText: string,
    lineNodes: Node[],
  ): void {
    const taskParser = this.getTaskParser();
    if (!taskParser || lineNodes.length === 0) {
      return;
    }

    // Check if parent element is a heading (h1-h6) — in reader view, the # is stripped
    const isHeadingElement = paragraph.tagName?.match(/^H[1-6]$/) !== null;

    // Use the task parser to test this line
    let testResult = taskParser.testRegex.test(lineText);

    // Detect heading tasks — always true when parent is a heading element with a keyword
    let isHeadingTask = false;
    let headingMatch: RegExpExecArray | null = null;
    let keywordFromMatch: string | undefined;
    if (isHeadingElement) {
      // In reader view, the # is stripped from headings, so headingRegex won't match.
      // Try headingRegex first (works if # is present), then fall back to checking
      // if the heading text starts with a known keyword.
      const headingText = paragraph.textContent || '';
      if (taskParser.headingRegex) {
        headingMatch = taskParser.headingRegex.exec(headingText);
      }
      if (headingMatch && headingMatch[2]) {
        isHeadingTask = true;
        keywordFromMatch = headingMatch[2]; // group 2 = keyword in headingRegex
        testResult = true;
      } else {
        // Reader view: # is stripped, so check if text starts with a keyword
        const trimmedText = headingText.trimStart();
        for (const kw of taskParser.allKeywords) {
          if (trimmedText.startsWith(kw)) {
            isHeadingTask = true;
            keywordFromMatch = kw;
            testResult = true;
            break;
          }
        }
      }
    } else if (!testResult && taskParser.isHeadingTaskLine(lineText)) {
      headingMatch = taskParser.headingRegex?.exec(lineText) ?? null;
      if (headingMatch && headingMatch[2]) {
        isHeadingTask = true;
        keywordFromMatch = headingMatch[2]; // group 2 = keyword in headingRegex
        testResult = true;
      }
    }

    if (testResult) {
      const match =
        isHeadingTask && headingMatch
          ? headingMatch
          : taskParser.testRegex.exec(lineText);

      // For heading tasks, keyword is in match[2]; for regex matches, keyword is in match[4]
      const keyword = keywordFromMatch ?? match?.[4];

      if (match && keyword) {
        // Check if this is a completed keyword for styling
        const isCompleted = KeywordManager.isCompletedKeyword(
          keyword,
          this.plugin.settings,
        );

        // Check if this is an archived keyword for styling
        const isArchived = KeywordManager.isArchivedKeyword(
          keyword,
          this.plugin.settings,
        );

        // Create a span for the task keyword using helper method
        const keywordSpan = this.createKeywordSpan(
          keyword,
          isCompleted,
          isArchived,
        );

        // Add heading task class for heading font size styling
        if (isHeadingTask) {
          keywordSpan.addClass('todoseq-heading-task-keyword');
        }

        // Create a container for the entire task line using helper method
        const taskContainer = this.createTaskContainer();

        // Replace the keyword in the line nodes and build the task content
        this.replaceKeywordInTextNodesAndBuildTask(
          lineNodes,
          keyword,
          keywordSpan,
          taskContainer,
        );

        // Apply completed task text styling if needed
        if (isCompleted) {
          this.applyCompletedTaskStylingToTaskContainer(taskContainer, keyword);
        }

        // Apply archived task text styling if needed
        if (isArchived) {
          this.applyArchivedTaskStylingToTaskContainer(taskContainer);
        }

        // Replace all line nodes with the task container
        const parentNode = lineNodes[0].parentNode;
        if (parentNode) {
          // Insert the task container before the first line node
          parentNode.insertBefore(taskContainer, lineNodes[0]);

          // Remove all line nodes from the parent
          lineNodes.forEach((node) => {
            if (node.parentNode === parentNode) {
              parentNode.removeChild(node);
            }
          });
        }
      }
    }
  }

  /**
   * Replace keyword in text nodes and build the task container
   * Simplified approach using string replacement instead of character position tracking
   */
  private replaceKeywordInTextNodesAndBuildTask(
    lineNodes: Node[],
    keyword: string,
    keywordSpan: HTMLElement,
    taskContainer: HTMLElement,
  ): void {
    // Combine all text from line nodes to find the keyword
    const fullText = lineNodes.map((n) => n.textContent || '').join('');
    const keywordIndex = fullText.indexOf(keyword);

    if (keywordIndex === -1) {
      // Keyword not found, just clone all nodes
      lineNodes.forEach((node) => {
        taskContainer.appendChild(node.cloneNode(true));
      });
      return;
    }

    // Build the content by processing nodes and replacing the keyword
    let textPosition = 0;
    let keywordInserted = false;

    for (const node of lineNodes) {
      if (node.nodeType !== Node.TEXT_NODE) {
        // Non-text nodes are cloned as-is
        taskContainer.appendChild(node.cloneNode(true));
        textPosition += node.textContent?.length || 0;
        continue;
      }

      const nodeText = node.textContent || '';
      const nodeStart = textPosition;
      const nodeEnd = textPosition + nodeText.length;

      // Check if this node contains the keyword (or part of it)
      if (
        !keywordInserted &&
        keywordIndex < nodeEnd &&
        keywordIndex + keyword.length > nodeStart
      ) {
        // Calculate positions within this node
        const keywordStartInNode = Math.max(0, keywordIndex - nodeStart);
        const keywordEndInNode = Math.min(
          nodeText.length,
          keywordIndex + keyword.length - nodeStart,
        );

        // Add text before keyword
        const beforeText = nodeText.substring(0, keywordStartInNode);
        if (beforeText) {
          taskContainer.appendChild(
            window.activeDocument.createTextNode(beforeText),
          );
        }

        // Add the keyword span
        taskContainer.appendChild(keywordSpan);

        // Add text after keyword
        const afterText = nodeText.substring(keywordEndInNode);
        if (afterText) {
          taskContainer.appendChild(
            window.activeDocument.createTextNode(afterText),
          );
        }

        keywordInserted = true;
      } else {
        // This node doesn't contain the keyword, add as-is
        taskContainer.appendChild(node.cloneNode(true));
      }

      textPosition = nodeEnd;
    }
  }

  /**
   * Apply completed task styling to a task container
   */
  private applyCompletedTaskStylingToTaskContainer(
    taskContainer: HTMLElement,
    keyword: string,
  ): void {
    // Find the keyword span within the task container
    const keywordSpan = taskContainer.querySelector(
      '.todoseq-keyword-formatted[data-task-keyword="' + keyword + '"]',
    );
    if (!keywordSpan) return;

    // Verify the keyword span is actually a child of the task container
    if (keywordSpan.parentNode !== taskContainer) {
      return;
    }

    // Get all nodes after the keyword span (store references to original nodes)
    const nodesAfterKeyword: Node[] = [];
    let currentNode = keywordSpan.nextSibling;

    while (currentNode) {
      nodesAfterKeyword.push(currentNode);
      currentNode = currentNode.nextSibling;
    }

    // Wrap both the keyword and the text after it in completed task styling
    if (nodesAfterKeyword.length > 0 || keywordSpan) {
      // Create a container for the completed task using helper method
      const completedContainer = this.createCompletedTaskContainer();

      // Move all nodes after keyword to the container (not clone)
      nodesAfterKeyword.forEach((node) => {
        completedContainer.appendChild(node);
      });

      // Replace the keyword span with the completed container
      taskContainer.replaceChild(completedContainer, keywordSpan);

      // Now move the keyword span into the completed container at the beginning
      completedContainer.insertBefore(
        keywordSpan,
        completedContainer.firstChild,
      );
    }
  }

  /**
   * Apply archived task styling to a task container
   */
  private applyArchivedTaskStylingToTaskContainer(
    taskContainer: HTMLElement,
  ): void {
    // Find all keyword spans within the task container
    const keywordSpans = taskContainer.querySelectorAll(
      '.todoseq-keyword-formatted',
    );

    for (const keywordSpan of keywordSpans) {
      // Check if this is an archived keyword
      const keyword = keywordSpan.getAttribute('data-task-keyword');
      if (!keyword) continue;

      if (!KeywordManager.isArchivedKeyword(keyword, this.plugin.settings))
        continue;

      // Verify the keyword span is actually a child of the task container
      if (keywordSpan.parentNode !== taskContainer) {
        continue;
      }

      // Get all nodes after the keyword span (store references to original nodes)
      const nodesAfterKeyword: Node[] = [];
      let currentNode = keywordSpan.nextSibling;

      while (currentNode) {
        nodesAfterKeyword.push(currentNode);
        currentNode = currentNode.nextSibling;
      }

      // Wrap both the keyword and the text after it in archived task styling
      if (nodesAfterKeyword.length > 0 || keywordSpan) {
        // Create a container for the archived task using helper method
        const archivedContainer = this.createArchivedTaskContainer();

        // Move all nodes after keyword to the container (not clone)
        nodesAfterKeyword.forEach((node) => {
          archivedContainer.appendChild(node);
        });

        // Replace the keyword span with the archived container
        taskContainer.replaceChild(archivedContainer, keywordSpan);

        // Now move the keyword span into the archived container at the beginning
        archivedContainer.insertBefore(
          keywordSpan,
          archivedContainer.firstChild,
        );
      }
    }
  }

  /**
   * Get all text nodes within an element
   */
  private getTextNodes(element: HTMLElement): Node[] {
    const textNodes: Node[] = [];
    const walker = window.activeDocument.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
    );

    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    return textNodes;
  }

  /**
   * Process SCHEDULED, DEADLINE, and CLOSED lines in the rendered HTML
   * Applies appropriate styling to date-related lines.
   *
   * Accepts the post-processor `context` so the preceding-task check can
   * fall back to reading the source file when Obsidian's reader view
   * chunked the heading task and the metadata paragraph into separate
   * post-processor invocations (the close-and-reopen code path).
   */
  private async processDateLines(
    element: HTMLElement,
    context?: MarkdownPostProcessorContext,
  ): Promise<void> {
    // Find all paragraphs that might contain SCHEDULED, DEADLINE, or CLOSED
    const paragraphs = element.querySelectorAll('p');

    for (const paragraph of Array.from(paragraphs)) {
      const text = paragraph.textContent || '';

      // Quick check: skip paragraphs without date keywords
      if (
        !text.includes('SCHEDULED:') &&
        !text.includes('DEADLINE:') &&
        !text.includes('CLOSED:')
      ) {
        continue;
      }

      // If paragraph contains DESCRIPTION:, it's definitely task metadata
      const isMetadataBlock = text.includes('DESCRIPTION:');
      if (
        !isMetadataBlock &&
        !(await this.hasPrecedingTaskAsync(paragraph, context))
      ) {
        continue;
      }

      // After awaiting an async fallback above the paragraph may have
      // been detached by a re-render. Skip mutation in that case so we
      // don't wrap a stale node that won't end up in the final DOM.
      if (!paragraph.isConnected) {
        continue;
      }

      // Process date keywords in this paragraph
      this.processDateKeywordsInParagraph(paragraph);
    }

    // Also process date lines inside task containers (e.g., when sub-bullets follow immediately)
    // This handles cases like:
    // - TODO task
    //   SCHEDULED: <2026-03-20 Fri>
    //   - TODO subtask
    // where the SCHEDULED line is inside the todoseq-task span instead of a separate paragraph
    const taskContainers = element.querySelectorAll('.todoseq-task');

    taskContainers.forEach((taskContainer) => {
      if (!taskContainer.instanceOf(HTMLElement)) {
        return;
      }

      const text = taskContainer.textContent || '';

      // Quick check: skip task containers without date keywords
      if (
        !text.includes('SCHEDULED:') &&
        !text.includes('DEADLINE:') &&
        !text.includes('CLOSED:')
      ) {
        return;
      }

      // Process date keywords in this task container
      this.processDateKeywordsInElement(taskContainer);
    });

    // Process date keywords inside table cells (experimental)
    if (this.plugin.settings?.experimentalTableTasks) {
      const tableCells = element.querySelectorAll('.table-cell-wrapper, td');
      tableCells.forEach((cell) => {
        if (!cell.instanceOf(HTMLElement)) return;
        const text = cell.textContent || '';
        if (
          !text.includes('SCHEDULED:') &&
          !text.includes('DEADLINE:') &&
          !text.includes('CLOSED:')
        ) {
          return;
        }
        this.processDateKeywordsInElement(cell);
      });
    }
  }

  /**
   * Process DESCRIPTION: lines in reader view.
   *
   * Accepts the post-processor `context` so the preceding-task check can
   * fall back to reading the source file when Obsidian's reader view
   * chunked the heading task and the DESCRIPTION paragraph into separate
   * post-processor invocations (close-and-reopen code path).
   */
  private async processDescriptionLines(
    element: HTMLElement,
    context?: MarkdownPostProcessorContext,
  ): Promise<void> {
    // Fast precheck: skip if no DESCRIPTION: in document
    if (!element.textContent?.includes('DESCRIPTION:')) return;

    const paragraphs = element.querySelectorAll('p');

    for (const paragraph of Array.from(paragraphs)) {
      const text = paragraph.textContent || '';

      // Quick check: skip paragraphs without DESCRIPTION keyword
      if (!text.includes('DESCRIPTION:')) {
        continue;
      }

      // If paragraph also contains date keywords, it's definitely task metadata
      const isMetadataBlock =
        text.includes('SCHEDULED:') ||
        text.includes('DEADLINE:') ||
        text.includes('CLOSED:');

      if (
        !isMetadataBlock &&
        !(await this.hasPrecedingTaskAsync(paragraph, context))
      ) {
        continue;
      }

      // After awaiting an async fallback above the paragraph may have
      // been detached by a re-render. Skip mutation in that case.
      if (!paragraph.isConnected) {
        continue;
      }

      // Find the text node containing DESCRIPTION: and wrap all content after it
      const result = this.findDateKeywordNode(paragraph, 'DESCRIPTION:');
      if (result) {
        this.wrapDescriptionLine(paragraph, result.node, result.index);
      }
    }

    // Process DESCRIPTION: inside table cells (experimental)
    if (this.plugin.settings?.experimentalTableTasks) {
      const tableCells = element.querySelectorAll('td');
      tableCells.forEach((cell) => {
        if (!cell.instanceOf(HTMLElement)) return;
        const text = cell.textContent || '';
        if (!text.includes('DESCRIPTION:')) return;

        // Find the text node containing DESCRIPTION: and wrap it
        const result = this.findDateKeywordNode(cell, 'DESCRIPTION:');
        if (result) {
          this.wrapDescriptionLine(cell, result.node, result.index);
        }
      });
    }
  }

  /**
   * Wrap DESCRIPTION: keyword and all subsequent content in a styled span.
   * This handles markdown formatting (bold, italic, etc.) that may be in separate DOM nodes.
   */
  private wrapDescriptionLine(
    paragraph: HTMLParagraphElement,
    keywordNode: Text,
    keywordIndex: number,
  ): void {
    const nodeText = keywordNode.textContent || '';
    const beforeText = nodeText.substring(0, keywordIndex);

    const descContainer = createSpan({
      cls: 'todoseq-task-description',
      attr: {
        'data-description-line': 'true',
        role: 'note',
      },
    });

    // Add text before DESCRIPTION:
    if (beforeText) {
      keywordNode.parentNode?.insertBefore(
        window.activeDocument.createTextNode(beforeText),
        keywordNode,
      );
    }

    // Add the keyword
    descContainer.createSpan({
      cls: 'todoseq-description-keyword',
      text: 'DESCRIPTION:',
    });

    // Add text after DESCRIPTION: on the same node
    const afterKeywordText = nodeText.substring(
      keywordIndex + 'DESCRIPTION:'.length,
    );
    if (afterKeywordText) {
      descContainer.appendChild(
        window.activeDocument.createTextNode(afterKeywordText),
      );
    }

    // Collect and move all subsequent sibling nodes into the container
    let nextSibling = keywordNode.nextSibling;
    while (nextSibling) {
      const sibling = nextSibling;
      nextSibling = sibling.nextSibling;
      descContainer.appendChild(sibling);
    }

    // Replace the original keyword node with our container
    keywordNode.parentNode?.replaceChild(descContainer, keywordNode);
  }

  /**
   * Check if a paragraph has a preceding task (in siblings or within the paragraph)
   */
  private hasPrecedingTask(paragraph: HTMLParagraphElement): boolean {
    // Check previous siblings for tasks
    if (this.hasTaskInPreviousSiblings(paragraph)) {
      return true;
    }

    // Check within the paragraph itself (before the date line)
    return this.hasTaskBeforeDateInParagraph(paragraph);
  }

  /**
   * Async version of {@link hasPrecedingTask} that additionally falls back
   * to reading the source file when the DOM walk fails. On reader-mode
   * close-and-reopen Obsidian can render a heading task and its metadata
   * line in separate post-processor invocations, leaving the metadata
   * paragraph with no reachable preceding task in the DOM tree. The source
   * file still tells us whether the line above is a task — we just need
   * to look at the underlying markdown instead of the rendered HTML.
   *
   * The source-file read is cached per `context.sourcePath` for the
   * duration of a single post-processor callback so a page with N
   * metadata lines triggers at most one file read.
   */
  private async hasPrecedingTaskAsync(
    paragraph: HTMLParagraphElement,
    context?: MarkdownPostProcessorContext,
  ): Promise<boolean> {
    // Phase 1: cheap DOM walk (preserves the existing fast-path behavior).
    if (this.hasPrecedingTask(paragraph)) {
      return true;
    }

    if (!context || !context.sourcePath) {
      return false;
    }

    try {
      const lines = await this.getSourceLinesCached(context);
      if (!lines) {
        return false;
      }

      const parser = this.getTaskParser();
      if (!parser) {
        return false;
      }

      // Determine the metadata's source-line index. Prefer the section
      // bounds from getSectionInfo (so substring search is scoped to the
      // current chunk and won't pick the wrong occurrence in a long file),
      // then fall back to a bottom-up full-file substring search.
      const scope = this.computeMetadataLineScope(paragraph, lines, context);
      if (!scope) {
        return false;
      }

      // Walk upward from the metadata line, skipping blank lines, looking
      // for a task line (either a regular task or a heading task). We
      // scan the entire upward scope so intervening non-task lines do not
      // hide a valid preceding task further up.
      for (let i = scope.metadataLineIdx - 1; i >= scope.scopeStart; i--) {
        const prev = (lines[i] ?? '').trim();
        if (!prev) {
          continue;
        }
        if (this.isTaskSourceLine(prev, parser)) {
          return true;
        }
      }
    } catch (error) {
      console.debug(
        '[TODOseq] Source-file fallback for preceding-task check failed:',
        error,
      );
    }
    return false;
  }

  /**
   * Get the source-file lines for the current post-processor callback.
   * Cached per sourcePath on the formatter instance for the duration of
   * a single callback so repeated reads within the same render pass hit
   * the cache. Cleared at the top of each post-processor invocation.
   */
  private async getSourceLinesCached(
    context: MarkdownPostProcessorContext,
  ): Promise<string[] | null> {
    if (this.sourceLinesCache.has(context.sourcePath)) {
      return this.sourceLinesCache.get(context.sourcePath) ?? null;
    }
    const file = this.plugin.app.vault.getAbstractFileByPath(
      context.sourcePath,
    );
    if (!(file instanceof TFile)) {
      return null;
    }
    const content = await this.plugin.app.vault.cachedRead(file);
    const lines = content.split('\n');
    this.sourceLinesCache.set(context.sourcePath, lines);
    return lines;
  }

  /**
   * Locate the metadata paragraph inside the source file and define
   * the upward search *scope* for finding a preceding task line.
   *
   * Two paths:
   * - When `context.getSectionInfo(paragraph)` returns section bounds,
   *   `scopeStart`/`scopeEnd` are `[lineStart, lineEnd+1)` (slice
   *   convention). The metadata line is NOT `section.lineStart` — it's
   *   found via `lastIndexOf` of the paragraph's text inside the
   *   extracted section text, then converted back to a file index by
   *   adding `scopeStart` and the local newline offset.
   * - When `getSectionInfo` is unavailable, `scopeStart = 0` and
   *   `scopeEnd = lines.length`; the metadata line is `lastIndexOf`
   *   of the paragraph text in the whole file.
   *
   * Returns `null` when the metadata paragraph's text cannot be
   * uniquely located inside the scope (e.g. text changed since render
   * or appears multiple times in identical form).
   */
  private computeMetadataLineScope(
    paragraph: HTMLElement,
    lines: string[],
    context: MarkdownPostProcessorContext,
  ): { metadataLineIdx: number; scopeStart: number } | null {
    let scopeStart = 0;
    let sectionLocalText: string | null = null;

    if (typeof context.getSectionInfo === 'function') {
      try {
        const section = context.getSectionInfo(paragraph);
        if (
          section &&
          typeof section.lineStart === 'number' &&
          typeof section.lineEnd === 'number'
        ) {
          scopeStart = Math.max(0, section.lineStart);
          sectionLocalText = lines
            .slice(scopeStart, section.lineEnd + 1)
            .join('\n');
        }
      } catch {
        // Drop through to a full-file search below.
        sectionLocalText = null;
      }
    }

    const firstLine = (paragraph.textContent || '')
      .trim()
      .split('\n')[0]
      ?.trim();
    if (!firstLine || firstLine.length < 3) {
      return null;
    }

    // Phase 1: section-bounded search. Only runs when getSectionInfo
    // returned a section with valid bounds (`sectionLocalText !== null`).
    // On close+reopen Obsidian often hands us a section whose bounds do
    // NOT contain the metadata paragraph because the heading task and
    // its metadata paragraph were chunked into separate post-processor
    // invocations — Phase 1 misses in that case and we fall through.
    // Phase 2 (below) is the unified full-file search that handles both
    // "no section available" and "section missed the metadata" cases.
    if (sectionLocalText !== null) {
      const sectionAttempt = this.tryLocateMetadataLine(
        firstLine,
        sectionLocalText,
        lines,
        scopeStart,
      );
      if (sectionAttempt) {
        return sectionAttempt;
      }
    }
    // Phase 2: full-file search (no section available, or section-bounded
    // search in Phase 1 returned null because the metadata text was
    // outside the section's bounds).
    return this.tryLocateMetadataLine(firstLine, null, lines, 0);
  }

  /**
   * Find the metadata paragraph's source-line index inside a search
   * haystack. Returns `null` when the paragraph's text is not present
   * or when the resulting index would not leave room for a preceding
   * line within the supplied `scopeStart`.
   *
   * `sectionLocalText` (when non-null) restricts the substring search
   * to a portion of the file; null scopes the search to the whole
   * `lines` array.
   */
  private tryLocateMetadataLine(
    firstLine: string,
    sectionLocalText: string | null,
    lines: string[],
    scopeStart: number,
  ): { metadataLineIdx: number; scopeStart: number } | null {
    const searchHaystack = sectionLocalText ?? lines.join('\n');
    const localIdx = searchHaystack.lastIndexOf(firstLine);
    if (localIdx < 0) {
      return null;
    }
    const metadataLineIdx = sectionLocalText
      ? scopeStart +
        (sectionLocalText.substring(0, localIdx).match(/\n/g)?.length ?? 0)
      : (searchHaystack.substring(0, localIdx).match(/\n/g)?.length ?? 0);
    if (metadataLineIdx <= scopeStart) {
      return null;
    }
    return { metadataLineIdx, scopeStart };
  }

  /**
   * Whether a single source line counts as a preceding task line.
   * Checks both the regular task regex and the heading task regex/method.
   */
  private isTaskSourceLine(line: string, parser: TaskParser): boolean {
    if (!line) {
      return false;
    }
    // TaskParser constructs testRegex and headingRegex without the `g`
    // flag, so .test() is stateless and we don't need to reset lastIndex.
    if (parser.testRegex && parser.testRegex.test(line)) {
      return true;
    }
    if (parser.headingRegex && parser.headingRegex.test(line)) {
      return true;
    }
    if (typeof parser.isHeadingTaskLine === 'function') {
      return parser.isHeadingTaskLine(line);
    }
    return false;
  }

  /**
   * Check whether a single sibling element indicates a previous task.
   * Matching criteria: contains a wrapped `.todoseq-keyword-formatted`
   * span anywhere in its subtree, carries the `.task-list-item` class,
   * or whose text content starts with a known task keyword.
   */
  private siblingHasTask(sibling: Element): boolean {
    return Boolean(
      sibling.querySelector('.todoseq-keyword-formatted') ||
      sibling.classList.contains('task-list-item') ||
      this.containsTaskKeyword(sibling.textContent || ''),
    );
  }

  /**
   * Check previous sibling elements for tasks.
   *
   * Walks the paragraph's own previous siblings first, then walks up the
   * parent chain so that metadata paragraphs nested inside Obsidian
   * wrapper divs (e.g. `<div class="el-p"><p>SCHEDULED: ...</p></div>`
   * under `<div class="el-h6"><h6>TODO ...</h6></div>`) are still detected
   * as belonging to a preceding task. This fixes a reader-mode styling
   * bug where, after closing and reopening a markdown file, metadata
   * lines (SCHEDULED: / DEADLINE: / CLOSED:) that are NOT bundled with a
   * DESCRIPTION: line on the same paragraph lose their wrapping (e.g.
   * `todoseq-scheduled-line`) because Obsidian's chunked post-processor
   * invocation places the metadata paragraph in a DOM tree whose sibling
   * relationship to the preceding task may not be directly visible.
   */
  private hasTaskInPreviousSiblings(paragraph: HTMLParagraphElement): boolean {
    // Phase 1: walk the paragraph's own previous-element-sibling chain.
    let sibling: Element | null = paragraph.previousElementSibling;
    while (sibling) {
      if (this.siblingHasTask(sibling)) {
        return true;
      }
      sibling = sibling.previousElementSibling;
    }

    // Phase 2: walk up the parent chain. At every level, walk back through
    // that ancestor's previous element siblings looking for a task
    // indicator. Catches the typical layout (`<el-h6>` and `<el-p>`
    // siblings inside the markdown section) as well as more deeply
    // nested wrappers like multiple section outline divs.
    let ancestor: HTMLElement | null = paragraph.parentElement;
    while (ancestor) {
      let prev: Element | null = ancestor.previousElementSibling;
      while (prev) {
        if (this.siblingHasTask(prev)) {
          return true;
        }
        prev = prev.previousElementSibling;
      }
      ancestor = ancestor.parentElement;
    }
    return false;
  }

  /**
   * Check if there's a task before the date line within the paragraph
   */
  private hasTaskBeforeDateInParagraph(
    paragraph: HTMLParagraphElement,
  ): boolean {
    const childNodes = Array.from(paragraph.childNodes);
    let dateLineFound = false;
    let textBeforeDate = '';

    for (const node of childNodes) {
      if (dateLineFound) break;

      if (node.nodeType === Node.TEXT_NODE) {
        const nodeText = node.textContent || '';
        const dateIndex = this.findFirstKeywordIndex(nodeText);

        if (dateIndex >= 0) {
          textBeforeDate += nodeText.substring(0, dateIndex);
          dateLineFound = true;
        } else {
          textBeforeDate += nodeText;
        }
      } else if (node.nodeName === 'BR') {
        if (this.containsTaskKeyword(textBeforeDate.trim())) {
          return true;
        }
        textBeforeDate = '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        const elementText = element.textContent || '';
        const dateIndex = this.findFirstKeywordIndex(elementText);

        if (dateIndex >= 0) {
          textBeforeDate += elementText.substring(0, dateIndex);
          dateLineFound = true;
        } else {
          textBeforeDate += elementText;
        }
      }
    }

    // Check any remaining text before the date line
    if (this.containsTaskKeyword(textBeforeDate.trim())) {
      return true;
    }

    // If the paragraph only contains a date line (no task text before it),
    // check if the previous sibling is a task
    if (dateLineFound && textBeforeDate.trim() === '') {
      const prevSibling = paragraph.previousElementSibling;
      if (prevSibling) {
        const prevText = prevSibling.textContent || '';
        return this.containsTaskKeyword(prevText);
      }
    }

    return false;
  }

  /**
   * Process SCHEDULED:, DEADLINE:, and CLOSED: keywords in a paragraph
   */
  private processDateKeywordsInParagraph(
    paragraph: HTMLParagraphElement,
  ): void {
    const dateKeywords = [
      { keyword: 'SCHEDULED:', type: 'scheduled' as const },
      { keyword: 'DEADLINE:', type: 'deadline' as const },
      { keyword: 'CLOSED:', type: 'closed' as const },
    ];

    const text = paragraph.textContent || '';

    for (const { keyword, type } of dateKeywords) {
      if (!text.includes(keyword)) continue;

      // Find the text node containing this keyword
      const result = this.findDateKeywordNode(paragraph, keyword);
      if (!result) continue;

      const { node, index } = result;
      this.wrapDateKeyword(node, index, keyword, type);
    }
  }

  /**
   * Find the text node containing a date keyword
   */
  private findDateKeywordNode(
    paragraph: HTMLParagraphElement,
    keyword: string,
  ): { node: Text; index: number } | null {
    // Use a TreeWalker to find all text nodes, including nested ones
    const walker = window.activeDocument.createTreeWalker(
      paragraph,
      NodeFilter.SHOW_TEXT,
    );

    let node;
    while ((node = walker.nextNode())) {
      const textContent = node.textContent || '';
      if (textContent.includes(keyword)) {
        return {
          node: node as Text,
          index: textContent.indexOf(keyword),
        };
      }
    }
    return null;
  }

  /**
   * Process SCHEDULED:, DEADLINE:, and CLOSED: keywords in any element
   * Similar to processDateKeywordsInParagraph but works with any element type
   */
  private processDateKeywordsInElement(element: HTMLElement): void {
    const dateKeywords = [
      { keyword: 'SCHEDULED:', type: 'scheduled' as const },
      { keyword: 'DEADLINE:', type: 'deadline' as const },
      { keyword: 'CLOSED:', type: 'closed' as const },
    ];

    const text = element.textContent || '';

    for (const { keyword, type } of dateKeywords) {
      if (!text.includes(keyword)) continue;

      // Find the text node containing this keyword
      const result = this.findDateKeywordNodeInElement(element, keyword);
      if (!result) continue;

      const { node, index } = result;
      this.wrapDateKeyword(node, index, keyword, type);
    }
  }

  /**
   * Find the text node containing a date keyword in any element
   */
  private findDateKeywordNodeInElement(
    element: HTMLElement,
    keyword: string,
  ): { node: Text; index: number } | null {
    // Use a TreeWalker to find all text nodes, including nested ones
    const walker = window.activeDocument.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
    );

    let node;
    while ((node = walker.nextNode())) {
      const textContent = node.textContent || '';
      if (textContent.includes(keyword)) {
        return {
          node: node as Text,
          index: textContent.indexOf(keyword),
        };
      }
    }
    return null;
  }

  /**
   * Wrap a date keyword in styled spans
   */
  private wrapDateKeyword(
    keywordNode: Text,
    keywordIndex: number,
    keyword: string,
    type: 'scheduled' | 'deadline' | 'closed',
  ): void {
    // Split the text node into before, keyword, and after parts
    const nodeText = keywordNode.textContent || '';
    const beforeText = nodeText.substring(0, keywordIndex);
    const afterText = nodeText.substring(keywordIndex + keyword.length);

    // Create a date container
    const dateContainer = createSpan({
      cls: `todoseq-${type}-line`,
      attr: {
        'data-date-line-type': type,
        'aria-label': `${type} date line`,
        role: 'note',
      },
    });

    // Replace the original text node with the new structure
    keywordNode.parentNode?.replaceChild(dateContainer, keywordNode);

    // Create before text node
    const beforeNode = window.activeDocument.createTextNode(beforeText);
    dateContainer.appendChild(beforeNode);

    // Create a styled keyword span
    dateContainer.createSpan({
      cls: `todoseq-${type}-keyword`,
      text: keyword,
      attr: {
        'data-date-keyword': keyword,
        'aria-label': `${type} keyword`,
        role: 'mark',
      },
    });

    // Create after text node
    const afterNode = window.activeDocument.createTextNode(afterText);
    dateContainer.appendChild(afterNode);
  }

  /**
   * Check if a text contains a task keyword
   */
  private findFirstKeywordIndex(text: string): number {
    const si = text.indexOf('SCHEDULED:');
    const di = text.indexOf('DEADLINE:');
    const ci = text.indexOf('CLOSED:');
    const dsi = text.indexOf('DESCRIPTION:');
    const indices = [si, di, ci, dsi].filter((i) => i >= 0);
    return indices.length > 0 ? Math.min(...indices) : -1;
  }

  private containsTaskKeyword(text: string): boolean {
    const taskParser = this.getTaskParser();
    if (!taskParser) {
      return false;
    }

    // Get all valid task keywords (default + user-defined)
    const taskKeywords = this.getAllTaskKeywords();

    // Check if any task keyword is at the beginning of the line
    for (const keyword of taskKeywords) {
      if (text.trim().startsWith(keyword)) {
        return true;
      }
    }

    // Also use the task parser to check for patterns
    const parserResult = taskParser.testRegex.test(text);
    return parserResult;
  }

  /**
   * Attach click event handlers to task keywords for state toggling and context menu
   */
  private attachKeywordClickHandlers(
    element: HTMLElement,
    context: { sourcePath: string },
  ): void {
    const keywords = element.querySelectorAll('.todoseq-keyword-formatted');

    keywords.forEach((keyword: Element) => {
      if (!keyword.instanceOf(HTMLElement)) {
        return;
      }

      // Skip if already has handlers attached (check for data attribute)
      if (keyword.hasAttribute('data-todoseq-handlers-attached')) {
        return;
      }
      keyword.setAttribute('data-todoseq-handlers-attached', 'true');

      // Make the keyword focusable and add role for accessibility
      keyword.setAttribute('tabindex', '0');
      keyword.setAttribute('role', 'button');

      // Single click handler with double-click detection
      this.plugin.registerDomEvent(keyword, 'click', (event: MouseEvent) => {
        this.handleKeywordClick(event, keyword, context.sourcePath);
      });

      // Right-click context menu handler
      this.plugin.registerDomEvent(
        keyword,
        'contextmenu',
        (event: MouseEvent) => {
          this.handleKeywordContextMenu(event, keyword, context.sourcePath);
        },
      );

      // Keyboard support for accessibility
      this.plugin.registerDomEvent(
        keyword,
        'keydown',
        (event: KeyboardEvent) => {
          this.handleKeywordKeydown(event, keyword, context.sourcePath);
        },
      );
    });
  }

  /**
   * Handle click on task keyword with double-click detection
   * Single click toggles state, double click falls through for text selection
   */
  private handleKeywordClick(
    event: MouseEvent,
    keywordElement: HTMLElement,
    sourcePath: string,
  ): void {
    const currentTime = Date.now();
    const isDoubleClick =
      this.lastClickedElement === keywordElement &&
      currentTime - this.lastClickTime < this.DOUBLE_CLICK_THRESHOLD;

    // Clear any pending single click timeout
    if (this.pendingClickTimeout) {
      window.clearTimeout(this.pendingClickTimeout);
      this.pendingClickTimeout = null;
    }

    if (isDoubleClick) {
      // Double click detected - reset state and allow default behavior (text selection)
      this.lastClickedElement = null;
      this.lastClickTime = 0;
      return; // Don't prevent default - let text selection happen
    }

    // Store click state for double-click detection
    this.lastClickedElement = keywordElement;
    this.lastClickTime = currentTime;

    // Prevent default behavior for single click
    event.preventDefault();
    event.stopPropagation();

    // Set a timeout to process as single click if no second click occurs
    this.pendingClickTimeout = window.setTimeout(() => {
      this.pendingClickTimeout = null;
      this.lastClickedElement = null;
      this.lastClickTime = 0;

      // Process the single click - toggle task state
      void this.toggleTaskState(keywordElement, sourcePath);
    }, this.DOUBLE_CLICK_THRESHOLD);
  }

  /**
   * Handle right-click context menu on task keyword
   */
  private handleKeywordContextMenu(
    event: MouseEvent,
    keywordElement: HTMLElement,
    sourcePath: string,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    // Clear any pending single click timeout
    if (this.pendingClickTimeout) {
      window.clearTimeout(this.pendingClickTimeout);
      this.pendingClickTimeout = null;
      this.lastClickedElement = null;
      this.lastClickTime = 0;
    }

    const currentState = keywordElement.getAttribute('data-task-keyword');
    if (!currentState) {
      return;
    }

    // Build and show the state selection menu
    const menu = this.menuBuilder.buildStateMenu(
      currentState,
      async (newState: string) => {
        await this.updateTaskState(keywordElement, sourcePath, newState);
      },
    );

    menu.showAtPosition({ x: event.clientX, y: event.clientY });
  }

  /**
   * Handle keyboard events on task keyword for accessibility
   */
  private handleKeywordKeydown(
    event: KeyboardEvent,
    keywordElement: HTMLElement,
    sourcePath: string,
  ): void {
    const key = event.key;

    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      void this.toggleTaskState(keywordElement, sourcePath);
    } else if (key === 'F10' && event.shiftKey) {
      // Shift+F10 opens context menu (Windows convention)
      event.preventDefault();
      event.stopPropagation();
      const rect = keywordElement.getBoundingClientRect();
      const currentState = keywordElement.getAttribute('data-task-keyword');
      if (!currentState) return;

      const menu = this.menuBuilder.buildStateMenu(
        currentState,
        async (newState: string) => {
          await this.updateTaskState(keywordElement, sourcePath, newState);
        },
      );
      menu.showAtPosition({ x: rect.left, y: rect.bottom });
    } else if (key === 'ContextMenu') {
      // ContextMenu key opens context menu
      event.preventDefault();
      event.stopPropagation();
      const rect = keywordElement.getBoundingClientRect();
      const currentState = keywordElement.getAttribute('data-task-keyword');
      if (!currentState) return;

      const menu = this.menuBuilder.buildStateMenu(
        currentState,
        async (newState: string) => {
          await this.updateTaskState(keywordElement, sourcePath, newState);
        },
      );
      menu.showAtPosition({ x: rect.left, y: rect.bottom });
    }
  }

  /**
   * Toggle task state to the next state in the cycle
   */
  private async toggleTaskState(
    keywordElement: HTMLElement,
    sourcePath: string,
  ): Promise<void> {
    const currentState = keywordElement.getAttribute('data-task-keyword');
    if (!currentState) {
      return;
    }

    const transitionManager = getStateTransitionManager(
      this.plugin.taskUpdateCoordinator,
      this.plugin.keywordManager,
      this.plugin.settings?.stateTransitions,
    );
    const nextState = transitionManager.getNextState(currentState);

    await this.updateTaskState(keywordElement, sourcePath, nextState);
  }

  /**
   * Update task state to a specific new state
   */
  private async updateTaskState(
    keywordElement: HTMLElement,
    sourcePath: string,
    newState: string,
  ): Promise<void> {
    // Find the task associated with this keyword
    const task = await this.findTaskForKeyword(keywordElement, sourcePath);
    if (!task) {
      return;
    }

    // CRITICAL: Get fresh task from state manager to ensure we have latest data
    // The task object may be stale (e.g., old rawText)
    const freshTask = this.plugin.taskStateManager.findTaskByPathAndLine(
      task.path,
      task.line,
      task.tableCell?.cellIndex,
    );
    // Use fresh task if found, otherwise fall back to captured task
    const taskToUpdate = freshTask || task;

    // Use unified updateTaskByPath method - handles fresh lookup, optimistic update,
    // file write, recurrence, line adjustment, and UI refresh
    if (this.plugin.taskUpdateCoordinator) {
      await this.plugin.taskUpdateCoordinator.updateTaskByPath(
        taskToUpdate.path,
        taskToUpdate.line,
        newState,
        'reader',
        taskToUpdate.tableCell?.cellIndex,
      );
    } else if (this.plugin.taskEditor) {
      // Fallback to TaskEditor if coordinator not available
      await this.plugin.taskEditor.updateTaskState(
        taskToUpdate,
        newState,
        true,
      );
    }

    // Refresh the reader view to show changes (like CLOSED date line added/removed)
    if (this.plugin.refreshReaderViewFormatter) {
      this.plugin.refreshReaderViewFormatter();
    }
  }

  /**
   * Find the task associated with a keyword element
   */
  private async findTaskForKeyword(
    keywordElement: HTMLElement,
    sourcePath: string,
  ): Promise<Task | null> {
    // Get the keyword from the element
    const keyword = keywordElement.getAttribute('data-task-keyword');
    if (!keyword) {
      return null;
    }

    // Get the file
    const file = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) {
      return null;
    }

    // Get the task parser
    const taskParser = this.getTaskParser();
    if (!taskParser) {
      return null;
    }

    // Read the file content
    const content = await this.plugin.app.vault.read(file);
    const lines = content.split('\n');

    // Parse all tasks in the file
    const allTasks = taskParser.parseFile(content, file.path, file);

    // Get the task container
    const taskContainer = keywordElement.closest('.todoseq-task');
    if (!taskContainer) {
      return null;
    }

    // Get the line number from the parent list item (data-line attribute)
    const listItem = taskContainer.closest('li[data-line]');
    const lineNumberAttr = listItem?.getAttribute('data-line');
    const lineNumber = lineNumberAttr ? parseInt(lineNumberAttr, 10) : null;

    // If we have a line number, try to find the task at that exact line first
    if (lineNumber !== null && lineNumber >= 0 && lineNumber < lines.length) {
      const line = lines[lineNumber];
      // Check if this line contains the keyword
      if (line.includes(keyword)) {
        // Find matching task from parsed tasks
        const matchingTask = allTasks.find((t) => t.line === lineNumber);
        if (matchingTask) {
          return matchingTask;
        }
        // If no parsed task found, return a minimal task for this line
        const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return {
          path: file.path,
          line: lineNumber,
          rawText: line,
          indent: '',
          listMarker: '',
          text: line
            .replace(new RegExp(`^.*?${escapedKeyword}\\s*`), '')
            .trim(),
          state: keyword,
          completed: false,
          priority: null,
          scheduledDate: null,
          scheduledDateRepeat: null,
          deadlineDate: null,
          deadlineDateRepeat: null,
          closedDate: null,
          scheduledWarningPeriod: null,
          deadlineWarningPeriod: null,
          urgency: null,
          isDailyNote: false,
          dailyNoteDate: null,
          subtaskCount: 0,
          subtaskCompletedCount: 0,
        };
      }
    }

    // Fallback: use text-based matching if line number is not available
    // Get the full task text from DOM using stripMarkdownForDisplay for consistent normalization
    const domFullText = stripMarkdownForDisplay(
      taskContainer.textContent || '',
    );

    // Use stripMarkdownForDisplay for consistent text normalization
    // Compare full task text (including priority) to find the correct task line

    // First, try to find a task with matching line number and text
    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      if (task.state === keyword) {
        // Get the normalized task text from source
        const sourceText = stripMarkdownForDisplay(task.text);
        const normalizedSource = sourceText.toLowerCase().trim();
        const normalizedDom = domFullText.toLowerCase().trim();

        // Check if the full text matches (this handles priority too)
        if (normalizedSource === normalizedDom) {
          return task;
        }
      }
    }

    // Second, try matching with keyword + text content (allows for small differences)
    for (let i = 0; i < allTasks.length; i++) {
      const task = allTasks[i];
      if (task.state === keyword) {
        const sourceText = stripMarkdownForDisplay(task.text)
          .toLowerCase()
          .trim();
        const domText = domFullText.toLowerCase().trim();

        // Check if source text is contained in DOM text (or vice versa)
        if (domText.includes(sourceText) || sourceText.includes(domText)) {
          return task;
        }
      }
    }

    // Third, try matching by line index when we have multiple tasks with same keyword
    // Use DOM order to find relative position
    const tasksWithKeyword = allTasks.filter((t) => t.state === keyword);
    if (tasksWithKeyword.length > 0) {
      // Get the task container's position relative to other task containers
      const allTaskContainers =
        keywordElement.closest('div')?.querySelectorAll('.todoseq-task') || [];
      const containerIndex =
        Array.from(allTaskContainers).indexOf(taskContainer);

      if (containerIndex >= 0 && containerIndex < tasksWithKeyword.length) {
        return tasksWithKeyword[containerIndex];
      }

      // Fallback: return first task with matching keyword
      return tasksWithKeyword[0];
    }

    return null;
  }

  /**
   * Clean up any resources
   */
  cleanup(): void {
    // Clear any pending timeouts
    if (this.pendingClickTimeout) {
      window.clearTimeout(this.pendingClickTimeout);
      this.pendingClickTimeout = null;
    }
  }
}
