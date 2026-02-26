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
import { TodoTrackerSettings } from '../src/settings/settings-types';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';
import { TaskParser } from '../src/parser/task-parser';
import { VaultScanner } from '../src/services/vault-scanner';
import { App, TFile } from 'obsidian';

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
  getKeywordManager: () => createTestKeywordManager(settings),
});

// Mock VaultScanner - uses dynamic settings from mockPlugin
let mockPluginRef: ReturnType<typeof createMockPlugin> | null = null;
const createMockVaultScanner = (parser: TaskParser | null) => ({
  getParser: jest.fn().mockReturnValue(parser),
  getTasks: jest.fn().mockReturnValue([]),
  getKeywordManager: () =>
    createTestKeywordManager(mockPluginRef?.settings ?? createBaseSettings()),
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  scanVault: jest.fn(),
  scanFile: jest.fn(),
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
    // Setup default settings using createBaseSettings to ensure all properties are included
    mockSettings = createBaseSettings({
      // Add transition settings to ensure proper state transitions
      stateTransitions: {
        defaultInactive: 'TODO',
        defaultActive: 'DOING',
        defaultCompleted: 'DONE',
        transitionStatements: ['TODO -> DOING'],
      },
    });

    // Create mock parser
    mockParser = TaskParser.create(
      createTestKeywordManager(mockSettings),
      null,
    );

    // Create mocks - plugin first so VaultScanner can reference it
    mockPlugin = createMockPlugin(mockSettings);
    mockPluginRef = mockPlugin;
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
      expect(keywords).toContain('WAIT');
      expect(keywords).toContain('WAITING');
      expect(keywords).toContain('CANCELED');
      expect(keywords).toContain('CANCELLED');
    });

    test('should include additional keywords from settings', () => {
      mockPlugin.settings.additionalInactiveKeywords = ['FIXME', 'HACK'];
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

  describe('processPriorityPillsInTextNode', () => {
    test('should replace priority token in text node with pill', () => {
      const paragraph = document.createElement('p');
      paragraph.textContent = 'Task with priority [#A]';
      document.body.appendChild(paragraph);

      const textNode = paragraph.firstChild as Text;

      const processPriorityPillsInTextNode = (
        formatter as unknown as {
          processPriorityPillsInTextNode: (node: Node) => void;
        }
      ).processPriorityPillsInTextNode;

      processPriorityPillsInTextNode.call(formatter, textNode);

      const pill = paragraph.querySelector('.priority-badge');
      expect(pill).not.toBeNull();
      expect(pill?.textContent).toBe('A');
      expect(pill?.classList.contains('priority-high')).toBe(true);

      document.body.removeChild(paragraph);
    });

    test('should handle multiple priority tokens in single text node', () => {
      const paragraph = document.createElement('p');
      paragraph.textContent = 'Task with priorities [#A], [#B], and [#C]';
      document.body.appendChild(paragraph);

      const textNode = paragraph.firstChild as Text;

      const processPriorityPillsInTextNode = (
        formatter as unknown as {
          processPriorityPillsInTextNode: (node: Node) => void;
        }
      ).processPriorityPillsInTextNode;

      processPriorityPillsInTextNode.call(formatter, textNode);

      const pills = paragraph.querySelectorAll('.priority-badge');
      expect(pills.length).toBe(3);
      expect(pills[0].textContent).toBe('C');
      expect(pills[0].classList.contains('priority-low')).toBe(true);
      expect(pills[1].textContent).toBe('B');
      expect(pills[1].classList.contains('priority-med')).toBe(true);
      expect(pills[2].textContent).toBe('A');
      expect(pills[2].classList.contains('priority-high')).toBe(true);

      document.body.removeChild(paragraph);
    });

    test('should not modify text node without priority tokens', () => {
      const paragraph = document.createElement('p');
      paragraph.textContent = 'Task without priority';
      document.body.appendChild(paragraph);

      const textNode = paragraph.firstChild as Text;

      const processPriorityPillsInTextNode = (
        formatter as unknown as {
          processPriorityPillsInTextNode: (node: Node) => void;
        }
      ).processPriorityPillsInTextNode;

      const originalContent = paragraph.innerHTML;
      processPriorityPillsInTextNode.call(formatter, textNode);

      expect(paragraph.innerHTML).toEqual(originalContent);

      document.body.removeChild(paragraph);
    });
  });

  describe('attachKeywordClickHandlers', () => {
    test('should attach click, contextmenu, and keydown handlers to keywords', () => {
      const container = document.createElement('div');
      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      document.body.appendChild(container);

      const attachKeywordClickHandlers = (
        formatter as unknown as {
          attachKeywordClickHandlers: (
            element: HTMLElement,
            context: { sourcePath: string },
          ) => void;
        }
      ).attachKeywordClickHandlers;

      attachKeywordClickHandlers.call(formatter, container, {
        sourcePath: 'test.md',
      });

      expect(keywordSpan.hasAttribute('data-todoseq-handlers-attached')).toBe(
        true,
      );
      expect(keywordSpan.getAttribute('tabindex')).toBe('0');
      expect(keywordSpan.getAttribute('role')).toBe('button');

      document.body.removeChild(container);
    });

    test('should skip elements without todoseq-keyword-formatted class', () => {
      const container = document.createElement('div');
      const span = document.createElement('span');
      span.textContent = 'NOT A KEYWORD';
      container.appendChild(span);
      document.body.appendChild(container);

      const attachKeywordClickHandlers = (
        formatter as unknown as {
          attachKeywordClickHandlers: (
            element: HTMLElement,
            context: { sourcePath: string },
          ) => void;
        }
      ).attachKeywordClickHandlers;

      attachKeywordClickHandlers.call(formatter, container, {
        sourcePath: 'test.md',
      });

      expect(span.hasAttribute('data-todoseq-handlers-attached')).toBe(false);
      expect(span.getAttribute('tabindex')).toBe(null);
      expect(span.getAttribute('role')).toBe(null);

      document.body.removeChild(container);
    });
  });

  describe('handleKeywordKeydown', () => {
    test('should handle Enter key to toggle state', async () => {
      const container = document.createElement('div');
      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      document.body.appendChild(container);

      const toggleTaskState = jest.spyOn(formatter as any, 'toggleTaskState');

      const handleKeywordKeydown = (
        formatter as unknown as {
          handleKeywordKeydown: (
            event: KeyboardEvent,
            keywordElement: HTMLElement,
            sourcePath: string,
          ) => void;
        }
      ).handleKeywordKeydown;

      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      handleKeywordKeydown.call(formatter, enterEvent, keywordSpan, 'test.md');

      expect(toggleTaskState).toHaveBeenCalledWith(keywordSpan, 'test.md');

      document.body.removeChild(container);
    });

    test('should handle Space key to toggle state', async () => {
      const container = document.createElement('div');
      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      document.body.appendChild(container);

      const toggleTaskState = jest.spyOn(formatter as any, 'toggleTaskState');

      const handleKeywordKeydown = (
        formatter as unknown as {
          handleKeywordKeydown: (
            event: KeyboardEvent,
            keywordElement: HTMLElement,
            sourcePath: string,
          ) => void;
        }
      ).handleKeywordKeydown;

      const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
      handleKeywordKeydown.call(formatter, spaceEvent, keywordSpan, 'test.md');

      expect(toggleTaskState).toHaveBeenCalledWith(keywordSpan, 'test.md');

      document.body.removeChild(container);
    });
  });

  describe('attachCheckboxClickHandlers', () => {
    test('should attach click handlers to checkboxes', () => {
      const container = document.createElement('div');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      container.appendChild(checkbox);
      document.body.appendChild(container);

      const attachCheckboxClickHandlers = (
        formatter as unknown as {
          attachCheckboxClickHandlers: (
            element: HTMLElement,
            context: { sourcePath: string },
          ) => void;
        }
      ).attachCheckboxClickHandlers;

      const registerDomEvent = jest.spyOn(mockPlugin, 'registerDomEvent');
      attachCheckboxClickHandlers.call(formatter, container, {
        sourcePath: 'test.md',
      });

      expect(registerDomEvent).toHaveBeenCalled();
      expect(registerDomEvent.mock.calls[0][0]).toEqual(checkbox);
      expect(registerDomEvent.mock.calls[0][1]).toEqual('click');

      document.body.removeChild(container);
    });
  });

  describe('handleCheckboxClick', () => {
    test('should toggle task state based on checkbox state', async () => {
      const container = document.createElement('div');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      const taskListItem = document.createElement('div');
      taskListItem.className = 'task-list-item';
      taskListItem.textContent = 'Test task';
      taskListItem.appendChild(checkbox);
      container.appendChild(taskListItem);
      document.body.appendChild(container);

      const mockFile = new TFile('test.md');
      const mockTask = { id: '1', text: 'Test task' };

      jest
        .spyOn(mockPlugin.app.vault, 'getAbstractFileByPath')
        .mockReturnValue(mockFile);
      jest
        .spyOn(mockPlugin.app.vault, 'read')
        .mockResolvedValue('- [ ] Test task');
      jest
        .spyOn(formatter as any, 'findTaskForCheckbox')
        .mockResolvedValue(mockTask);

      const taskUpdateCoordinator = { updateTaskState: jest.fn() };
      (formatter as any).plugin.taskUpdateCoordinator = taskUpdateCoordinator;

      const handleCheckboxClick = (
        formatter as unknown as {
          handleCheckboxClick: (
            event: Event,
            sourcePath: string,
          ) => Promise<void>;
        }
      ).handleCheckboxClick;

      const clickEvent = { target: checkbox } as unknown as Event;
      checkbox.checked = true;
      await handleCheckboxClick.call(formatter, clickEvent, 'test.md');

      expect(taskUpdateCoordinator.updateTaskState).toHaveBeenCalledWith(
        mockTask,
        'DONE',
        'reader',
      );

      document.body.removeChild(container);
    });

    test('should return early if no task list item found', async () => {
      const container = document.createElement('div');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      container.appendChild(checkbox);
      document.body.appendChild(container);

      const handleCheckboxClick = (
        formatter as unknown as {
          handleCheckboxClick: (
            event: Event,
            sourcePath: string,
          ) => Promise<void>;
        }
      ).handleCheckboxClick;

      const clickEvent = { target: checkbox } as unknown as Event;
      await handleCheckboxClick.call(formatter, clickEvent, 'test.md');

      // Should return early without error
      expect(true).toBe(true);

      document.body.removeChild(container);
    });
  });

  describe('handleKeywordContextMenu', () => {
    test('should show context menu on right-click', async () => {
      const container = document.createElement('div');
      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      document.body.appendChild(container);

      const mockMenu = { showAtPosition: jest.fn() };
      const buildStateMenu = jest
        .spyOn((formatter as any).menuBuilder, 'buildStateMenu')
        .mockReturnValue(mockMenu);

      const handleKeywordContextMenu = (
        formatter as unknown as {
          handleKeywordContextMenu: (
            event: MouseEvent,
            keywordElement: HTMLElement,
            sourcePath: string,
          ) => void;
        }
      ).handleKeywordContextMenu;

      const contextMenuEvent = new MouseEvent('contextmenu', {
        clientX: 100,
        clientY: 200,
      });
      handleKeywordContextMenu.call(
        formatter,
        contextMenuEvent,
        keywordSpan,
        'test.md',
      );

      expect(buildStateMenu).toHaveBeenCalledWith('TODO', expect.any(Function));
      expect(mockMenu.showAtPosition).toHaveBeenCalledWith({ x: 100, y: 200 });

      document.body.removeChild(container);
    });
  });

  describe('toggleTaskState', () => {
    test('should toggle task state using NEXT_STATE map', async () => {
      const container = document.createElement('div');
      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      document.body.appendChild(container);

      const updateTaskState = jest.spyOn(formatter as any, 'updateTaskState');

      const toggleTaskState = (
        formatter as unknown as {
          toggleTaskState: (
            keywordElement: HTMLElement,
            sourcePath: string,
          ) => Promise<void>;
        }
      ).toggleTaskState;

      await toggleTaskState.call(formatter, keywordSpan, 'test.md');

      expect(updateTaskState).toHaveBeenCalledWith(
        keywordSpan,
        'test.md',
        'DOING',
      );

      document.body.removeChild(container);
    });

    test('should return early if no data-task-keyword attribute', async () => {
      const container = document.createElement('div');
      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      document.body.appendChild(container);

      const updateTaskState = jest.spyOn(formatter as any, 'updateTaskState');

      const toggleTaskState = (
        formatter as unknown as {
          toggleTaskState: (
            keywordElement: HTMLElement,
            sourcePath: string,
          ) => Promise<void>;
        }
      ).toggleTaskState;

      await toggleTaskState.call(formatter, keywordSpan, 'test.md');

      expect(updateTaskState).not.toHaveBeenCalled();

      document.body.removeChild(container);
    });
  });

  describe('updateTaskState', () => {
    test('should call taskUpdateCoordinator.updateTaskState', async () => {
      const container = document.createElement('div');
      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      document.body.appendChild(container);

      const mockTask = { id: '1', text: 'Test task' };
      const findTaskForKeyword = jest
        .spyOn(formatter as any, 'findTaskForKeyword')
        .mockResolvedValue(mockTask);
      const updateTaskState = jest.fn();
      (formatter as any).plugin.taskUpdateCoordinator = { updateTaskState };

      const updateTaskStateMethod = (
        formatter as unknown as {
          updateTaskState: (
            keywordElement: HTMLElement,
            sourcePath: string,
            newState: string,
          ) => Promise<void>;
        }
      ).updateTaskState;

      await updateTaskStateMethod.call(
        formatter,
        keywordSpan,
        'test.md',
        'DONE',
      );

      expect(findTaskForKeyword).toHaveBeenCalledWith(keywordSpan, 'test.md');
      expect(updateTaskState).toHaveBeenCalledWith(mockTask, 'DONE', 'reader');

      document.body.removeChild(container);
    });

    test('should return early if task not found', async () => {
      const container = document.createElement('div');
      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      document.body.appendChild(container);

      const findTaskForKeyword = jest
        .spyOn(formatter as any, 'findTaskForKeyword')
        .mockResolvedValue(null);
      const updateTaskState = jest.fn();
      (formatter as any).plugin.taskUpdateCoordinator = { updateTaskState };

      const updateTaskStateMethod = (
        formatter as unknown as {
          updateTaskState: (
            keywordElement: HTMLElement,
            sourcePath: string,
            newState: string,
          ) => Promise<void>;
        }
      ).updateTaskState;

      await updateTaskStateMethod.call(
        formatter,
        keywordSpan,
        'test.md',
        'DONE',
      );

      expect(findTaskForKeyword).toHaveBeenCalledWith(keywordSpan, 'test.md');
      expect(updateTaskState).not.toHaveBeenCalled();

      document.body.removeChild(container);
    });
  });

  describe('handleKeywordClick', () => {
    test('should handle single click and toggle state', (done) => {
      const container = document.createElement('div');
      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      document.body.appendChild(container);

      const toggleTaskState = jest.spyOn(formatter as any, 'toggleTaskState');

      const handleKeywordClick = (
        formatter as unknown as {
          handleKeywordClick: (
            event: MouseEvent,
            keywordElement: HTMLElement,
            sourcePath: string,
          ) => void;
        }
      ).handleKeywordClick;

      const clickEvent = new MouseEvent('click');
      handleKeywordClick.call(formatter, clickEvent, keywordSpan, 'test.md');

      setTimeout(() => {
        expect(toggleTaskState).toHaveBeenCalledWith(keywordSpan, 'test.md');
        document.body.removeChild(container);
        done();
      }, 350); // Wait a little longer than DOUBLE_CLICK_THRESHOLD (300ms)
    });

    test('should handle double click and not toggle state', (done) => {
      const container = document.createElement('div');
      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      document.body.appendChild(container);

      const toggleTaskState = jest.spyOn(formatter as any, 'toggleTaskState');

      const handleKeywordClick = (
        formatter as unknown as {
          handleKeywordClick: (
            event: MouseEvent,
            keywordElement: HTMLElement,
            sourcePath: string,
          ) => void;
        }
      ).handleKeywordClick;

      // First click
      const clickEvent1 = new MouseEvent('click');
      handleKeywordClick.call(formatter, clickEvent1, keywordSpan, 'test.md');

      // Second click shortly after (double click)
      const clickEvent2 = new MouseEvent('click');
      handleKeywordClick.call(formatter, clickEvent2, keywordSpan, 'test.md');

      setTimeout(() => {
        expect(toggleTaskState).not.toHaveBeenCalled();
        document.body.removeChild(container);
        done();
      }, 350);
    });
  });

  describe('replaceKeywordInTextNodesAndBuildTask', () => {
    test('should replace keyword in single text node', () => {
      const paragraph = document.createElement('p');
      paragraph.textContent = 'TODO task text';
      document.body.appendChild(paragraph);

      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';

      const taskContainer = document.createElement('span');
      taskContainer.className = 'todoseq-task';

      const replaceKeywordInTextNodesAndBuildTask = (
        formatter as unknown as {
          replaceKeywordInTextNodesAndBuildTask: (
            lineNodes: Node[],
            keyword: string,
            keywordSpan: HTMLElement,
            taskContainer: HTMLElement,
          ) => void;
        }
      ).replaceKeywordInTextNodesAndBuildTask;

      replaceKeywordInTextNodesAndBuildTask.call(
        formatter,
        Array.from(paragraph.childNodes),
        'TODO',
        keywordSpan,
        taskContainer,
      );

      expect(
        taskContainer.querySelector('.todoseq-keyword-formatted'),
      ).not.toBeNull();
      expect(taskContainer.textContent).toContain('task text');

      document.body.removeChild(paragraph);
    });

    test('should clone non-text nodes', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = 'TODO <b>important</b> task';
      document.body.appendChild(paragraph);

      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';

      const taskContainer = document.createElement('span');
      taskContainer.className = 'todoseq-task';

      const replaceKeywordInTextNodesAndBuildTask = (
        formatter as unknown as {
          replaceKeywordInTextNodesAndBuildTask: (
            lineNodes: Node[],
            keyword: string,
            keywordSpan: HTMLElement,
            taskContainer: HTMLElement,
          ) => void;
        }
      ).replaceKeywordInTextNodesAndBuildTask;

      replaceKeywordInTextNodesAndBuildTask.call(
        formatter,
        Array.from(paragraph.childNodes),
        'TODO',
        keywordSpan,
        taskContainer,
      );

      expect(
        taskContainer.querySelector('.todoseq-keyword-formatted'),
      ).not.toBeNull();
      expect(taskContainer.querySelector('b')).not.toBeNull();
      expect(taskContainer.textContent).toContain('important');

      document.body.removeChild(paragraph);
    });

    test('should clone all nodes if keyword not found', () => {
      const paragraph = document.createElement('p');
      paragraph.textContent = 'Regular text without keyword';
      document.body.appendChild(paragraph);

      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';

      const taskContainer = document.createElement('span');
      taskContainer.className = 'todoseq-task';

      const replaceKeywordInTextNodesAndBuildTask = (
        formatter as unknown as {
          replaceKeywordInTextNodesAndBuildTask: (
            lineNodes: Node[],
            keyword: string,
            keywordSpan: HTMLElement,
            taskContainer: HTMLElement,
          ) => void;
        }
      ).replaceKeywordInTextNodesAndBuildTask;

      replaceKeywordInTextNodesAndBuildTask.call(
        formatter,
        Array.from(paragraph.childNodes),
        'TODO',
        keywordSpan,
        taskContainer,
      );

      expect(
        taskContainer.querySelector('.todoseq-keyword-formatted'),
      ).toBeNull();
      expect(taskContainer.textContent).toContain(
        'Regular text without keyword',
      );

      document.body.removeChild(paragraph);
    });
  });

  describe('applyCompletedTaskStylingToTaskContainer', () => {
    test('should wrap completed task content in container', () => {
      const taskContainer = document.createElement('span');
      taskContainer.className = 'todoseq-task';

      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'DONE');
      keywordSpan.textContent = 'DONE';

      const taskText = document.createTextNode(' task text');

      taskContainer.appendChild(keywordSpan);
      taskContainer.appendChild(taskText);
      document.body.appendChild(taskContainer);

      const applyCompletedTaskStylingToTaskContainer = (
        formatter as unknown as {
          applyCompletedTaskStylingToTaskContainer: (
            container: HTMLElement,
            keyword: string,
          ) => void;
        }
      ).applyCompletedTaskStylingToTaskContainer;

      applyCompletedTaskStylingToTaskContainer.call(
        formatter,
        taskContainer,
        'DONE',
      );

      const completedContainer = taskContainer.querySelector(
        '.todoseq-completed-task-text',
      );
      expect(completedContainer).not.toBeNull();
      expect(completedContainer?.getAttribute('data-completed-task')).toBe(
        'true',
      );

      const wrappedKeyword = completedContainer?.querySelector(
        '.todoseq-keyword-formatted',
      );
      expect(wrappedKeyword).not.toBeNull();
      expect(wrappedKeyword?.textContent).toBe('DONE');

      document.body.removeChild(taskContainer);
    });

    test('should not modify container without keyword span', () => {
      const taskContainer = document.createElement('span');
      taskContainer.className = 'todoseq-task';

      const taskText = document.createTextNode('Task without keyword span');
      taskContainer.appendChild(taskText);
      document.body.appendChild(taskContainer);

      const applyCompletedTaskStylingToTaskContainer = (
        formatter as unknown as {
          applyCompletedTaskStylingToTaskContainer: (
            container: HTMLElement,
            keyword: string,
          ) => void;
        }
      ).applyCompletedTaskStylingToTaskContainer;

      const originalContent = taskContainer.innerHTML;
      applyCompletedTaskStylingToTaskContainer.call(
        formatter,
        taskContainer,
        'DONE',
      );

      expect(taskContainer.innerHTML).toEqual(originalContent);

      document.body.removeChild(taskContainer);
    });

    test('should wrap any task container with keyword span', () => {
      const taskContainer = document.createElement('span');
      taskContainer.className = 'todoseq-task';

      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';

      const taskText = document.createTextNode(' task text');

      taskContainer.appendChild(keywordSpan);
      taskContainer.appendChild(taskText);
      document.body.appendChild(taskContainer);

      const applyCompletedTaskStylingToTaskContainer = (
        formatter as unknown as {
          applyCompletedTaskStylingToTaskContainer: (
            container: HTMLElement,
            keyword: string,
          ) => void;
        }
      ).applyCompletedTaskStylingToTaskContainer;

      applyCompletedTaskStylingToTaskContainer.call(
        formatter,
        taskContainer,
        'TODO',
      );

      const completedContainer = taskContainer.querySelector(
        '.todoseq-completed-task-text',
      );
      expect(completedContainer).not.toBeNull();
      expect(completedContainer?.getAttribute('data-completed-task')).toBe(
        'true',
      );

      const wrappedKeyword = completedContainer?.querySelector(
        '.todoseq-keyword-formatted',
      );
      expect(wrappedKeyword).not.toBeNull();
      expect(wrappedKeyword?.textContent).toBe('TODO');

      document.body.removeChild(taskContainer);
    });
  });

  describe('processPriorityTagLinks', () => {
    test('should replace priority tag links with pills', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML =
        'Task with priority [<a href="#A" class="tag">#A</a>]';
      document.body.appendChild(paragraph);

      const processPriorityTagLinks = (
        formatter as unknown as {
          processPriorityTagLinks: (element: HTMLElement) => void;
        }
      ).processPriorityTagLinks;

      processPriorityTagLinks.call(formatter, paragraph);

      const pill = paragraph.querySelector('.priority-badge');
      expect(pill).not.toBeNull();
      expect(pill?.textContent).toBe('A');
      expect(pill?.classList.contains('priority-high')).toBe(true);

      const tagLink = paragraph.querySelector('a.tag');
      expect(tagLink).toBeNull();

      document.body.removeChild(paragraph);
    });

    test('should skip non-priority tag links', () => {
      const paragraph = document.createElement('p');
      paragraph.innerHTML =
        'Task with tag [<a href="#important" class="tag">#important</a>]';
      document.body.appendChild(paragraph);

      const processPriorityTagLinks = (
        formatter as unknown as {
          processPriorityTagLinks: (element: HTMLElement) => void;
        }
      ).processPriorityTagLinks;

      const originalContent = paragraph.innerHTML;
      processPriorityTagLinks.call(formatter, paragraph);

      expect(paragraph.innerHTML).toEqual(originalContent);

      document.body.removeChild(paragraph);
    });
  });

  describe('processTaskKeywords', () => {
    test('should call processTaskListItems, processRegularParagraphs, and processBulletListItems', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      const processTaskListItems = jest.spyOn(
        formatter as any,
        'processTaskListItems',
      );
      const processRegularParagraphs = jest.spyOn(
        formatter as any,
        'processRegularParagraphs',
      );
      const processBulletListItems = jest.spyOn(
        formatter as any,
        'processBulletListItems',
      );

      const processTaskKeywords = (
        formatter as unknown as {
          processTaskKeywords: (element: HTMLElement) => void;
        }
      ).processTaskKeywords;

      processTaskKeywords.call(formatter, container);

      expect(processTaskListItems).toHaveBeenCalled();
      expect(processRegularParagraphs).toHaveBeenCalled();
      expect(processBulletListItems).toHaveBeenCalled();

      document.body.removeChild(container);
    });

    test('should warn and return early if task parser is not initialized', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);

      const getTaskParser = jest
        .spyOn(formatter as any, 'getTaskParser')
        .mockReturnValue(null);
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();

      const processTaskKeywords = (
        formatter as unknown as {
          processTaskKeywords: (element: HTMLElement) => void;
        }
      ).processTaskKeywords;

      processTaskKeywords.call(formatter, container);

      expect(consoleWarn).toHaveBeenCalledWith(
        'Task parser not initialized, skipping task keyword processing',
      );

      getTaskParser.mockRestore();
      consoleWarn.mockRestore();
      document.body.removeChild(container);
    });
  });

  describe('processPriorityPills', () => {
    test('should process priority pills in task list items', () => {
      const container = document.createElement('div');
      const taskItem = document.createElement('div');
      taskItem.className = 'task-list-item';
      taskItem.textContent = 'TODO task with priority [#A]';
      container.appendChild(taskItem);
      document.body.appendChild(container);

      const processPriorityPills = (
        formatter as unknown as {
          processPriorityPills: (element: HTMLElement) => void;
        }
      ).processPriorityPills;

      processPriorityPills.call(formatter, container);

      const pill = taskItem.querySelector('.priority-badge');
      expect(pill).not.toBeNull();
      expect(pill?.textContent).toBe('A');
      expect(pill?.classList.contains('priority-high')).toBe(true);

      document.body.removeChild(container);
    });

    test('should process priority pills in regular list items', () => {
      const container = document.createElement('div');
      const listItem = document.createElement('li');
      listItem.textContent = 'TODO task with priority [#B]';
      container.appendChild(listItem);
      document.body.appendChild(container);

      const processPriorityPills = (
        formatter as unknown as {
          processPriorityPills: (element: HTMLElement) => void;
        }
      ).processPriorityPills;

      processPriorityPills.call(formatter, container);

      const pill = listItem.querySelector('.priority-badge');
      expect(pill).not.toBeNull();
      expect(pill?.textContent).toBe('B');
      expect(pill?.classList.contains('priority-med')).toBe(true);

      document.body.removeChild(container);
    });

    test('should skip processing when formatTaskKeywords is false', () => {
      mockPlugin.settings.formatTaskKeywords = false;

      const container = document.createElement('div');
      const taskItem = document.createElement('div');
      taskItem.className = 'task-list-item';
      taskItem.textContent = 'TODO task with priority [#A]';
      container.appendChild(taskItem);
      document.body.appendChild(container);

      const processPriorityPills = (
        formatter as unknown as {
          processPriorityPills: (element: HTMLElement) => void;
        }
      ).processPriorityPills;

      processPriorityPills.call(formatter, container);

      const pill = taskItem.querySelector('.priority-badge');
      expect(pill).toBeNull();

      document.body.removeChild(container);
      mockPlugin.settings.formatTaskKeywords = true; // Reset to default
    });
  });

  describe('createPriorityPill', () => {
    test('should create priority A pill with correct classes', () => {
      const createPriorityPill = (
        formatter as unknown as {
          createPriorityPill: (letter: string) => HTMLSpanElement;
        }
      ).createPriorityPill;
      const pill = createPriorityPill.call(formatter, 'A');

      expect(pill.classList.contains('priority-badge')).toBe(true);
      expect(pill.classList.contains('priority-high')).toBe(true);
      expect(pill.getAttribute('data-priority')).toBe('A');
      expect(pill.getAttribute('aria-label')).toBe('Priority A');
      expect(pill.getAttribute('role')).toBe('badge');
      expect(pill.textContent).toBe('A');
    });

    test('should create priority B pill with correct classes', () => {
      const createPriorityPill = (
        formatter as unknown as {
          createPriorityPill: (letter: string) => HTMLSpanElement;
        }
      ).createPriorityPill;
      const pill = createPriorityPill.call(formatter, 'B');

      expect(pill.classList.contains('priority-badge')).toBe(true);
      expect(pill.classList.contains('priority-med')).toBe(true);
      expect(pill.getAttribute('data-priority')).toBe('B');
      expect(pill.getAttribute('aria-label')).toBe('Priority B');
      expect(pill.getAttribute('role')).toBe('badge');
      expect(pill.textContent).toBe('B');
    });

    test('should create priority C pill with correct classes', () => {
      const createPriorityPill = (
        formatter as unknown as {
          createPriorityPill: (letter: string) => HTMLSpanElement;
        }
      ).createPriorityPill;
      const pill = createPriorityPill.call(formatter, 'C');

      expect(pill.classList.contains('priority-badge')).toBe(true);
      expect(pill.classList.contains('priority-low')).toBe(true);
      expect(pill.getAttribute('data-priority')).toBe('C');
      expect(pill.getAttribute('aria-label')).toBe('Priority C');
      expect(pill.getAttribute('role')).toBe('badge');
      expect(pill.textContent).toBe('C');
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

  describe('findTaskForKeyword', () => {
    test('should return null if file not found', async () => {
      const container = document.createElement('div');
      const paragraph = document.createElement('p');
      paragraph.textContent = 'TODO Test task';
      container.appendChild(paragraph);
      document.body.appendChild(container);

      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      paragraph.prepend(keywordSpan);

      jest
        .spyOn(mockPlugin.app.vault, 'getAbstractFileByPath')
        .mockReturnValue(null);

      const findTaskForKeyword = (
        formatter as unknown as {
          findTaskForKeyword: (
            keywordElement: HTMLElement,
            sourcePath: string,
          ) => Promise<any>;
        }
      ).findTaskForKeyword;

      const task = await findTaskForKeyword.call(
        formatter,
        keywordSpan,
        'test.md',
      );

      expect(task).toBeNull();

      document.body.removeChild(container);
    });

    test('should return null if task parser not available', async () => {
      const container = document.createElement('div');
      const paragraph = document.createElement('p');
      paragraph.textContent = 'TODO Test task';
      container.appendChild(paragraph);
      document.body.appendChild(container);

      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      paragraph.prepend(keywordSpan);

      const mockFile = new TFile('test.md');

      jest
        .spyOn(mockPlugin.app.vault, 'getAbstractFileByPath')
        .mockReturnValue(mockFile);
      jest
        .spyOn(mockPlugin.app.vault, 'read')
        .mockResolvedValue('TODO Test task');
      jest.spyOn(formatter as any, 'getTaskParser').mockReturnValue(null);

      const findTaskForKeyword = (
        formatter as unknown as {
          findTaskForKeyword: (
            keywordElement: HTMLElement,
            sourcePath: string,
          ) => Promise<any>;
        }
      ).findTaskForKeyword;

      const task = await findTaskForKeyword.call(
        formatter,
        keywordSpan,
        'test.md',
      );

      expect(task).toBeNull();

      document.body.removeChild(container);
    });

    test('should return null if task container not found', async () => {
      // Create a keyword span not contained in any valid task container
      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      document.body.appendChild(keywordSpan);

      const mockFile = new TFile('test.md');

      jest
        .spyOn(mockPlugin.app.vault, 'getAbstractFileByPath')
        .mockReturnValue(mockFile);
      jest
        .spyOn(mockPlugin.app.vault, 'read')
        .mockResolvedValue('TODO Test task');
      jest.spyOn(formatter as any, 'getTaskParser').mockReturnValue({
        testRegex: /^TODO (.*)$/,
        parseFile: jest
          .fn()
          .mockReturnValue([{ id: '1', text: 'TODO Test task', line: 0 }]),
      });

      const findTaskForKeyword = (
        formatter as unknown as {
          findTaskForKeyword: (
            keywordElement: HTMLElement,
            sourcePath: string,
          ) => Promise<any>;
        }
      ).findTaskForKeyword;

      const task = await findTaskForKeyword.call(
        formatter,
        keywordSpan,
        'test.md',
      );

      expect(task).toBeNull();

      document.body.removeChild(keywordSpan);
    });

    test('should return null if no task found', async () => {
      const container = document.createElement('div');
      const paragraph = document.createElement('p');
      paragraph.textContent = 'NOT A TASK';
      container.appendChild(paragraph);
      document.body.appendChild(container);

      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      paragraph.appendChild(keywordSpan);

      const mockFile = new TFile('test.md');

      jest
        .spyOn(mockPlugin.app.vault, 'getAbstractFileByPath')
        .mockReturnValue(mockFile);
      jest
        .spyOn(mockPlugin.app.vault, 'read')
        .mockResolvedValue('This is not a task line');
      jest.spyOn(formatter as any, 'getTaskParser').mockReturnValue({
        testRegex: /^- \[[ x]\] (.*)$/,
        parseFile: jest.fn().mockReturnValue([]),
      });

      const findTaskForKeyword = (
        formatter as unknown as {
          findTaskForKeyword: (
            keywordElement: HTMLElement,
            sourcePath: string,
          ) => Promise<any>;
        }
      ).findTaskForKeyword;

      const task = await findTaskForKeyword.call(
        formatter,
        keywordSpan,
        'test.md',
      );

      expect(task).toBeNull();

      document.body.removeChild(container);
    });
  });

  describe('findTaskForCheckbox', () => {
    test('should find a task for a checkbox in task list item', async () => {
      const container = document.createElement('div');
      const taskListItem = document.createElement('div');
      taskListItem.className = 'task-list-item';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      const taskText = document.createTextNode('Test task');
      taskListItem.appendChild(checkbox);
      taskListItem.appendChild(taskText);
      container.appendChild(taskListItem);
      document.body.appendChild(container);

      const mockFile = new TFile('test.md');
      const mockTask = { id: '1', text: 'Test task', line: 0 };

      jest
        .spyOn(mockPlugin.app.vault, 'getAbstractFileByPath')
        .mockReturnValue(mockFile);
      jest
        .spyOn(mockPlugin.app.vault, 'read')
        .mockResolvedValue('- [ ] Test task');
      jest.spyOn(formatter as any, 'getTaskParser').mockReturnValue({
        testRegex: /^- \[[ x]\] (.*)$/,
        parseFile: jest.fn().mockReturnValue([mockTask]),
      });

      const findTaskForCheckbox = (
        formatter as unknown as {
          findTaskForCheckbox: (
            taskListItem: Element,
            file: any,
          ) => Promise<any>;
        }
      ).findTaskForCheckbox;

      const task = await findTaskForCheckbox.call(
        formatter,
        taskListItem,
        mockFile,
      );

      expect(task).toEqual(mockTask);

      document.body.removeChild(container);
    });

    test('should return null if no task list item found', async () => {
      const container = document.createElement('div');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      container.appendChild(checkbox);
      document.body.appendChild(container);

      const mockFile = new TFile('test.md');

      jest.spyOn(mockPlugin.app.vault, 'read').mockResolvedValue('');
      jest.spyOn(formatter as any, 'getTaskParser').mockReturnValue({
        testRegex: /^- \[[ x]\] (.*)$/,
        parseFile: jest.fn().mockReturnValue([]),
      });

      const findTaskForCheckbox = (
        formatter as unknown as {
          findTaskForCheckbox: (
            taskListItem: Element,
            file: any,
          ) => Promise<any>;
        }
      ).findTaskForCheckbox;

      const task = await findTaskForCheckbox.call(
        formatter,
        document.createElement('div'),
        mockFile,
      );

      expect(task).toBeNull();

      document.body.removeChild(container);
    });
  });
});
