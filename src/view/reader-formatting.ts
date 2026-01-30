import TodoTracker from '../main';
import { DEFAULT_COMPLETED_STATES, Task, NEXT_STATE } from '../task';
import { TaskParser } from '../parser/task-parser';
import { VaultScanner } from '../services/vault-scanner';
import { buildTaskKeywords } from '../utils/task-utils';
import { SettingsChangeDetector } from '../utils/settings-utils';
import { TFile } from 'obsidian';
import { StateMenuBuilder } from './state-menu-builder';

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
    this.menuBuilder = new StateMenuBuilder(
      this.plugin.app,
      this.plugin.settings,
    );
  }

  /**
   * Get the shared task parser from VaultScanner
   */
  private getTaskParser(): TaskParser | null {
    return this.vaultScanner.getParser();
  }

  /**
   * Create a keyword span element with proper attributes using Obsidian DOM helpers
   */
  private createKeywordSpan(keyword: string): HTMLSpanElement {
    const tempContainer = document.createElement('div');
    const span = tempContainer.createSpan({
      cls: 'todoseq-keyword-formatted',
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
    const tempContainer = document.createElement('div');
    const container = tempContainer.createSpan({ cls: 'todoseq-task' });
    return container;
  }

  /**
   * Create a completed task container span element using Obsidian DOM helpers
   */
  private createCompletedTaskContainer(): HTMLSpanElement {
    const tempContainer = document.createElement('div');
    const container = tempContainer.createSpan({
      cls: 'todoseq-completed-task-text',
      attr: {
        'data-completed-task': 'true',
      },
    });
    return container;
  }

  /**
   * Get all valid task keywords (default + user-defined)
   */
  private getAllTaskKeywords(): string[] {
    // Use the shared utility to build keyword list
    const { allKeywords } = buildTaskKeywords(
      this.plugin.settings?.additionalTaskKeywords,
    );
    return allKeywords;
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
      if (!(checkbox instanceof HTMLElement)) {
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

    // Find the task associated with this checkbox
    const task = await this.findTaskForCheckbox(taskListItem, file);
    if (!task) {
      return;
    }

    // Determine the new state based on checkbox state
    const newState = isChecked ? 'DONE' : 'TODO';

    // Use TaskEditor to update the task
    if (this.plugin.taskEditor) {
      await this.plugin.taskEditor.applyLineUpdate(task, newState);
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
    // We need to find tasks that match the content after the checkbox
    // Normalize the task text by removing leading/trailing whitespace
    const normalizedTaskText = taskText.trim().replace(/\s+/g, ' ');

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
      if (taskElement.closest('.embedded-task-list-container')) {
        return;
      }

      // Skip if quote/callout blocks are disabled and this element is inside one
      if (
        !includeCalloutBlocks &&
        taskElement instanceof HTMLElement &&
        this.isInQuoteOrCalloutBlock(taskElement)
      ) {
        return;
      }

      const taskParagraph = taskElement.querySelector('p');

      if (taskParagraph) {
        // Process tasks with paragraph elements (standard case)
        this.processParagraphForTasks(taskParagraph);
      } else if (taskElement instanceof HTMLElement) {
        // Process tasks without paragraph elements (direct text in li)
        this.processTaskListItemDirectly(taskElement);
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
      if (paragraph.closest('.embedded-task-list-container')) {
        return;
      }

      if (paragraph instanceof HTMLElement) {
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
      if (listItem.closest('.embedded-task-list-container')) {
        return;
      }

      // Skip if quote/callout blocks are disabled and this list item is inside one
      if (
        !includeCalloutBlocks &&
        listItem instanceof HTMLElement &&
        this.isInQuoteOrCalloutBlock(listItem)
      ) {
        return;
      }

      if (!(listItem instanceof HTMLElement)) {
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

        // Create a span for the task keyword using helper method
        const keywordSpan = this.createKeywordSpan(keyword);

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
        if (DEFAULT_COMPLETED_STATES.has(keyword)) {
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
          const beforeSpan = document.createTextNode(beforeText);
          const afterSpan = document.createTextNode(afterText);

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
          const afterSpan = document.createTextNode(afterText);
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

    // Create a span for the task keyword
    const keywordSpan = this.createKeywordSpan(keyword);

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
    if (DEFAULT_COMPLETED_STATES.has(keyword)) {
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
          const beforeNode = document.createTextNode(beforeText);
          const afterNode = document.createTextNode(afterText);

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

        // Create a span for the task keyword using helper method
        const keywordSpan = this.createKeywordSpan(keyword);

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
        if (DEFAULT_COMPLETED_STATES.has(keyword)) {
          this.applyCompletedTaskStylingToTaskContainer(taskContainer, keyword);
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
          taskContainer.appendChild(document.createTextNode(beforeText));
        }

        // Add the keyword span
        taskContainer.appendChild(keywordSpan);

        // Add text after keyword
        const afterText = nodeText.substring(keywordEndInNode);
        if (afterText) {
          taskContainer.appendChild(document.createTextNode(afterText));
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
   * Get all text nodes within an element
   */
  private getTextNodes(element: HTMLElement): Node[] {
    const textNodes: Node[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);

    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    return textNodes;
  }

  /**
   * Process SCHEDULED and DEADLINE lines in the rendered HTML
   * Applies appropriate styling to date-related lines
   */
  private processDateLines(element: HTMLElement): void {
    // Find all paragraphs that might contain SCHEDULED or DEADLINE
    const paragraphs = element.querySelectorAll('p');

    paragraphs.forEach((paragraph) => {
      const text = paragraph.textContent || '';

      // Quick check: skip paragraphs without date keywords
      if (!text.includes('SCHEDULED:') && !text.includes('DEADLINE:')) {
        return;
      }

      // Check if this date line is associated with a task
      if (!this.hasPrecedingTask(paragraph)) {
        return;
      }

      // Process date keywords in this paragraph
      this.processDateKeywordsInParagraph(paragraph);
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
        const dateIndex =
          scheduledIndex >= 0
            ? deadlineIndex >= 0
              ? Math.min(scheduledIndex, deadlineIndex)
              : scheduledIndex
            : deadlineIndex;

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
        const dateIndex =
          scheduledIndex >= 0
            ? deadlineIndex >= 0
              ? Math.min(scheduledIndex, deadlineIndex)
              : scheduledIndex
            : deadlineIndex;

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
   * Process SCHEDULED: and DEADLINE: keywords in a paragraph
   */
  private processDateKeywordsInParagraph(
    paragraph: HTMLParagraphElement,
  ): void {
    const dateKeywords = [
      { keyword: 'SCHEDULED:', type: 'scheduled' as const },
      { keyword: 'DEADLINE:', type: 'deadline' as const },
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
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);

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
    type: 'scheduled' | 'deadline',
  ): void {
    // Create a date container
    const dateContainer = document.createElement('span');
    dateContainer.className = `todoseq-${type}-line`;
    dateContainer.setAttribute('data-date-line-type', type);
    dateContainer.setAttribute('aria-label', `${type} date line`);
    dateContainer.setAttribute('role', 'note');

    // Create a styled keyword span
    const keywordSpan = document.createElement('span');
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
    const beforeNode = document.createTextNode(beforeText);
    const afterNode = document.createTextNode(afterText);

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
      if (!(keyword instanceof HTMLElement)) {
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
      clearTimeout(this.pendingClickTimeout);
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
      clearTimeout(this.pendingClickTimeout);
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

    // Get the next state from the NEXT_STATE map
    const nextState = NEXT_STATE.get(currentState);
    if (!nextState) {
      return;
    }

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

    // Use TaskEditor to update the task
    if (this.plugin.taskEditor) {
      await this.plugin.taskEditor.applyLineUpdate(task, newState);
    }
  }

  /**
   * Find the task associated with a keyword element
   */
  private async findTaskForKeyword(
    keywordElement: HTMLElement,
    sourcePath: string,
  ): Promise<Task | null> {
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

    // Find the task list item or paragraph containing this keyword
    const taskContainer = keywordElement.closest(
      '.task-list-item, .todoseq-task, p, li',
    );
    if (!taskContainer) {
      return null;
    }

    // Get the text content of the task container
    const taskText = taskContainer.textContent || '';

    // Normalize the task text by removing leading/trailing whitespace
    const normalizedTaskText = taskText.trim().replace(/\s+/g, ' ');

    // Find the line that matches this task
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (taskParser.testRegex.test(line)) {
        // Normalize the line for comparison
        const normalizedLine = line
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/\s*\^[a-zA-Z0-9-]+$/, '');

        // Check if the line ends with the task text
        if (normalizedLine.endsWith(normalizedTaskText)) {
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
   * Clean up any resources
   */
  cleanup(): void {
    // Clear any pending timeouts
    if (this.pendingClickTimeout) {
      clearTimeout(this.pendingClickTimeout);
      this.pendingClickTimeout = null;
    }
  }
}
