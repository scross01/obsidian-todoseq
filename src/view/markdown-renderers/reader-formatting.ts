import TodoTracker from '../../main';
import { Task } from '../../types/task';
import { TaskParser } from '../../parser/task-parser';
import { VaultScanner } from '../../services/vault-scanner';
import { stripMarkdownForDisplay } from '../../utils/task-utils';
import { KeywordManager } from '../../utils/keyword-manager';
import { SettingsChangeDetector } from '../../utils/settings-utils';
import { PRIORITY_TOKEN_REGEX } from '../../utils/patterns';
import { TFile } from 'obsidian';
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
    this.settingsDetector = new SettingsChangeDetector();
    this.settingsDetector.initialize(this.plugin.settings);

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
    const tempFrag = window.activeDocument.createDocumentFragment();
    const tempContainer = tempFrag.createDiv();
    let cssClasses = 'todoseq-keyword-formatted';
    if (isArchived) {
      cssClasses += ' todoseq-archived-keyword';
    } else if (isCompleted) {
      cssClasses += ' todoseq-completed-keyword';
    }
    const span = tempContainer.createSpan({
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
    const tempFrag = window.activeDocument.createDocumentFragment();
    const tempContainer = tempFrag.createDiv();
    const container = tempContainer.createSpan({ cls: 'todoseq-task' });
    return container;
  }

  /**
   * Create a completed task container span element using Obsidian DOM helpers
   */
  private createCompletedTaskContainer(): HTMLSpanElement {
    const tempFrag = window.activeDocument.createDocumentFragment();
    const tempContainer = tempFrag.createDiv();
    const container = tempContainer.createSpan({
      cls: 'todoseq-completed-task-text',
      attr: {
        'data-completed-task': 'true',
      },
    });
    return container;
  }

  /**
   * Create an archived task container span element using Obsidian DOM helpers
   */
  private createArchivedTaskContainer(): HTMLSpanElement {
    const tempFrag = window.activeDocument.createDocumentFragment();
    const tempContainer = tempFrag.createDiv();
    const container = tempContainer.createSpan({
      cls: 'todoseq-archived-task-text',
      attr: {
        'data-archived-task': 'true',
      },
    });
    return container;
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
    if (
      this.settingsDetector.hasFormattingSettingsChanged(this.plugin.settings)
    ) {
      // Update the previous state to match current settings
      this.settingsDetector.updatePreviousState(this.plugin.settings);
    }
  }

  /**
   * Register the markdown post processor for reader view formatting
   */
  registerPostProcessor(): void {
    this.plugin.registerMarkdownPostProcessor((element, context) => {
      if (!this.plugin.settings.formatTaskKeywords) {
        return;
      }

      // Check if we need to update the parser (e.g., if settings changed)
      this.ensureParserUpToDate();

      // Process task keywords in the rendered content
      this.processTaskKeywords(element);

      // Process priority pills in task lines
      this.processPriorityPills(element);

      // Process SCHEDULED and DEADLINE lines
      this.processDateLines(element);

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

    // Process bullet list items without checkboxes (checking each individually for quote/callout context)
    this.processBulletListItems(element, includeCalloutBlocks);
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
        !taskParser.testRegex.test(paragraph.textContent || '')
      ) {
        return;
      }

      // Process priority tokens in this paragraph
      this.processPriorityPillsInElement(paragraph);
    });
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

    const tempFrag = window.activeDocument.createDocumentFragment();
    const container = tempFrag.createDiv();
    const span = container.createSpan({
      cls: `todoseq-priority-badge ${priorityClass}`,
      attr: {
        'data-priority': letter,
        'aria-label': `Priority ${letter}`,
        role: 'badge',
      },
    });

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

    // Use the task parser to test this line
    const testResult = taskParser.testRegex.test(lineText);

    if (testResult) {
      const match = taskParser.testRegex.exec(lineText);

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
   * Applies appropriate styling to date-related lines
   */
  private processDateLines(element: HTMLElement): void {
    // Find all paragraphs that might contain SCHEDULED, DEADLINE, or CLOSED
    const paragraphs = element.querySelectorAll('p');

    paragraphs.forEach((paragraph) => {
      const text = paragraph.textContent || '';

      // Quick check: skip paragraphs without date keywords
      if (
        !text.includes('SCHEDULED:') &&
        !text.includes('DEADLINE:') &&
        !text.includes('CLOSED:')
      ) {
        return;
      }

      // Check if this date line is associated with a task
      if (!this.hasPrecedingTask(paragraph)) {
        return;
      }

      // Process date keywords in this paragraph
      this.processDateKeywordsInParagraph(paragraph);
    });

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
   * Check previous sibling elements for tasks
   */
  private hasTaskInPreviousSiblings(paragraph: HTMLParagraphElement): boolean {
    let previousElement = paragraph.previousElementSibling;

    while (previousElement) {
      const prevText = previousElement.textContent || '';

      // Check if the previous element contains a task keyword
      if (this.containsTaskKeyword(prevText)) {
        return true;
      }

      // Check if this is a task list item
      if (previousElement.classList.contains('task-list-item')) {
        return true;
      }

      previousElement = previousElement.previousElementSibling;
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

        // Check if this text node contains a date keyword
        const scheduledIndex = nodeText.indexOf('SCHEDULED:');
        const deadlineIndex = nodeText.indexOf('DEADLINE:');
        const closedIndex = nodeText.indexOf('CLOSED:');
        const dateIndex =
          scheduledIndex >= 0
            ? deadlineIndex >= 0
              ? closedIndex >= 0
                ? Math.min(scheduledIndex, deadlineIndex, closedIndex)
                : Math.min(scheduledIndex, deadlineIndex)
              : closedIndex >= 0
                ? Math.min(scheduledIndex, closedIndex)
                : scheduledIndex
            : deadlineIndex >= 0
              ? closedIndex >= 0
                ? Math.min(deadlineIndex, closedIndex)
                : deadlineIndex
              : closedIndex;

        if (dateIndex >= 0) {
          // Found the date line - check text before it
          textBeforeDate += nodeText.substring(0, dateIndex);
          dateLineFound = true;
        } else {
          textBeforeDate += nodeText;
        }
      } else if (node.nodeName === 'BR') {
        // Check text accumulated before this <br>
        if (this.containsTaskKeyword(textBeforeDate.trim())) {
          return true;
        }
        textBeforeDate = '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // For element nodes (like spans), check their text content
        const element = node as HTMLElement;
        const elementText = element.textContent || '';

        // Check if this element contains a date keyword
        const scheduledIndex = elementText.indexOf('SCHEDULED:');
        const deadlineIndex = elementText.indexOf('DEADLINE:');
        const closedIndex = elementText.indexOf('CLOSED:');
        const dateIndex =
          scheduledIndex >= 0
            ? deadlineIndex >= 0
              ? closedIndex >= 0
                ? Math.min(scheduledIndex, deadlineIndex, closedIndex)
                : Math.min(scheduledIndex, deadlineIndex)
              : closedIndex >= 0
                ? Math.min(scheduledIndex, closedIndex)
                : scheduledIndex
            : deadlineIndex >= 0
              ? closedIndex >= 0
                ? Math.min(deadlineIndex, closedIndex)
                : deadlineIndex
              : closedIndex;

        if (dateIndex >= 0) {
          // Found the date line - check text before it
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
    // Create a date container
    const dateContainer = window.activeDocument.createElement('span');
    dateContainer.className = `todoseq-${type}-line`;
    dateContainer.setAttribute('data-date-line-type', type);
    dateContainer.setAttribute('aria-label', `${type} date line`);
    dateContainer.setAttribute('role', 'note');

    // Create a styled keyword span
    const keywordSpan = window.activeDocument.createElement('span');
    keywordSpan.className = `todoseq-${type}-keyword`;
    keywordSpan.textContent = keyword;
    keywordSpan.setAttribute('data-date-keyword', keyword);
    keywordSpan.setAttribute('aria-label', `${type} keyword`);
    keywordSpan.setAttribute('role', 'mark');

    // Split the text node into before, keyword, and after parts
    const nodeText = keywordNode.textContent || '';
    const beforeText = nodeText.substring(0, keywordIndex);
    const afterText = nodeText.substring(keywordIndex + keyword.length);

    // Create new text nodes
    const beforeNode = window.activeDocument.createTextNode(beforeText);
    const afterNode = window.activeDocument.createTextNode(afterText);

    // Replace the original text node with the new structure
    keywordNode.parentNode?.replaceChild(dateContainer, keywordNode);
    dateContainer.appendChild(beforeNode);
    dateContainer.appendChild(keywordSpan);
    dateContainer.appendChild(afterNode);
  }

  /**
   * Check if a text contains a task keyword
   */
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
