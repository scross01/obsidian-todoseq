/**
 * @jest-environment jsdom
 */

// Mock localStorage to prevent --localstorage-file warning in Node.js v20+
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0,
};
Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

import { ReaderViewFormatter } from '../src/view/markdown-renderers/reader-formatting';
import { TodoTrackerSettings } from '../src/settings/settings';
import { TaskParser } from '../src/parser/task-parser';
import { VaultScanner } from '../src/services/vault-scanner';
import { App } from 'obsidian';

// Mock Obsidian's createSpan helper on HTMLElement prototype
if (!HTMLElement.prototype.createSpan) {
  HTMLElement.prototype.createSpan = function (config?: {
    cls?: string;
    text?: string;
    attr?: Record<string, string>;
  }): HTMLSpanElement {
    const span = document.createElement('span');
    if (config?.cls) {
      span.className = config.cls;
    }
    if (config?.text) {
      span.textContent = config.text;
    }
    if (config?.attr) {
      Object.entries(config.attr).forEach(([key, value]) => {
        span.setAttribute(key, value);
      });
    }
    return span;
  };
}

// Mock Obsidian's TFile
jest.mock('obsidian', () => ({
  TFile: class TFile {
    path: string;
    name: string;
    extension: string;
    constructor(path: string, name?: string) {
      this.path = path;
      this.name = name || path.split('/').pop() || '';
      this.extension = 'md';
    }
  },
  App: class App {
    vault = {
      getAbstractFileByPath: jest.fn(),
      read: jest.fn(),
      getFiles: jest.fn().mockReturnValue([]),
    };
  },
}));

// Mock TodoTracker plugin
const createMockPlugin = (settings: TodoTrackerSettings) => ({
  settings,
  app: new App(),
  registerMarkdownPostProcessor: jest.fn(),
  registerDomEvent: jest.fn(),
  taskEditor: null as unknown,
  refreshVisibleEditorDecorations: jest.fn(),
  refreshReaderViewFormatter: jest.fn(),
  recreateParser: jest.fn(),
  scanVault: jest.fn(),
  saveSettings: jest.fn(),
  updateTaskFormatting: jest.fn(),
});

// Mock VaultScanner
const createMockVaultScanner = (parser: TaskParser | null) => ({
  getParser: jest.fn().mockReturnValue(parser),
  getTasks: jest.fn().mockReturnValue([]),
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  scanVault: jest.fn(),
  scanFile: jest.fn(),
  handleFileChange: jest.fn(),
  handleFileRename: jest.fn(),
  updateSettings: jest.fn(),
  updateParser: jest.fn(),
  destroy: jest.fn(),
});

describe('ReaderViewFormatter', () => {
  let mockSettings: TodoTrackerSettings;
  let mockPlugin: ReturnType<typeof createMockPlugin>;
  let mockVaultScanner: ReturnType<typeof createMockVaultScanner>;
  let formatter: ReaderViewFormatter;
  let mockParser: TaskParser;

  beforeEach(() => {
    // Setup default settings
    mockSettings = {
      additionalTaskKeywords: [],
      includeCodeBlocks: false,
      includeCalloutBlocks: true,
      includeCommentBlocks: false,
      taskListViewMode: 'showAll',
      futureTaskSorting: 'showAll',
      defaultSortMethod: 'default',
      languageCommentSupport: { enabled: true },
      weekStartsOn: 'Monday',
      formatTaskKeywords: true,
    };

    // Create mock parser
    mockParser = TaskParser.create(mockSettings, null);

    // Create mocks
    mockPlugin = createMockPlugin(mockSettings);
    mockVaultScanner = createMockVaultScanner(mockParser);

    // Create formatter instance
    formatter = new ReaderViewFormatter(
      mockPlugin as unknown as import('../src/main').default,
      mockVaultScanner as unknown as VaultScanner,
    );

    // Setup DOM environment for tests that need it
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.clearAllMocks();
    formatter.cleanup();
  });

  describe('constructor', () => {
    test('should initialize with plugin and vault scanner', () => {
      expect(formatter).toBeDefined();
    });

    test('should initialize settings change detector', () => {
      // The constructor should initialize the settings detector
      // This is tested indirectly through ensureParserUpToDate behavior
      const newFormatter = new ReaderViewFormatter(
        mockPlugin as unknown as import('../src/main').default,
        mockVaultScanner as unknown as VaultScanner,
      );
      expect(newFormatter).toBeDefined();
    });
  });

  describe('createKeywordSpan', () => {
    test('should create a span element with correct class', () => {
      // Access private method via type assertion
      const createKeywordSpan = (
        formatter as unknown as {
          createKeywordSpan: (keyword: string) => HTMLSpanElement;
        }
      ).createKeywordSpan;
      const span = createKeywordSpan.call(formatter, 'TODO');

      expect(span.classList.contains('todoseq-keyword-formatted')).toBe(true);
    });

    test('should set correct text content', () => {
      const createKeywordSpan = (
        formatter as unknown as {
          createKeywordSpan: (keyword: string) => HTMLSpanElement;
        }
      ).createKeywordSpan;
      const span = createKeywordSpan.call(formatter, 'DONE');

      expect(span.textContent).toBe('DONE');
    });

    test('should set correct data attribute', () => {
      const createKeywordSpan = (
        formatter as unknown as {
          createKeywordSpan: (keyword: string) => HTMLSpanElement;
        }
      ).createKeywordSpan;
      const span = createKeywordSpan.call(formatter, 'DOING');

      expect(span.getAttribute('data-task-keyword')).toBe('DOING');
    });

    test('should set correct aria-label', () => {
      const createKeywordSpan = (
        formatter as unknown as {
          createKeywordSpan: (keyword: string) => HTMLSpanElement;
        }
      ).createKeywordSpan;
      const span = createKeywordSpan.call(formatter, 'TODO');

      expect(span.getAttribute('aria-label')).toBe('Task keyword: TODO');
    });

    test('should set correct role attribute', () => {
      const createKeywordSpan = (
        formatter as unknown as {
          createKeywordSpan: (keyword: string) => HTMLSpanElement;
        }
      ).createKeywordSpan;
      const span = createKeywordSpan.call(formatter, 'TODO');

      expect(span.getAttribute('role')).toBe('mark');
    });

    test('should set tabindex for accessibility', () => {
      const createKeywordSpan = (
        formatter as unknown as {
          createKeywordSpan: (keyword: string) => HTMLSpanElement;
        }
      ).createKeywordSpan;
      const span = createKeywordSpan.call(formatter, 'TODO');

      expect(span.getAttribute('tabindex')).toBe('0');
    });
  });

  describe('createTaskContainer', () => {
    test('should create a span element with correct class', () => {
      const createTaskContainer = (
        formatter as unknown as { createTaskContainer: () => HTMLSpanElement }
      ).createTaskContainer;
      const container = createTaskContainer.call(formatter);

      expect(container.classList.contains('todoseq-task')).toBe(true);
    });

    test('should return a span element', () => {
      const createTaskContainer = (
        formatter as unknown as { createTaskContainer: () => HTMLSpanElement }
      ).createTaskContainer;
      const container = createTaskContainer.call(formatter);

      expect(container.tagName).toBe('SPAN');
    });
  });

  describe('createCompletedTaskContainer', () => {
    test('should create a span element with correct class', () => {
      const createCompletedTaskContainer = (
        formatter as unknown as {
          createCompletedTaskContainer: () => HTMLSpanElement;
        }
      ).createCompletedTaskContainer;
      const container = createCompletedTaskContainer.call(formatter);

      expect(container.classList.contains('todoseq-completed-task-text')).toBe(
        true,
      );
    });

    test('should set data-completed-task attribute', () => {
      const createCompletedTaskContainer = (
        formatter as unknown as {
          createCompletedTaskContainer: () => HTMLSpanElement;
        }
      ).createCompletedTaskContainer;
      const container = createCompletedTaskContainer.call(formatter);

      expect(container.getAttribute('data-completed-task')).toBe('true');
    });

    test('should return a span element', () => {
      const createCompletedTaskContainer = (
        formatter as unknown as {
          createCompletedTaskContainer: () => HTMLSpanElement;
        }
      ).createCompletedTaskContainer;
      const container = createCompletedTaskContainer.call(formatter);

      expect(container.tagName).toBe('SPAN');
    });
  });

  describe('getAllTaskKeywords', () => {
    test('should return default keywords when no additional keywords', () => {
      const getAllTaskKeywords = (
        formatter as unknown as { getAllTaskKeywords: () => string[] }
      ).getAllTaskKeywords;
      const keywords = getAllTaskKeywords.call(formatter);

      expect(keywords).toContain('TODO');
      expect(keywords).toContain('DOING');
      expect(keywords).toContain('DONE');
      expect(keywords).toContain('LATER');
      expect(keywords).toContain('NOW');
      expect(keywords).toContain('WAIT');
      expect(keywords).toContain('WAITING');
      expect(keywords).toContain('IN-PROGRESS');
      expect(keywords).toContain('CANCELED');
      expect(keywords).toContain('CANCELLED');
    });

    test('should include additional keywords from settings', () => {
      mockPlugin.settings.additionalTaskKeywords = ['FIXME', 'HACK'];
      const getAllTaskKeywords = (
        formatter as unknown as { getAllTaskKeywords: () => string[] }
      ).getAllTaskKeywords;
      const keywords = getAllTaskKeywords.call(formatter);

      expect(keywords).toContain('FIXME');
      expect(keywords).toContain('HACK');
    });
  });

  describe('ensureParserUpToDate', () => {
    test('should not throw when called', () => {
      const ensureParserUpToDate = (
        formatter as unknown as { ensureParserUpToDate: () => void }
      ).ensureParserUpToDate;

      expect(() => ensureParserUpToDate.call(formatter)).not.toThrow();
    });

    test('should detect settings changes', () => {
      const ensureParserUpToDate = (
        formatter as unknown as { ensureParserUpToDate: () => void }
      ).ensureParserUpToDate;

      // First call should not detect changes
      ensureParserUpToDate.call(formatter);

      // Change settings
      mockPlugin.settings.includeCodeBlocks = true;

      // Second call should detect changes and update state
      ensureParserUpToDate.call(formatter);

      // Should not throw
      expect(() => ensureParserUpToDate.call(formatter)).not.toThrow();
    });
  });

  describe('isInQuoteOrCalloutBlock', () => {
    test('should return false for element not in blockquote', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);

      const isInQuoteOrCalloutBlock = (
        formatter as unknown as {
          isInQuoteOrCalloutBlock: (el: HTMLElement) => boolean;
        }
      ).isInQuoteOrCalloutBlock;
      const result = isInQuoteOrCalloutBlock.call(formatter, div);

      expect(result).toBe(false);
      document.body.removeChild(div);
    });

    test('should return true for element inside blockquote', () => {
      const blockquote = document.createElement('blockquote');
      const div = document.createElement('div');
      blockquote.appendChild(div);
      document.body.appendChild(blockquote);

      const isInQuoteOrCalloutBlock = (
        formatter as unknown as {
          isInQuoteOrCalloutBlock: (el: HTMLElement) => boolean;
        }
      ).isInQuoteOrCalloutBlock;
      const result = isInQuoteOrCalloutBlock.call(formatter, div);

      expect(result).toBe(true);
      document.body.removeChild(blockquote);
    });

    test('should return true for element inside callout', () => {
      const callout = document.createElement('div');
      callout.classList.add('callout');
      const div = document.createElement('div');
      callout.appendChild(div);
      document.body.appendChild(callout);

      const isInQuoteOrCalloutBlock = (
        formatter as unknown as {
          isInQuoteOrCalloutBlock: (el: HTMLElement) => boolean;
        }
      ).isInQuoteOrCalloutBlock;
      const result = isInQuoteOrCalloutBlock.call(formatter, div);

      expect(result).toBe(true);
      document.body.removeChild(callout);
    });

    test('should return true for element inside admonition', () => {
      const admonition = document.createElement('div');
      admonition.classList.add('admonition');
      const div = document.createElement('div');
      admonition.appendChild(div);
      document.body.appendChild(admonition);

      const isInQuoteOrCalloutBlock = (
        formatter as unknown as {
          isInQuoteOrCalloutBlock: (el: HTMLElement) => boolean;
        }
      ).isInQuoteOrCalloutBlock;
      const result = isInQuoteOrCalloutBlock.call(formatter, div);

      expect(result).toBe(true);
      document.body.removeChild(admonition);
    });

    test('should return false for element at document root', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);

      const isInQuoteOrCalloutBlock = (
        formatter as unknown as {
          isInQuoteOrCalloutBlock: (el: HTMLElement) => boolean;
        }
      ).isInQuoteOrCalloutBlock;
      const result = isInQuoteOrCalloutBlock.call(formatter, div);

      expect(result).toBe(false);
      document.body.removeChild(div);
    });
  });

  describe('containsTaskKeyword', () => {
    test('should return true for text starting with TODO', () => {
      const containsTaskKeyword = (
        formatter as unknown as {
          containsTaskKeyword: (text: string) => boolean;
        }
      ).containsTaskKeyword;
      const result = containsTaskKeyword.call(formatter, 'TODO something');

      expect(result).toBe(true);
    });

    test('should return true for text starting with DONE', () => {
      const containsTaskKeyword = (
        formatter as unknown as {
          containsTaskKeyword: (text: string) => boolean;
        }
      ).containsTaskKeyword;
      const result = containsTaskKeyword.call(formatter, 'DONE something');

      expect(result).toBe(true);
    });

    test('should return false for text without task keyword', () => {
      const containsTaskKeyword = (
        formatter as unknown as {
          containsTaskKeyword: (text: string) => boolean;
        }
      ).containsTaskKeyword;
      const result = containsTaskKeyword.call(
        formatter,
        'This is just regular text',
      );

      expect(result).toBe(false);
    });

    test('should return true for text with DOING keyword', () => {
      const containsTaskKeyword = (
        formatter as unknown as {
          containsTaskKeyword: (text: string) => boolean;
        }
      ).containsTaskKeyword;
      const result = containsTaskKeyword.call(formatter, 'DOING some work');

      expect(result).toBe(true);
    });

    test('should return true for text with WAIT keyword', () => {
      const containsTaskKeyword = (
        formatter as unknown as {
          containsTaskKeyword: (text: string) => boolean;
        }
      ).containsTaskKeyword;
      const result = containsTaskKeyword.call(formatter, 'WAIT for response');

      expect(result).toBe(true);
    });
  });

  describe('getTextNodes', () => {
    test('should return empty array for empty element', () => {
      const div = document.createElement('div');

      const getTextNodes = (
        formatter as unknown as { getTextNodes: (el: HTMLElement) => Node[] }
      ).getTextNodes;
      const result = getTextNodes.call(formatter, div);

      expect(result).toEqual([]);
    });

    test('should return text nodes from element', () => {
      const div = document.createElement('div');
      div.textContent = 'Hello world';

      const getTextNodes = (
        formatter as unknown as { getTextNodes: (el: HTMLElement) => Node[] }
      ).getTextNodes;
      const result = getTextNodes.call(formatter, div);

      expect(result.length).toBe(1);
      expect(result[0].textContent).toBe('Hello world');
    });

    test('should return multiple text nodes from nested elements', () => {
      const div = document.createElement('div');
      div.innerHTML = '<span>Hello</span> <span>world</span>';

      const getTextNodes = (
        formatter as unknown as { getTextNodes: (el: HTMLElement) => Node[] }
      ).getTextNodes;
      const result = getTextNodes.call(formatter, div);

      expect(result.length).toBe(3);
    });

    test('should return text nodes in document order', () => {
      const div = document.createElement('div');
      div.innerHTML = '<p>First</p><p>Second</p>';

      const getTextNodes = (
        formatter as unknown as { getTextNodes: (el: HTMLElement) => Node[] }
      ).getTextNodes;
      const result = getTextNodes.call(formatter, div);

      expect(result[0].textContent).toBe('First');
      expect(result[1].textContent).toBe('Second');
    });
  });

  describe('hasPrecedingTask', () => {
    test('should check for task in previous siblings', () => {
      const container = document.createElement('div');
      const taskParagraph = document.createElement('p');
      taskParagraph.textContent = 'TODO something';
      const dateParagraph = document.createElement('p');
      dateParagraph.textContent = 'SCHEDULED: today';

      container.appendChild(taskParagraph);
      container.appendChild(dateParagraph);
      document.body.appendChild(container);

      const hasPrecedingTask = (
        formatter as unknown as {
          hasPrecedingTask: (p: HTMLParagraphElement) => boolean;
        }
      ).hasPrecedingTask;
      const result = hasPrecedingTask.call(formatter, dateParagraph);

      expect(result).toBe(true);
      document.body.removeChild(container);
    });

    test('should return false when no preceding task', () => {
      const container = document.createElement('div');
      const dateParagraph = document.createElement('p');
      dateParagraph.textContent = 'SCHEDULED: today';

      container.appendChild(dateParagraph);
      document.body.appendChild(container);

      const hasPrecedingTask = (
        formatter as unknown as {
          hasPrecedingTask: (p: HTMLParagraphElement) => boolean;
        }
      ).hasPrecedingTask;
      const result = hasPrecedingTask.call(formatter, dateParagraph);

      expect(result).toBe(false);
      document.body.removeChild(container);
    });
  });

  describe('hasTaskInPreviousSiblings', () => {
    test('should find task in previous sibling', () => {
      const container = document.createElement('div');
      const taskParagraph = document.createElement('p');
      taskParagraph.textContent = 'TODO something';
      const otherParagraph = document.createElement('p');
      otherParagraph.textContent = 'SCHEDULED: today';

      container.appendChild(taskParagraph);
      container.appendChild(otherParagraph);
      document.body.appendChild(container);

      const hasTaskInPreviousSiblings = (
        formatter as unknown as {
          hasTaskInPreviousSiblings: (p: HTMLParagraphElement) => boolean;
        }
      ).hasTaskInPreviousSiblings;
      const result = hasTaskInPreviousSiblings.call(formatter, otherParagraph);

      expect(result).toBe(true);
      document.body.removeChild(container);
    });

    test('should return false when no previous siblings', () => {
      const paragraph = document.createElement('p');
      paragraph.textContent = 'SCHEDULED: today';
      document.body.appendChild(paragraph);

      const hasTaskInPreviousSiblings = (
        formatter as unknown as {
          hasTaskInPreviousSiblings: (p: HTMLParagraphElement) => boolean;
        }
      ).hasTaskInPreviousSiblings;
      const result = hasTaskInPreviousSiblings.call(formatter, paragraph);

      expect(result).toBe(false);
      document.body.removeChild(paragraph);
    });

    test('should detect task-list-item class', () => {
      const container = document.createElement('div');
      const taskItem = document.createElement('div');
      taskItem.classList.add('task-list-item');
      const otherParagraph = document.createElement('p');
      otherParagraph.textContent = 'SCHEDULED: today';

      container.appendChild(taskItem);
      container.appendChild(otherParagraph);
      document.body.appendChild(container);

      const hasTaskInPreviousSiblings = (
        formatter as unknown as {
          hasTaskInPreviousSiblings: (p: HTMLParagraphElement) => boolean;
        }
      ).hasTaskInPreviousSiblings;
      const result = hasTaskInPreviousSiblings.call(formatter, otherParagraph);

      expect(result).toBe(true);
      document.body.removeChild(container);
    });
  });

  describe('hasTaskBeforeDateInParagraph', () => {
    test('should find task before date in same paragraph', () => {
      const paragraph = document.createElement('p');
      paragraph.textContent = 'TODO something SCHEDULED: today';
      document.body.appendChild(paragraph);

      const hasTaskBeforeDateInParagraph = (
        formatter as unknown as {
          hasTaskBeforeDateInParagraph: (p: HTMLParagraphElement) => boolean;
        }
      ).hasTaskBeforeDateInParagraph;
      const result = hasTaskBeforeDateInParagraph.call(formatter, paragraph);

      expect(result).toBe(true);
      document.body.removeChild(paragraph);
    });

    test('should handle br elements as separators', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'TODO something<br>SCHEDULED: today';
      document.body.appendChild(paragraph);

      const hasTaskBeforeDateInParagraph = (
        formatter as unknown as {
          hasTaskBeforeDateInParagraph: (p: HTMLParagraphElement) => boolean;
        }
      ).hasTaskBeforeDateInParagraph;
      const result = hasTaskBeforeDateInParagraph.call(formatter, paragraph);

      expect(result).toBe(true);
      document.body.removeChild(paragraph);
    });

    test('should return false when only date line exists', () => {
      const paragraph = document.createElement('p');
      paragraph.textContent = 'SCHEDULED: today';
      document.body.appendChild(paragraph);

      const hasTaskBeforeDateInParagraph = (
        formatter as unknown as {
          hasTaskBeforeDateInParagraph: (p: HTMLParagraphElement) => boolean;
        }
      ).hasTaskBeforeDateInParagraph;
      const result = hasTaskBeforeDateInParagraph.call(formatter, paragraph);

      expect(result).toBe(false);
      document.body.removeChild(paragraph);
    });
  });

  describe('registerPostProcessor', () => {
    test('should register markdown post processor', () => {
      formatter.registerPostProcessor();

      expect(mockPlugin.registerMarkdownPostProcessor).toHaveBeenCalled();
    });

    test('should not process when formatTaskKeywords is disabled', () => {
      mockPlugin.settings.formatTaskKeywords = false;
      formatter.registerPostProcessor();

      const registeredCallback =
        mockPlugin.registerMarkdownPostProcessor.mock.calls[0][0];
      const mockElement = document.createElement('div');
      const mockContext = { sourcePath: 'test.md' };

      // Should return early without processing
      registeredCallback(mockElement, mockContext);

      // No errors should be thrown
      expect(() => registeredCallback(mockElement, mockContext)).not.toThrow();
    });
  });

  describe('cleanup', () => {
    test('should not throw when called', () => {
      expect(() => formatter.cleanup()).not.toThrow();
    });

    test('should be callable multiple times', () => {
      expect(() => {
        formatter.cleanup();
        formatter.cleanup();
      }).not.toThrow();
    });
  });

  describe('findDateKeywordNode', () => {
    test('should find SCHEDULED: in text node', () => {
      const paragraph = document.createElement('p');
      paragraph.textContent = 'SCHEDULED: 2024-01-01';
      document.body.appendChild(paragraph);

      const findDateKeywordNode = (
        formatter as unknown as {
          findDateKeywordNode: (
            p: HTMLParagraphElement,
            keyword: string,
          ) => { node: Text; index: number } | null;
        }
      ).findDateKeywordNode;
      const result = findDateKeywordNode.call(
        formatter,
        paragraph,
        'SCHEDULED:',
      );

      expect(result).not.toBeNull();
      expect(result?.index).toBe(0);
      document.body.removeChild(paragraph);
    });

    test('should find DEADLINE: in text node', () => {
      const paragraph = document.createElement('p');
      paragraph.textContent = 'DEADLINE: 2024-01-01';
      document.body.appendChild(paragraph);

      const findDateKeywordNode = (
        formatter as unknown as {
          findDateKeywordNode: (
            p: HTMLParagraphElement,
            keyword: string,
          ) => { node: Text; index: number } | null;
        }
      ).findDateKeywordNode;
      const result = findDateKeywordNode.call(
        formatter,
        paragraph,
        'DEADLINE:',
      );

      expect(result).not.toBeNull();
      expect(result?.index).toBe(0);
      document.body.removeChild(paragraph);
    });

    test('should return null when keyword not found', () => {
      const paragraph = document.createElement('p');
      paragraph.textContent = 'Some other text';
      document.body.appendChild(paragraph);

      const findDateKeywordNode = (
        formatter as unknown as {
          findDateKeywordNode: (
            p: HTMLParagraphElement,
            keyword: string,
          ) => { node: Text; index: number } | null;
        }
      ).findDateKeywordNode;
      const result = findDateKeywordNode.call(
        formatter,
        paragraph,
        'SCHEDULED:',
      );

      expect(result).toBeNull();
      document.body.removeChild(paragraph);
    });
  });

  describe('wrapDateKeyword', () => {
    test('should wrap SCHEDULED: keyword in styled spans', () => {
      const paragraph = document.createElement('p');
      const textNode = document.createTextNode('SCHEDULED: 2024-01-01');
      paragraph.appendChild(textNode);
      document.body.appendChild(paragraph);

      const wrapDateKeyword = (
        formatter as unknown as {
          wrapDateKeyword: (
            node: Text,
            index: number,
            keyword: string,
            type: 'scheduled' | 'deadline',
          ) => void;
        }
      ).wrapDateKeyword;
      wrapDateKeyword.call(formatter, textNode, 0, 'SCHEDULED:', 'scheduled');

      const dateContainer = paragraph.querySelector('.todoseq-scheduled-line');
      expect(dateContainer).not.toBeNull();

      const keywordSpan = paragraph.querySelector('.todoseq-scheduled-keyword');
      expect(keywordSpan).not.toBeNull();
      expect(keywordSpan?.textContent).toBe('SCHEDULED:');

      document.body.removeChild(paragraph);
    });

    test('should wrap DEADLINE: keyword in styled spans', () => {
      const paragraph = document.createElement('p');
      const textNode = document.createTextNode('DEADLINE: 2024-01-01');
      paragraph.appendChild(textNode);
      document.body.appendChild(paragraph);

      const wrapDateKeyword = (
        formatter as unknown as {
          wrapDateKeyword: (
            node: Text,
            index: number,
            keyword: string,
            type: 'scheduled' | 'deadline',
          ) => void;
        }
      ).wrapDateKeyword;
      wrapDateKeyword.call(formatter, textNode, 0, 'DEADLINE:', 'deadline');

      const dateContainer = paragraph.querySelector('.todoseq-deadline-line');
      expect(dateContainer).not.toBeNull();

      const keywordSpan = paragraph.querySelector('.todoseq-deadline-keyword');
      expect(keywordSpan).not.toBeNull();
      expect(keywordSpan?.textContent).toBe('DEADLINE:');

      document.body.removeChild(paragraph);
    });

    test('should set correct aria-label on date container', () => {
      const paragraph = document.createElement('p');
      const textNode = document.createTextNode('SCHEDULED: 2024-01-01');
      paragraph.appendChild(textNode);
      document.body.appendChild(paragraph);

      const wrapDateKeyword = (
        formatter as unknown as {
          wrapDateKeyword: (
            node: Text,
            index: number,
            keyword: string,
            type: 'scheduled' | 'deadline',
          ) => void;
        }
      ).wrapDateKeyword;
      wrapDateKeyword.call(formatter, textNode, 0, 'SCHEDULED:', 'scheduled');

      const dateContainer = paragraph.querySelector('.todoseq-scheduled-line');
      expect(dateContainer?.getAttribute('aria-label')).toBe(
        'scheduled date line',
      );

      document.body.removeChild(paragraph);
    });

    test('should set correct role attributes', () => {
      const paragraph = document.createElement('p');
      const textNode = document.createTextNode('SCHEDULED: 2024-01-01');
      paragraph.appendChild(textNode);
      document.body.appendChild(paragraph);

      const wrapDateKeyword = (
        formatter as unknown as {
          wrapDateKeyword: (
            node: Text,
            index: number,
            keyword: string,
            type: 'scheduled' | 'deadline',
          ) => void;
        }
      ).wrapDateKeyword;
      wrapDateKeyword.call(formatter, textNode, 0, 'SCHEDULED:', 'scheduled');

      const dateContainer = paragraph.querySelector('.todoseq-scheduled-line');
      expect(dateContainer?.getAttribute('role')).toBe('note');

      const keywordSpan = paragraph.querySelector('.todoseq-scheduled-keyword');
      expect(keywordSpan?.getAttribute('role')).toBe('mark');

      document.body.removeChild(paragraph);
    });
  });

  describe('processDateLines', () => {
    test('should process paragraphs with SCHEDULED:', () => {
      const container = document.createElement('div');
      const taskParagraph = document.createElement('p');
      taskParagraph.textContent = 'TODO something';
      const dateParagraph = document.createElement('p');
      dateParagraph.textContent = 'SCHEDULED: today';

      container.appendChild(taskParagraph);
      container.appendChild(dateParagraph);
      document.body.appendChild(container);

      const processDateLines = (
        formatter as unknown as { processDateLines: (el: HTMLElement) => void }
      ).processDateLines;
      processDateLines.call(formatter, container);

      const dateContainer = dateParagraph.querySelector(
        '.todoseq-scheduled-line',
      );
      expect(dateContainer).not.toBeNull();

      document.body.removeChild(container);
    });

    test('should process paragraphs with DEADLINE:', () => {
      const container = document.createElement('div');
      const taskParagraph = document.createElement('p');
      taskParagraph.textContent = 'TODO something';
      const dateParagraph = document.createElement('p');
      dateParagraph.textContent = 'DEADLINE: today';

      container.appendChild(taskParagraph);
      container.appendChild(dateParagraph);
      document.body.appendChild(container);

      const processDateLines = (
        formatter as unknown as { processDateLines: (el: HTMLElement) => void }
      ).processDateLines;
      processDateLines.call(formatter, container);

      const dateContainer = dateParagraph.querySelector(
        '.todoseq-deadline-line',
      );
      expect(dateContainer).not.toBeNull();

      document.body.removeChild(container);
    });

    test('should skip paragraphs without date keywords', () => {
      const container = document.createElement('div');
      const paragraph = document.createElement('p');
      paragraph.textContent = 'Just regular text';
      container.appendChild(paragraph);
      document.body.appendChild(container);

      const processDateLines = (
        formatter as unknown as { processDateLines: (el: HTMLElement) => void }
      ).processDateLines;
      processDateLines.call(formatter, container);

      // Paragraph should remain unchanged
      expect(paragraph.textContent).toBe('Just regular text');

      document.body.removeChild(container);
    });

    test('should skip date lines without preceding task', () => {
      const container = document.createElement('div');
      const dateParagraph = document.createElement('p');
      dateParagraph.textContent = 'SCHEDULED: today';
      container.appendChild(dateParagraph);
      document.body.appendChild(container);

      const processDateLines = (
        formatter as unknown as { processDateLines: (el: HTMLElement) => void }
      ).processDateLines;
      processDateLines.call(formatter, container);

      // Paragraph should remain unchanged (no preceding task)
      expect(dateParagraph.querySelector('.todoseq-scheduled-line')).toBeNull();

      document.body.removeChild(container);
    });
  });
});
