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
import { installObsidianDomMocks } from './helpers/obsidian-dom-mock';

installObsidianDomMocks();

// Mock Obsidian's createSpan helper on HTMLElement prototype
if (!HTMLElement.prototype.createSpan) {
  HTMLElement.prototype.createSpan = function (config?: {
    cls?: string;
    text?: string;
    attr?: Record<string, string>;
  }): HTMLSpanElement {
    const span = activeDocument.createElement('span');
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

// Polyfill Obsidian's createDiv on DocumentFragment for jsdom
if (typeof window !== 'undefined') {
  (window as any).DocumentFragment.prototype.createDiv = function (
    cls?: string | { cls?: string },
  ): HTMLDivElement {
    const el = activeDocument.createElement('div');
    if (typeof cls === 'string') {
      el.className = cls;
    } else if (cls?.cls) {
      el.className = cls.cls;
    }
    return el;
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
  taskEditor: { updateTaskState: jest.fn() },
  taskStateManager: {
    optimisticUpdate: jest.fn(),
    findTaskByPathAndLine: jest.fn().mockReturnValue(null),
    updateParentSubtaskCountsForCheckbox: jest.fn(),
  },
  taskUpdateCoordinator: {
    updateTaskByPath: jest.fn(),
  },
  refreshVisibleEditorDecorations: jest.fn(),
  refreshReaderViewFormatter: jest.fn(),
  recreateParser: jest.fn(),
  scanVault: jest.fn(),
  saveSettings: jest.fn(),
  updateTaskFormatting: jest.fn(),
  keywordManager: createTestKeywordManager(settings),
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
    activeDocument.body.textContent = '';
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
      const div = activeDocument.createElement('div');
      activeDocument.body.appendChild(div);

      const isInQuoteOrCalloutBlock = (
        formatter as unknown as {
          isInQuoteOrCalloutBlock: (el: HTMLElement) => boolean;
        }
      ).isInQuoteOrCalloutBlock;
      const result = isInQuoteOrCalloutBlock.call(formatter, div);

      expect(result).toBe(false);
      activeDocument.body.removeChild(div);
    });

    test('should return true for element inside blockquote', () => {
      const blockquote = activeDocument.createElement('blockquote');
      const div = activeDocument.createElement('div');
      blockquote.appendChild(div);
      activeDocument.body.appendChild(blockquote);

      const isInQuoteOrCalloutBlock = (
        formatter as unknown as {
          isInQuoteOrCalloutBlock: (el: HTMLElement) => boolean;
        }
      ).isInQuoteOrCalloutBlock;
      const result = isInQuoteOrCalloutBlock.call(formatter, div);

      expect(result).toBe(true);
      activeDocument.body.removeChild(blockquote);
    });

    test('should return true for element inside callout', () => {
      const callout = activeDocument.createElement('div');
      callout.classList.add('callout');
      const div = activeDocument.createElement('div');
      callout.appendChild(div);
      activeDocument.body.appendChild(callout);

      const isInQuoteOrCalloutBlock = (
        formatter as unknown as {
          isInQuoteOrCalloutBlock: (el: HTMLElement) => boolean;
        }
      ).isInQuoteOrCalloutBlock;
      const result = isInQuoteOrCalloutBlock.call(formatter, div);

      expect(result).toBe(true);
      activeDocument.body.removeChild(callout);
    });

    test('should return true for element inside admonition', () => {
      const admonition = activeDocument.createElement('div');
      admonition.classList.add('admonition');
      const div = activeDocument.createElement('div');
      admonition.appendChild(div);
      activeDocument.body.appendChild(admonition);

      const isInQuoteOrCalloutBlock = (
        formatter as unknown as {
          isInQuoteOrCalloutBlock: (el: HTMLElement) => boolean;
        }
      ).isInQuoteOrCalloutBlock;
      const result = isInQuoteOrCalloutBlock.call(formatter, div);

      expect(result).toBe(true);
      activeDocument.body.removeChild(admonition);
    });

    test('should return false for element at document root', () => {
      const div = activeDocument.createElement('div');
      activeDocument.body.appendChild(div);

      const isInQuoteOrCalloutBlock = (
        formatter as unknown as {
          isInQuoteOrCalloutBlock: (el: HTMLElement) => boolean;
        }
      ).isInQuoteOrCalloutBlock;
      const result = isInQuoteOrCalloutBlock.call(formatter, div);

      expect(result).toBe(false);
      activeDocument.body.removeChild(div);
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
      const div = activeDocument.createElement('div');

      const getTextNodes = (
        formatter as unknown as { getTextNodes: (el: HTMLElement) => Node[] }
      ).getTextNodes;
      const result = getTextNodes.call(formatter, div);

      expect(result).toEqual([]);
    });

    test('should return text nodes from element', () => {
      const div = activeDocument.createElement('div');
      div.textContent = 'Hello world';

      const getTextNodes = (
        formatter as unknown as { getTextNodes: (el: HTMLElement) => Node[] }
      ).getTextNodes;
      const result = getTextNodes.call(formatter, div);

      expect(result.length).toBe(1);
      expect(result[0].textContent).toBe('Hello world');
    });

    test('should return multiple text nodes from nested elements', () => {
      const div = activeDocument.createElement('div');
      div.appendChild(activeDocument.createElement('span')).textContent =
        'Hello';
      div.appendChild(activeDocument.createTextNode(' '));
      div.appendChild(activeDocument.createElement('span')).textContent =
        'World';

      const getTextNodes = (
        formatter as unknown as { getTextNodes: (el: HTMLElement) => Node[] }
      ).getTextNodes;
      const result = getTextNodes.call(formatter, div);

      expect(result.length).toBe(3);
    });

    test('should return text nodes in document order', () => {
      const div = activeDocument.createElement('div');
      div.appendChild(activeDocument.createElement('p')).textContent = 'First';
      div.appendChild(activeDocument.createElement('p')).textContent = 'Second';

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
      const container = activeDocument.createElement('div');
      const taskParagraph = activeDocument.createElement('p');
      taskParagraph.textContent = 'TODO something';
      const dateParagraph = activeDocument.createElement('p');
      dateParagraph.textContent = 'SCHEDULED: today';

      container.appendChild(taskParagraph);
      container.appendChild(dateParagraph);
      activeDocument.body.appendChild(container);

      const hasPrecedingTask = (
        formatter as unknown as {
          hasPrecedingTask: (p: HTMLParagraphElement) => boolean;
        }
      ).hasPrecedingTask;
      const result = hasPrecedingTask.call(formatter, dateParagraph);

      expect(result).toBe(true);
      activeDocument.body.removeChild(container);
    });

    test('should return false when no preceding task', () => {
      const container = activeDocument.createElement('div');
      const dateParagraph = activeDocument.createElement('p');
      dateParagraph.textContent = 'SCHEDULED: today';

      container.appendChild(dateParagraph);
      activeDocument.body.appendChild(container);

      const hasPrecedingTask = (
        formatter as unknown as {
          hasPrecedingTask: (p: HTMLParagraphElement) => boolean;
        }
      ).hasPrecedingTask;
      const result = hasPrecedingTask.call(formatter, dateParagraph);

      expect(result).toBe(false);
      activeDocument.body.removeChild(container);
    });
  });

  describe('hasTaskInPreviousSiblings', () => {
    test('should find task in previous sibling', () => {
      const container = activeDocument.createElement('div');
      const taskParagraph = activeDocument.createElement('p');
      taskParagraph.textContent = 'TODO something';
      const otherParagraph = activeDocument.createElement('p');
      otherParagraph.textContent = 'SCHEDULED: today';

      container.appendChild(taskParagraph);
      container.appendChild(otherParagraph);
      activeDocument.body.appendChild(container);

      const hasTaskInPreviousSiblings = (
        formatter as unknown as {
          hasTaskInPreviousSiblings: (p: HTMLParagraphElement) => boolean;
        }
      ).hasTaskInPreviousSiblings;
      const result = hasTaskInPreviousSiblings.call(formatter, otherParagraph);

      expect(result).toBe(true);
      activeDocument.body.removeChild(container);
    });

    test('should return false when no previous siblings', () => {
      const paragraph = activeDocument.createElement('p');
      paragraph.textContent = 'SCHEDULED: today';
      activeDocument.body.appendChild(paragraph);

      const hasTaskInPreviousSiblings = (
        formatter as unknown as {
          hasTaskInPreviousSiblings: (p: HTMLParagraphElement) => boolean;
        }
      ).hasTaskInPreviousSiblings;
      const result = hasTaskInPreviousSiblings.call(formatter, paragraph);

      expect(result).toBe(false);
      activeDocument.body.removeChild(paragraph);
    });

    test('should detect task-list-item class', () => {
      const container = activeDocument.createElement('div');
      const taskItem = activeDocument.createElement('div');
      taskItem.classList.add('task-list-item');
      const otherParagraph = activeDocument.createElement('p');
      otherParagraph.textContent = 'SCHEDULED: today';

      container.appendChild(taskItem);
      container.appendChild(otherParagraph);
      activeDocument.body.appendChild(container);

      const hasTaskInPreviousSiblings = (
        formatter as unknown as {
          hasTaskInPreviousSiblings: (p: HTMLParagraphElement) => boolean;
        }
      ).hasTaskInPreviousSiblings;
      const result = hasTaskInPreviousSiblings.call(formatter, otherParagraph);

      expect(result).toBe(true);
      activeDocument.body.removeChild(container);
    });
  });

  describe('hasTaskBeforeDateInParagraph', () => {
    test('should find task before date in same paragraph', () => {
      const paragraph = activeDocument.createElement('p');
      paragraph.textContent = 'TODO something SCHEDULED: today';
      activeDocument.body.appendChild(paragraph);

      const hasTaskBeforeDateInParagraph = (
        formatter as unknown as {
          hasTaskBeforeDateInParagraph: (p: HTMLParagraphElement) => boolean;
        }
      ).hasTaskBeforeDateInParagraph;
      const result = hasTaskBeforeDateInParagraph.call(formatter, paragraph);

      expect(result).toBe(true);
      activeDocument.body.removeChild(paragraph);
    });

    test('should handle br elements as separators', () => {
      const paragraph = activeDocument.createElement('p');
      paragraph.appendChild(activeDocument.createTextNode('TODO something'));
      paragraph.appendChild(activeDocument.createElement('br'));
      paragraph.appendChild(activeDocument.createTextNode('SCHEDULED: today'));
      activeDocument.body.appendChild(paragraph);

      const hasTaskBeforeDateInParagraph = (
        formatter as unknown as {
          hasTaskBeforeDateInParagraph: (p: HTMLParagraphElement) => boolean;
        }
      ).hasTaskBeforeDateInParagraph;
      const result = hasTaskBeforeDateInParagraph.call(formatter, paragraph);

      expect(result).toBe(true);
      activeDocument.body.removeChild(paragraph);
    });

    test('should return false when only date line exists', () => {
      const paragraph = activeDocument.createElement('p');
      paragraph.textContent = 'SCHEDULED: today';
      activeDocument.body.appendChild(paragraph);

      const hasTaskBeforeDateInParagraph = (
        formatter as unknown as {
          hasTaskBeforeDateInParagraph: (p: HTMLParagraphElement) => boolean;
        }
      ).hasTaskBeforeDateInParagraph;
      const result = hasTaskBeforeDateInParagraph.call(formatter, paragraph);

      expect(result).toBe(false);
      activeDocument.body.removeChild(paragraph);
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
      const mockElement = activeDocument.createElement('div');
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
      const paragraph = activeDocument.createElement('p');
      paragraph.textContent = 'SCHEDULED: 2024-01-01';
      activeDocument.body.appendChild(paragraph);

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
      activeDocument.body.removeChild(paragraph);
    });

    test('should find DEADLINE: in text node', () => {
      const paragraph = activeDocument.createElement('p');
      paragraph.textContent = 'DEADLINE: 2024-01-01';
      activeDocument.body.appendChild(paragraph);

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
      activeDocument.body.removeChild(paragraph);
    });

    test('should return null when keyword not found', () => {
      const paragraph = activeDocument.createElement('p');
      paragraph.textContent = 'Some other text';
      activeDocument.body.appendChild(paragraph);

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
      activeDocument.body.removeChild(paragraph);
    });
  });

  describe('processPriorityPillsInTextNode', () => {
    test('should replace priority token in text node with pill', () => {
      const paragraph = activeDocument.createElement('p');
      paragraph.textContent = 'Task with priority [#A]';
      activeDocument.body.appendChild(paragraph);

      const textNode = paragraph.firstChild as Text;

      const processPriorityPillsInTextNode = (
        formatter as unknown as {
          processPriorityPillsInTextNode: (node: Node) => void;
        }
      ).processPriorityPillsInTextNode;

      processPriorityPillsInTextNode.call(formatter, textNode);

      const pill = paragraph.querySelector('.todoseq-priority-badge');
      expect(pill).not.toBeNull();
      expect(pill?.textContent).toBe('A');
      expect(pill?.classList.contains('priority-high')).toBe(true);

      activeDocument.body.removeChild(paragraph);
    });

    test('should handle multiple priority tokens in single text node', () => {
      const paragraph = activeDocument.createElement('p');
      paragraph.textContent = 'Task with priorities [#A], [#B], and [#C]';
      activeDocument.body.appendChild(paragraph);

      const textNode = paragraph.firstChild as Text;

      const processPriorityPillsInTextNode = (
        formatter as unknown as {
          processPriorityPillsInTextNode: (node: Node) => void;
        }
      ).processPriorityPillsInTextNode;

      processPriorityPillsInTextNode.call(formatter, textNode);

      const pills = paragraph.querySelectorAll('.todoseq-priority-badge');
      expect(pills.length).toBe(3);
      expect(pills[0].textContent).toBe('C');
      expect(pills[0].classList.contains('priority-low')).toBe(true);
      expect(pills[1].textContent).toBe('B');
      expect(pills[1].classList.contains('priority-med')).toBe(true);
      expect(pills[2].textContent).toBe('A');
      expect(pills[2].classList.contains('priority-high')).toBe(true);

      activeDocument.body.removeChild(paragraph);
    });

    test('should not modify text node without priority tokens', () => {
      const paragraph = activeDocument.createElement('p');
      paragraph.textContent = 'Task without priority';
      activeDocument.body.appendChild(paragraph);

      const textNode = paragraph.firstChild as Text;

      const processPriorityPillsInTextNode = (
        formatter as unknown as {
          processPriorityPillsInTextNode: (node: Node) => void;
        }
      ).processPriorityPillsInTextNode;

      const originalContent = paragraph.innerHTML;
      processPriorityPillsInTextNode.call(formatter, textNode);

      expect(paragraph.innerHTML).toEqual(originalContent);

      activeDocument.body.removeChild(paragraph);
    });
  });

  describe('attachKeywordClickHandlers', () => {
    test('should attach click, contextmenu, and keydown handlers to keywords', () => {
      const container = activeDocument.createElement('div');
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      activeDocument.body.appendChild(container);

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

      activeDocument.body.removeChild(container);
    });

    test('should skip elements without todoseq-keyword-formatted class', () => {
      const container = activeDocument.createElement('div');
      const span = activeDocument.createElement('span');
      span.textContent = 'NOT A KEYWORD';
      container.appendChild(span);
      activeDocument.body.appendChild(container);

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

      activeDocument.body.removeChild(container);
    });
  });

  describe('handleKeywordKeydown', () => {
    test('should handle Enter key to toggle state', async () => {
      const container = activeDocument.createElement('div');
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      activeDocument.body.appendChild(container);

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

      activeDocument.body.removeChild(container);
    });

    test('should handle Space key to toggle state', async () => {
      const container = activeDocument.createElement('div');
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      activeDocument.body.appendChild(container);

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

      activeDocument.body.removeChild(container);
    });
  });

  describe('attachCheckboxClickHandlers', () => {
    test('should attach click handlers to checkboxes', () => {
      const container = activeDocument.createElement('div');
      const checkbox = activeDocument.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      container.appendChild(checkbox);
      activeDocument.body.appendChild(container);

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

      activeDocument.body.removeChild(container);
    });
  });

  describe('handleCheckboxClick', () => {
    test('should return early if no task list item found', async () => {
      const container = activeDocument.createElement('div');
      const checkbox = activeDocument.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      container.appendChild(checkbox);
      activeDocument.body.appendChild(container);

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

      activeDocument.body.removeChild(container);
    });
  });

  describe('handleKeywordContextMenu', () => {
    test('should show context menu on right-click', async () => {
      const container = activeDocument.createElement('div');
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      activeDocument.body.appendChild(container);

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

      activeDocument.body.removeChild(container);
    });
  });

  describe('toggleTaskState', () => {
    test('should toggle task state using NEXT_STATE map', async () => {
      const container = activeDocument.createElement('div');
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      activeDocument.body.appendChild(container);

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

      activeDocument.body.removeChild(container);
    });

    test('should return early if no data-task-keyword attribute', async () => {
      const container = activeDocument.createElement('div');
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      activeDocument.body.appendChild(container);

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

      activeDocument.body.removeChild(container);
    });
  });

  describe('updateTaskState', () => {
    test('should call taskEditor.updateTaskState', async () => {
      const container = activeDocument.createElement('div');
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      activeDocument.body.appendChild(container);

      const mockTask = { id: '1', text: 'Test task' };
      const findTaskForKeyword = jest
        .spyOn(formatter as any, 'findTaskForKeyword')
        .mockResolvedValue(mockTask);
      const taskEditor = { updateTaskState: jest.fn() };
      (formatter as any).plugin.taskEditor = taskEditor;
      const savedCoordinator = (formatter as any).plugin.taskUpdateCoordinator;
      (formatter as any).plugin.taskUpdateCoordinator = undefined;

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
      expect(taskEditor.updateTaskState).toHaveBeenCalledWith(
        mockTask,
        'DONE',
        true,
      );

      (formatter as any).plugin.taskUpdateCoordinator = savedCoordinator;
      activeDocument.body.removeChild(container);
    });

    test('should return early if task not found', async () => {
      const container = activeDocument.createElement('div');
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      activeDocument.body.appendChild(container);

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

      activeDocument.body.removeChild(container);
    });
  });

  describe('handleKeywordClick', () => {
    test('should handle single click and toggle state', (done) => {
      const container = activeDocument.createElement('div');
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      activeDocument.body.appendChild(container);

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
        activeDocument.body.removeChild(container);
        done();
      }, 350); // Wait a little longer than DOUBLE_CLICK_THRESHOLD (300ms)
    });

    test('should handle double click and not toggle state', (done) => {
      const container = activeDocument.createElement('div');
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      activeDocument.body.appendChild(container);

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
        activeDocument.body.removeChild(container);
        done();
      }, 350);
    });
  });

  describe('replaceKeywordInTextNodesAndBuildTask', () => {
    test('should replace keyword in single text node', () => {
      const paragraph = activeDocument.createElement('p');
      paragraph.textContent = 'TODO task text';
      activeDocument.body.appendChild(paragraph);

      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';

      const taskContainer = activeDocument.createElement('span');
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

      activeDocument.body.removeChild(paragraph);
    });

    test('should clone non-text nodes', () => {
      const paragraph = activeDocument.createElement('p');
      paragraph.appendChild(activeDocument.createTextNode('TODO '));
      paragraph.appendChild(activeDocument.createElement('b')).textContent =
        'important';
      paragraph.appendChild(activeDocument.createTextNode(' task'));
      activeDocument.body.appendChild(paragraph);

      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';

      const taskContainer = activeDocument.createElement('span');
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

      activeDocument.body.removeChild(paragraph);
    });

    test('should clone all nodes if keyword not found', () => {
      const paragraph = activeDocument.createElement('p');
      paragraph.textContent = 'Regular text without keyword';
      activeDocument.body.appendChild(paragraph);

      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';

      const taskContainer = activeDocument.createElement('span');
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

      activeDocument.body.removeChild(paragraph);
    });
  });

  describe('applyCompletedTaskStylingToTaskContainer', () => {
    test('should wrap completed task content in container', () => {
      const taskContainer = activeDocument.createElement('span');
      taskContainer.className = 'todoseq-task';

      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'DONE');
      keywordSpan.textContent = 'DONE';

      const taskText = activeDocument.createTextNode(' task text');

      taskContainer.appendChild(keywordSpan);
      taskContainer.appendChild(taskText);
      activeDocument.body.appendChild(taskContainer);

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

      activeDocument.body.removeChild(taskContainer);
    });

    test('should not modify container without keyword span', () => {
      const taskContainer = activeDocument.createElement('span');
      taskContainer.className = 'todoseq-task';

      const taskText = activeDocument.createTextNode(
        'Task without keyword span',
      );
      taskContainer.appendChild(taskText);
      activeDocument.body.appendChild(taskContainer);

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

      activeDocument.body.removeChild(taskContainer);
    });

    test('should wrap any task container with keyword span', () => {
      const taskContainer = activeDocument.createElement('span');
      taskContainer.className = 'todoseq-task';

      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';

      const taskText = activeDocument.createTextNode(' task text');

      taskContainer.appendChild(keywordSpan);
      taskContainer.appendChild(taskText);
      activeDocument.body.appendChild(taskContainer);

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

      activeDocument.body.removeChild(taskContainer);
    });
  });

  describe('processPriorityTagLinks', () => {
    test('should replace priority tag links with pills', () => {
      const paragraph = activeDocument.createElement('p');
      paragraph.appendChild(
        activeDocument.createTextNode('Task with priority ['),
      );
      const tagLinkA = activeDocument.createElement('a');
      tagLinkA.href = '#A';
      tagLinkA.className = 'tag';
      tagLinkA.textContent = '#A';
      paragraph.appendChild(tagLinkA);
      paragraph.appendChild(activeDocument.createTextNode(']'));
      activeDocument.body.appendChild(paragraph);

      const processPriorityTagLinks = (
        formatter as unknown as {
          processPriorityTagLinks: (element: HTMLElement) => void;
        }
      ).processPriorityTagLinks;

      processPriorityTagLinks.call(formatter, paragraph);

      const pill = paragraph.querySelector('.todoseq-priority-badge');
      expect(pill).not.toBeNull();
      expect(pill?.textContent).toBe('A');
      expect(pill?.classList.contains('priority-high')).toBe(true);

      const tagLink = paragraph.querySelector('a.tag');
      expect(tagLink).toBeNull();

      activeDocument.body.removeChild(paragraph);
    });

    test('should skip non-priority tag links', () => {
      const paragraph = activeDocument.createElement('p');
      paragraph.appendChild(activeDocument.createTextNode('Task with tag ['));
      const tagLinkImportant = activeDocument.createElement('a');
      tagLinkImportant.href = '#important';
      tagLinkImportant.className = 'tag';
      tagLinkImportant.textContent = '#important';
      paragraph.appendChild(tagLinkImportant);
      paragraph.appendChild(activeDocument.createTextNode(']'));
      activeDocument.body.appendChild(paragraph);

      const processPriorityTagLinks = (
        formatter as unknown as {
          processPriorityTagLinks: (element: HTMLElement) => void;
        }
      ).processPriorityTagLinks;

      const originalContent = paragraph.innerHTML;
      processPriorityTagLinks.call(formatter, paragraph);

      expect(paragraph.innerHTML).toEqual(originalContent);

      activeDocument.body.removeChild(paragraph);
    });
  });

  describe('processTaskKeywords', () => {
    test('should call processTaskListItems, processRegularParagraphs, and processBulletListItems', () => {
      const container = activeDocument.createElement('div');
      activeDocument.body.appendChild(container);

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

      activeDocument.body.removeChild(container);
    });

    test('should warn and return early if task parser is not initialized', () => {
      const container = activeDocument.createElement('div');
      activeDocument.body.appendChild(container);

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
      activeDocument.body.removeChild(container);
    });
  });

  describe('processPriorityPills', () => {
    test('should process priority pills in task list items', () => {
      const container = activeDocument.createElement('div');
      const taskItem = activeDocument.createElement('div');
      taskItem.className = 'task-list-item';
      taskItem.textContent = 'TODO task with priority [#A]';
      container.appendChild(taskItem);
      activeDocument.body.appendChild(container);

      const processPriorityPills = (
        formatter as unknown as {
          processPriorityPills: (element: HTMLElement) => void;
        }
      ).processPriorityPills;

      processPriorityPills.call(formatter, container);

      const pill = taskItem.querySelector('.todoseq-priority-badge');
      expect(pill).not.toBeNull();
      expect(pill?.textContent).toBe('A');
      expect(pill?.classList.contains('priority-high')).toBe(true);

      activeDocument.body.removeChild(container);
    });

    test('should process priority pills in regular list items', () => {
      const container = activeDocument.createElement('div');
      const listItem = activeDocument.createElement('li');
      listItem.textContent = 'TODO task with priority [#B]';
      container.appendChild(listItem);
      activeDocument.body.appendChild(container);

      const processPriorityPills = (
        formatter as unknown as {
          processPriorityPills: (element: HTMLElement) => void;
        }
      ).processPriorityPills;

      processPriorityPills.call(formatter, container);

      const pill = listItem.querySelector('.todoseq-priority-badge');
      expect(pill).not.toBeNull();
      expect(pill?.textContent).toBe('B');
      expect(pill?.classList.contains('priority-med')).toBe(true);

      activeDocument.body.removeChild(container);
    });

    test('should skip processing when formatTaskKeywords is false', () => {
      mockPlugin.settings.formatTaskKeywords = false;

      const container = activeDocument.createElement('div');
      const taskItem = activeDocument.createElement('div');
      taskItem.className = 'task-list-item';
      taskItem.textContent = 'TODO task with priority [#A]';
      container.appendChild(taskItem);
      activeDocument.body.appendChild(container);

      const processPriorityPills = (
        formatter as unknown as {
          processPriorityPills: (element: HTMLElement) => void;
        }
      ).processPriorityPills;

      processPriorityPills.call(formatter, container);

      const pill = taskItem.querySelector('.todoseq-priority-badge');
      expect(pill).toBeNull();

      activeDocument.body.removeChild(container);
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

      expect(pill.classList.contains('todoseq-priority-badge')).toBe(true);
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

      expect(pill.classList.contains('todoseq-priority-badge')).toBe(true);
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

      expect(pill.classList.contains('todoseq-priority-badge')).toBe(true);
      expect(pill.classList.contains('priority-low')).toBe(true);
      expect(pill.getAttribute('data-priority')).toBe('C');
      expect(pill.getAttribute('aria-label')).toBe('Priority C');
      expect(pill.getAttribute('role')).toBe('badge');
      expect(pill.textContent).toBe('C');
    });
  });

  describe('wrapDateKeyword', () => {
    test('should wrap SCHEDULED: keyword in styled spans', () => {
      const paragraph = activeDocument.createElement('p');
      const textNode = activeDocument.createTextNode('SCHEDULED: 2024-01-01');
      paragraph.appendChild(textNode);
      activeDocument.body.appendChild(paragraph);

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

      activeDocument.body.removeChild(paragraph);
    });

    test('should wrap DEADLINE: keyword in styled spans', () => {
      const paragraph = activeDocument.createElement('p');
      const textNode = activeDocument.createTextNode('DEADLINE: 2024-01-01');
      paragraph.appendChild(textNode);
      activeDocument.body.appendChild(paragraph);

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

      activeDocument.body.removeChild(paragraph);
    });

    test('should set correct aria-label on date container', () => {
      const paragraph = activeDocument.createElement('p');
      const textNode = activeDocument.createTextNode('SCHEDULED: 2024-01-01');
      paragraph.appendChild(textNode);
      activeDocument.body.appendChild(paragraph);

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

      activeDocument.body.removeChild(paragraph);
    });

    test('should set correct role attributes', () => {
      const paragraph = activeDocument.createElement('p');
      const textNode = activeDocument.createTextNode('SCHEDULED: 2024-01-01');
      paragraph.appendChild(textNode);
      activeDocument.body.appendChild(paragraph);

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

      activeDocument.body.removeChild(paragraph);
    });
  });

  describe('processDateLines', () => {
    test('should process paragraphs with SCHEDULED:', () => {
      const container = activeDocument.createElement('div');
      const taskParagraph = activeDocument.createElement('p');
      taskParagraph.textContent = 'TODO something';
      const dateParagraph = activeDocument.createElement('p');
      dateParagraph.textContent = 'SCHEDULED: today';

      container.appendChild(taskParagraph);
      container.appendChild(dateParagraph);
      activeDocument.body.appendChild(container);

      const processDateLines = (
        formatter as unknown as { processDateLines: (el: HTMLElement) => void }
      ).processDateLines;
      processDateLines.call(formatter, container);

      const dateContainer = dateParagraph.querySelector(
        '.todoseq-scheduled-line',
      );
      expect(dateContainer).not.toBeNull();

      activeDocument.body.removeChild(container);
    });

    test('should process paragraphs with DEADLINE:', () => {
      const container = activeDocument.createElement('div');
      const taskParagraph = activeDocument.createElement('p');
      taskParagraph.textContent = 'TODO something';
      const dateParagraph = activeDocument.createElement('p');
      dateParagraph.textContent = 'DEADLINE: today';

      container.appendChild(taskParagraph);
      container.appendChild(dateParagraph);
      activeDocument.body.appendChild(container);

      const processDateLines = (
        formatter as unknown as { processDateLines: (el: HTMLElement) => void }
      ).processDateLines;
      processDateLines.call(formatter, container);

      const dateContainer = dateParagraph.querySelector(
        '.todoseq-deadline-line',
      );
      expect(dateContainer).not.toBeNull();

      activeDocument.body.removeChild(container);
    });

    test('should skip paragraphs without date keywords', () => {
      const container = activeDocument.createElement('div');
      const paragraph = activeDocument.createElement('p');
      paragraph.textContent = 'Just regular text';
      container.appendChild(paragraph);
      activeDocument.body.appendChild(container);

      const processDateLines = (
        formatter as unknown as { processDateLines: (el: HTMLElement) => void }
      ).processDateLines;
      processDateLines.call(formatter, container);

      // Paragraph should remain unchanged
      expect(paragraph.textContent).toBe('Just regular text');

      activeDocument.body.removeChild(container);
    });

    test('should skip date lines without preceding task', () => {
      const container = activeDocument.createElement('div');
      const dateParagraph = activeDocument.createElement('p');
      dateParagraph.textContent = 'SCHEDULED: today';
      container.appendChild(dateParagraph);
      activeDocument.body.appendChild(container);

      const processDateLines = (
        formatter as unknown as { processDateLines: (el: HTMLElement) => void }
      ).processDateLines;
      processDateLines.call(formatter, container);

      // Paragraph should remain unchanged (no preceding task)
      expect(dateParagraph.querySelector('.todoseq-scheduled-line')).toBeNull();

      activeDocument.body.removeChild(container);
    });
  });

  describe('findTaskForKeyword', () => {
    test('should return null if file not found', async () => {
      const container = activeDocument.createElement('div');
      const paragraph = activeDocument.createElement('p');
      paragraph.textContent = 'TODO Test task';
      container.appendChild(paragraph);
      activeDocument.body.appendChild(container);

      const keywordSpan = activeDocument.createElement('span');
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

      activeDocument.body.removeChild(container);
    });

    test('should return null if task parser not available', async () => {
      const container = activeDocument.createElement('div');
      const paragraph = activeDocument.createElement('p');
      paragraph.textContent = 'TODO Test task';
      container.appendChild(paragraph);
      activeDocument.body.appendChild(container);

      const keywordSpan = activeDocument.createElement('span');
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

      activeDocument.body.removeChild(container);
    });

    test('should return null if task container not found', async () => {
      // Create a keyword span not contained in any valid task container
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      activeDocument.body.appendChild(keywordSpan);

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

      activeDocument.body.removeChild(keywordSpan);
    });

    test('should return null if no task found', async () => {
      const container = activeDocument.createElement('div');
      const paragraph = activeDocument.createElement('p');
      paragraph.textContent = 'NOT A TASK';
      container.appendChild(paragraph);
      activeDocument.body.appendChild(container);

      const keywordSpan = activeDocument.createElement('span');
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

      activeDocument.body.removeChild(container);
    });

    test('should match task by priority badge for paragraphs without data-line', async () => {
      // This tests the bug fix: clicking keyword on TODO [#B] test 2 should NOT match TODO [#A] test 1
      const container = activeDocument.createElement('div');

      // First task: TODO [#A] test 1
      const p1 = activeDocument.createElement('p');
      const taskContainer1 = activeDocument.createElement('span');
      taskContainer1.className = 'todoseq-task';
      const keyword1 = activeDocument.createElement('span');
      keyword1.className = 'todoseq-keyword-formatted';
      keyword1.setAttribute('data-task-keyword', 'TODO');
      keyword1.textContent = 'TODO';
      const priorityBadge1 = activeDocument.createElement('span');
      priorityBadge1.className = 'todoseq-priority-badge priority-high';
      priorityBadge1.setAttribute('data-priority', 'A');
      priorityBadge1.textContent = 'A';
      const text1 = activeDocument.createTextNode(' test 1');

      taskContainer1.appendChild(keyword1);
      taskContainer1.appendChild(priorityBadge1);
      taskContainer1.appendChild(text1);
      p1.appendChild(taskContainer1);
      container.appendChild(p1);

      // Second task: TODO [#B] test 2
      const p2 = activeDocument.createElement('p');
      const taskContainer2 = activeDocument.createElement('span');
      taskContainer2.className = 'todoseq-task';
      const keyword2 = activeDocument.createElement('span');
      keyword2.className = 'todoseq-keyword-formatted';
      keyword2.setAttribute('data-task-keyword', 'TODO');
      keyword2.textContent = 'TODO';
      const priorityBadge2 = activeDocument.createElement('span');
      priorityBadge2.className = 'todoseq-priority-badge priority-med';
      priorityBadge2.setAttribute('data-priority', 'B');
      priorityBadge2.textContent = 'B';
      const text2 = activeDocument.createTextNode(' test 2');

      taskContainer2.appendChild(keyword2);
      taskContainer2.appendChild(priorityBadge2);
      taskContainer2.appendChild(text2);
      p2.appendChild(taskContainer2);
      container.appendChild(p2);

      activeDocument.body.appendChild(container);

      const mockFile = new TFile('test.md');
      const tasksFromParser = [
        {
          id: '1',
          text: '[#A] test 1',
          line: 0,
          state: 'TODO',
          priority: 'A',
          rawText: 'TODO [#A] test 1',
        },
        {
          id: '2',
          text: '[#B] test 2',
          line: 1,
          state: 'TODO',
          priority: 'B',
          rawText: 'TODO [#B] test 2',
        },
      ];

      jest
        .spyOn(mockPlugin.app.vault, 'getAbstractFileByPath')
        .mockReturnValue(mockFile);
      jest
        .spyOn(mockPlugin.app.vault, 'read')
        .mockResolvedValue('TODO [#A] test 1\nTODO [#B] test 2');
      jest.spyOn(formatter as any, 'getTaskParser').mockReturnValue({
        testRegex: /^TODO (.*)$/,
        parseFile: jest.fn().mockReturnValue(tasksFromParser),
      });

      const findTaskForKeyword = (
        formatter as unknown as {
          findTaskForKeyword: (
            keywordElement: HTMLElement,
            sourcePath: string,
          ) => Promise<any>;
        }
      ).findTaskForKeyword;

      // Clicking on the SECOND task (TODO [#B] test 2) should return the task with priority B
      const task = await findTaskForKeyword.call(
        formatter,
        keyword2,
        'test.md',
      );

      expect(task).not.toBeNull();
      expect(task.line).toBe(1); // Should be line 1, not line 0
      expect(task.priority).toBe('B');

      activeDocument.body.removeChild(container);
    });

    test('should use data-line attribute for list items', async () => {
      // Test that list items with data-line attribute work correctly
      const container = activeDocument.createElement('div');

      // Create list items with data-line attribute
      const li1 = activeDocument.createElement('li');
      li1.setAttribute('data-line', '0');
      const taskContainer1 = activeDocument.createElement('span');
      taskContainer1.className = 'todoseq-task';
      const keyword1 = activeDocument.createElement('span');
      keyword1.className = 'todoseq-keyword-formatted';
      keyword1.setAttribute('data-task-keyword', 'TODO');
      keyword1.textContent = 'TODO';
      taskContainer1.appendChild(keyword1);
      taskContainer1.appendChild(activeDocument.createTextNode(' task 1'));
      li1.appendChild(taskContainer1);
      container.appendChild(li1);

      const li2 = activeDocument.createElement('li');
      li2.setAttribute('data-line', '1');
      const taskContainer2 = activeDocument.createElement('span');
      taskContainer2.className = 'todoseq-task';
      const keyword2 = activeDocument.createElement('span');
      keyword2.className = 'todoseq-keyword-formatted';
      keyword2.setAttribute('data-task-keyword', 'TODO');
      keyword2.textContent = 'TODO';
      taskContainer2.appendChild(keyword2);
      taskContainer2.appendChild(activeDocument.createTextNode(' task 2'));
      li2.appendChild(taskContainer2);
      container.appendChild(li2);

      activeDocument.body.appendChild(container);

      const mockFile = new TFile('test.md');
      const tasksFromParser = [
        {
          id: '1',
          text: 'task 1',
          line: 0,
          state: 'TODO',
          rawText: '- TODO task 1',
        },
        {
          id: '2',
          text: 'task 2',
          line: 1,
          state: 'TODO',
          rawText: '- TODO task 2',
        },
      ];

      jest
        .spyOn(mockPlugin.app.vault, 'getAbstractFileByPath')
        .mockReturnValue(mockFile);
      jest
        .spyOn(mockPlugin.app.vault, 'read')
        .mockResolvedValue('- TODO task 1\n- TODO task 2');
      jest.spyOn(formatter as any, 'getTaskParser').mockReturnValue({
        testRegex: /^- TODO (.*)$/,
        parseFile: jest.fn().mockReturnValue(tasksFromParser),
      });

      const findTaskForKeyword = (
        formatter as unknown as {
          findTaskForKeyword: (
            keywordElement: HTMLElement,
            sourcePath: string,
          ) => Promise<any>;
        }
      ).findTaskForKeyword;

      // Clicking on second task should return task at line 1
      const task = await findTaskForKeyword.call(
        formatter,
        keyword2,
        'test.md',
      );

      expect(task).not.toBeNull();
      expect(task.line).toBe(1);
      expect(task.text).toBe('task 2');

      activeDocument.body.removeChild(container);
    });

    test('should use substring fallback when exact text does not match', async () => {
      // Test the second-tier matching: substring match
      const container = activeDocument.createElement('div');
      const p = activeDocument.createElement('p');
      const taskContainer = activeDocument.createElement('span');
      taskContainer.className = 'todoseq-task';
      const keyword = activeDocument.createElement('span');
      keyword.className = 'todoseq-keyword-formatted';
      keyword.setAttribute('data-task-keyword', 'TODO');
      keyword.textContent = 'TODO';
      // Note: no priority badge in this test
      taskContainer.appendChild(keyword);
      taskContainer.appendChild(
        activeDocument.createTextNode(' some unique task text'),
      );
      p.appendChild(taskContainer);
      container.appendChild(p);
      activeDocument.body.appendChild(container);

      const mockFile = new TFile('test.md');
      // Parser returns slightly different text (e.g., with markdown)
      const tasksFromParser = [
        {
          id: '1',
          text: 'some **unique** task text',
          line: 0,
          state: 'TODO',
          rawText: 'TODO some **unique** task text',
        },
      ];

      jest
        .spyOn(mockPlugin.app.vault, 'getAbstractFileByPath')
        .mockReturnValue(mockFile);
      jest
        .spyOn(mockPlugin.app.vault, 'read')
        .mockResolvedValue('TODO some **unique** task text');
      jest.spyOn(formatter as any, 'getTaskParser').mockReturnValue({
        testRegex: /^TODO (.*)$/,
        parseFile: jest.fn().mockReturnValue(tasksFromParser),
      });

      const findTaskForKeyword = (
        formatter as unknown as {
          findTaskForKeyword: (
            keywordElement: HTMLElement,
            sourcePath: string,
          ) => Promise<any>;
        }
      ).findTaskForKeyword;

      const task = await findTaskForKeyword.call(formatter, keyword, 'test.md');

      // Should still match via substring matching (stripMarkdownForDisplay normalizes both)
      expect(task).not.toBeNull();
      expect(task.line).toBe(0);

      activeDocument.body.removeChild(container);
    });
  });

  describe('createKeywordSpan - archived class', () => {
    test('should add archived class when isArchived is true', () => {
      const createKeywordSpan = (
        formatter as unknown as {
          createKeywordSpan: (
            keyword: string,
            isCompleted?: boolean,
            isArchived?: boolean,
          ) => HTMLSpanElement;
        }
      ).createKeywordSpan;
      const span = createKeywordSpan.call(formatter, 'CANCELED', false, true);

      expect(span.classList.contains('todoseq-keyword-formatted')).toBe(true);
      expect(span.classList.contains('todoseq-archived-keyword')).toBe(true);
      expect(span.classList.contains('todoseq-completed-keyword')).toBe(false);
    });
  });

  describe('createKeywordSpan - completed class', () => {
    test('should add completed class when isCompleted is true', () => {
      const createKeywordSpan = (
        formatter as unknown as {
          createKeywordSpan: (
            keyword: string,
            isCompleted?: boolean,
            isArchived?: boolean,
          ) => HTMLSpanElement;
        }
      ).createKeywordSpan;
      const span = createKeywordSpan.call(formatter, 'DONE', true, false);

      expect(span.classList.contains('todoseq-keyword-formatted')).toBe(true);
      expect(span.classList.contains('todoseq-completed-keyword')).toBe(true);
      expect(span.classList.contains('todoseq-archived-keyword')).toBe(false);
    });
  });

  describe('createArchivedTaskContainer', () => {
    test('should create span with archived class', () => {
      const createArchivedTaskContainer = (
        formatter as unknown as {
          createArchivedTaskContainer: () => HTMLSpanElement;
        }
      ).createArchivedTaskContainer;
      const container = createArchivedTaskContainer.call(formatter);

      expect(container.classList.contains('todoseq-archived-task-text')).toBe(
        true,
      );
      expect(container.getAttribute('data-archived-task')).toBe('true');
      expect(container.tagName).toBe('SPAN');
    });
  });

  describe('processTaskListItems', () => {
    test('should format task keyword in task list item with paragraph', () => {
      const container = activeDocument.createElement('div');
      const li = activeDocument.createElement('li');
      li.className = 'task-list-item';
      li.setAttribute('data-line', '0');
      const checkbox = activeDocument.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      li.appendChild(checkbox);
      const p = activeDocument.createElement('p');
      p.textContent = 'TODO task text';
      li.appendChild(p);
      container.appendChild(li);
      activeDocument.body.appendChild(container);

      const processTaskListItems = (
        formatter as unknown as {
          processTaskListItems: (
            el: HTMLElement,
            includeCalloutBlocks: boolean,
          ) => void;
        }
      ).processTaskListItems;

      processTaskListItems.call(formatter, container, true);

      const keywordSpan = li.querySelector('.todoseq-keyword-formatted');
      expect(keywordSpan).not.toBeNull();
      expect(keywordSpan?.getAttribute('data-task-keyword')).toBe('TODO');

      const taskContainer = li.querySelector('.todoseq-task');
      expect(taskContainer).not.toBeNull();

      activeDocument.body.removeChild(container);
    });

    test('should skip elements inside embedded task list container', () => {
      const container = activeDocument.createElement('div');
      const embedded = activeDocument.createElement('div');
      embedded.className = 'todoseq-embedded-task-list-container';
      const li = activeDocument.createElement('li');
      li.className = 'task-list-item';
      li.setAttribute('data-line', '0');
      const p = activeDocument.createElement('p');
      p.textContent = 'TODO embedded task';
      li.appendChild(p);
      embedded.appendChild(li);
      container.appendChild(embedded);
      activeDocument.body.appendChild(container);

      const processTaskListItems = (
        formatter as unknown as {
          processTaskListItems: (
            el: HTMLElement,
            includeCalloutBlocks: boolean,
          ) => void;
        }
      ).processTaskListItems;

      processTaskListItems.call(formatter, container, true);

      expect(li.querySelector('.todoseq-keyword-formatted')).toBeNull();

      activeDocument.body.removeChild(container);
    });

    test('should skip elements inside callout when includeCalloutBlocks is false', () => {
      const container = activeDocument.createElement('div');
      const callout = activeDocument.createElement('div');
      callout.className = 'callout';
      const li = activeDocument.createElement('li');
      li.className = 'task-list-item';
      li.setAttribute('data-line', '0');
      const p = activeDocument.createElement('p');
      p.textContent = 'TODO callout task';
      li.appendChild(p);
      callout.appendChild(li);
      container.appendChild(callout);
      activeDocument.body.appendChild(container);

      const processTaskListItems = (
        formatter as unknown as {
          processTaskListItems: (
            el: HTMLElement,
            includeCalloutBlocks: boolean,
          ) => void;
        }
      ).processTaskListItems;

      processTaskListItems.call(formatter, container, false);

      expect(li.querySelector('.todoseq-keyword-formatted')).toBeNull();

      activeDocument.body.removeChild(container);
    });

    test('should apply checkbox styling when keyword span already exists', () => {
      const container = activeDocument.createElement('div');
      const li = activeDocument.createElement('li');
      li.className = 'task-list-item';
      li.setAttribute('data-line', '0');
      const checkbox = activeDocument.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      li.appendChild(checkbox);
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      const p = activeDocument.createElement('p');
      p.appendChild(keywordSpan);
      p.appendChild(activeDocument.createTextNode(' task text'));
      li.appendChild(p);
      container.appendChild(li);
      activeDocument.body.appendChild(container);

      const processTaskListItems = (
        formatter as unknown as {
          processTaskListItems: (
            el: HTMLElement,
            includeCalloutBlocks: boolean,
          ) => void;
        }
      ).processTaskListItems;

      processTaskListItems.call(formatter, container, true);

      expect(checkbox.getAttribute('data-task')).toBeTruthy();
      expect(li.getAttribute('data-task')).toBeTruthy();

      activeDocument.body.removeChild(container);
    });

    test('should process task list item without paragraph via processTaskListItemDirectly', () => {
      const container = activeDocument.createElement('div');
      const li = activeDocument.createElement('li');
      li.className = 'task-list-item';
      li.setAttribute('data-line', '0');
      const checkbox = activeDocument.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      li.appendChild(checkbox);
      li.appendChild(activeDocument.createTextNode('TODO direct task text'));
      container.appendChild(li);
      activeDocument.body.appendChild(container);

      const processTaskListItems = (
        formatter as unknown as {
          processTaskListItems: (
            el: HTMLElement,
            includeCalloutBlocks: boolean,
          ) => void;
        }
      ).processTaskListItems;

      processTaskListItems.call(formatter, container, true);

      const keywordSpan = li.querySelector('.todoseq-keyword-formatted');
      expect(keywordSpan).not.toBeNull();
      expect(keywordSpan?.getAttribute('data-task-keyword')).toBe('TODO');

      activeDocument.body.removeChild(container);
    });
  });

  describe('processRegularParagraphs', () => {
    test('should format task keyword in standalone paragraph', () => {
      const container = activeDocument.createElement('div');
      const p = activeDocument.createElement('p');
      p.textContent = 'TODO standalone task';
      container.appendChild(p);
      activeDocument.body.appendChild(container);

      const processRegularParagraphs = (
        formatter as unknown as {
          processRegularParagraphs: (
            el: HTMLElement,
            includeCalloutBlocks: boolean,
          ) => void;
        }
      ).processRegularParagraphs;

      processRegularParagraphs.call(formatter, container, true);

      const keywordSpan = p.querySelector('.todoseq-keyword-formatted');
      expect(keywordSpan).not.toBeNull();
      expect(keywordSpan?.getAttribute('data-task-keyword')).toBe('TODO');

      activeDocument.body.removeChild(container);
    });

    test('should skip paragraphs inside embedded task list container', () => {
      const container = activeDocument.createElement('div');
      const embedded = activeDocument.createElement('div');
      embedded.className = 'todoseq-embedded-task-list-container';
      const p = activeDocument.createElement('p');
      p.textContent = 'TODO embedded task';
      embedded.appendChild(p);
      container.appendChild(embedded);
      activeDocument.body.appendChild(container);

      const processRegularParagraphs = (
        formatter as unknown as {
          processRegularParagraphs: (
            el: HTMLElement,
            includeCalloutBlocks: boolean,
          ) => void;
        }
      ).processRegularParagraphs;

      processRegularParagraphs.call(formatter, container, true);

      expect(p.querySelector('.todoseq-keyword-formatted')).toBeNull();

      activeDocument.body.removeChild(container);
    });

    test('should skip paragraphs inside callout when disabled', () => {
      const container = activeDocument.createElement('div');
      const callout = activeDocument.createElement('div');
      callout.className = 'callout';
      const p = activeDocument.createElement('p');
      p.textContent = 'TODO callout task';
      callout.appendChild(p);
      container.appendChild(callout);
      activeDocument.body.appendChild(container);

      const processRegularParagraphs = (
        formatter as unknown as {
          processRegularParagraphs: (
            el: HTMLElement,
            includeCalloutBlocks: boolean,
          ) => void;
        }
      ).processRegularParagraphs;

      processRegularParagraphs.call(formatter, container, false);

      expect(p.querySelector('.todoseq-keyword-formatted')).toBeNull();

      activeDocument.body.removeChild(container);
    });
  });

  describe('processBulletListItems', () => {
    test('should format task keyword in bullet list item', () => {
      const container = activeDocument.createElement('div');
      const li = activeDocument.createElement('li');
      li.appendChild(activeDocument.createTextNode('TODO bullet task text'));
      container.appendChild(li);
      activeDocument.body.appendChild(container);

      const processBulletListItems = (
        formatter as unknown as {
          processBulletListItems: (
            el: HTMLElement,
            includeCalloutBlocks: boolean,
          ) => void;
        }
      ).processBulletListItems;

      processBulletListItems.call(formatter, container, true);

      const keywordSpan = li.querySelector('.todoseq-keyword-formatted');
      expect(keywordSpan).not.toBeNull();
      expect(keywordSpan?.getAttribute('data-task-keyword')).toBe('TODO');

      const taskContainer = li.querySelector('.todoseq-task');
      expect(taskContainer).not.toBeNull();

      activeDocument.body.removeChild(container);
    });

    test('should process bullet list item with paragraph child', () => {
      const container = activeDocument.createElement('div');
      const li = activeDocument.createElement('li');
      const p = activeDocument.createElement('p');
      p.textContent = 'TODO task in paragraph';
      li.appendChild(p);
      container.appendChild(li);
      activeDocument.body.appendChild(container);

      const processBulletListItems = (
        formatter as unknown as {
          processBulletListItems: (
            el: HTMLElement,
            includeCalloutBlocks: boolean,
          ) => void;
        }
      ).processBulletListItems;

      processBulletListItems.call(formatter, container, true);

      const keywordSpan = li.querySelector('.todoseq-keyword-formatted');
      expect(keywordSpan).not.toBeNull();
      expect(keywordSpan?.getAttribute('data-task-keyword')).toBe('TODO');

      activeDocument.body.removeChild(container);
    });

    test('should skip bullet items inside embedded task list container', () => {
      const container = activeDocument.createElement('div');
      const embedded = activeDocument.createElement('div');
      embedded.className = 'todoseq-embedded-task-list-container';
      const li = activeDocument.createElement('li');
      li.appendChild(activeDocument.createTextNode('TODO embedded'));
      embedded.appendChild(li);
      container.appendChild(embedded);
      activeDocument.body.appendChild(container);

      const processBulletListItems = (
        formatter as unknown as {
          processBulletListItems: (
            el: HTMLElement,
            includeCalloutBlocks: boolean,
          ) => void;
        }
      ).processBulletListItems;

      processBulletListItems.call(formatter, container, true);

      expect(li.querySelector('.todoseq-keyword-formatted')).toBeNull();

      activeDocument.body.removeChild(container);
    });

    test('should skip bullet items inside callout when disabled', () => {
      const container = activeDocument.createElement('div');
      const callout = activeDocument.createElement('div');
      callout.className = 'callout';
      const li = activeDocument.createElement('li');
      li.appendChild(activeDocument.createTextNode('TODO callout task'));
      callout.appendChild(li);
      container.appendChild(callout);
      activeDocument.body.appendChild(container);

      const processBulletListItems = (
        formatter as unknown as {
          processBulletListItems: (
            el: HTMLElement,
            includeCalloutBlocks: boolean,
          ) => void;
        }
      ).processBulletListItems;

      processBulletListItems.call(formatter, container, false);

      expect(li.querySelector('.todoseq-keyword-formatted')).toBeNull();

      activeDocument.body.removeChild(container);
    });
  });

  describe('processTaskListItemDirectly', () => {
    test('should format task keyword and wrap in task container', () => {
      const li = activeDocument.createElement('li');
      li.className = 'task-list-item';
      const checkbox = activeDocument.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      li.appendChild(checkbox);
      li.appendChild(activeDocument.createTextNode('TODO direct task'));
      activeDocument.body.appendChild(li);

      const processTaskListItemDirectly = (
        formatter as unknown as {
          processTaskListItemDirectly: (el: HTMLElement) => void;
        }
      ).processTaskListItemDirectly;

      processTaskListItemDirectly.call(formatter, li);

      const keywordSpan = li.querySelector('.todoseq-keyword-formatted');
      expect(keywordSpan).not.toBeNull();
      expect(keywordSpan?.getAttribute('data-task-keyword')).toBe('TODO');

      const taskContainer = li.querySelector('.todoseq-task');
      expect(taskContainer).not.toBeNull();

      expect(checkbox.parentNode).toBe(li);

      activeDocument.body.removeChild(li);
    });

    test('should apply completed styling for completed keyword', () => {
      const li = activeDocument.createElement('li');
      li.className = 'task-list-item';
      const checkbox = activeDocument.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      li.appendChild(checkbox);
      li.appendChild(activeDocument.createTextNode('DONE completed task'));
      activeDocument.body.appendChild(li);

      const processTaskListItemDirectly = (
        formatter as unknown as {
          processTaskListItemDirectly: (el: HTMLElement) => void;
        }
      ).processTaskListItemDirectly;

      processTaskListItemDirectly.call(formatter, li);

      const completedContainer = li.querySelector(
        '.todoseq-completed-task-text',
      );
      expect(completedContainer).not.toBeNull();

      activeDocument.body.removeChild(li);
    });
  });

  describe('processListItemDirectly', () => {
    test('should format task keyword and wrap in task container', () => {
      const li = activeDocument.createElement('li');
      const bullet = activeDocument.createElement('span');
      bullet.className = 'list-bullet';
      li.appendChild(bullet);
      li.appendChild(activeDocument.createTextNode('TODO list task'));
      activeDocument.body.appendChild(li);

      const processListItemDirectly = (
        formatter as unknown as {
          processListItemDirectly: (el: HTMLElement) => void;
        }
      ).processListItemDirectly;

      processListItemDirectly.call(formatter, li);

      const keywordSpan = li.querySelector('.todoseq-keyword-formatted');
      expect(keywordSpan).not.toBeNull();
      expect(keywordSpan?.getAttribute('data-task-keyword')).toBe('TODO');

      const taskContainer = li.querySelector('.todoseq-task');
      expect(taskContainer).not.toBeNull();

      expect(bullet.parentNode).toBe(li);

      activeDocument.body.removeChild(li);
    });

    test('should apply completed styling for completed keyword', () => {
      const li = activeDocument.createElement('li');
      li.appendChild(activeDocument.createTextNode('DONE completed task'));
      activeDocument.body.appendChild(li);

      const processListItemDirectly = (
        formatter as unknown as {
          processListItemDirectly: (el: HTMLElement) => void;
        }
      ).processListItemDirectly;

      processListItemDirectly.call(formatter, li);

      const completedContainer = li.querySelector(
        '.todoseq-completed-task-text',
      );
      expect(completedContainer).not.toBeNull();

      activeDocument.body.removeChild(li);
    });

    test('should preserve collapse indicator elements', () => {
      const li = activeDocument.createElement('li');
      const collapse = activeDocument.createElement('span');
      collapse.className = 'collapse-indicator';
      li.appendChild(collapse);
      li.appendChild(activeDocument.createTextNode('TODO task'));
      activeDocument.body.appendChild(li);

      const processListItemDirectly = (
        formatter as unknown as {
          processListItemDirectly: (el: HTMLElement) => void;
        }
      ).processListItemDirectly;

      processListItemDirectly.call(formatter, li);

      expect(collapse.parentNode).toBe(li);

      activeDocument.body.removeChild(li);
    });

    test('should skip items without task keywords', () => {
      const li = activeDocument.createElement('li');
      li.appendChild(activeDocument.createTextNode('Just regular text'));
      activeDocument.body.appendChild(li);

      const processListItemDirectly = (
        formatter as unknown as {
          processListItemDirectly: (el: HTMLElement) => void;
        }
      ).processListItemDirectly;

      processListItemDirectly.call(formatter, li);

      expect(li.querySelector('.todoseq-keyword-formatted')).toBeNull();

      activeDocument.body.removeChild(li);
    });
  });

  describe('processParagraphByChildNodes', () => {
    test('should process multi-line paragraph with BR elements', () => {
      const p = activeDocument.createElement('p');
      p.appendChild(activeDocument.createTextNode('TODO first task'));
      p.appendChild(activeDocument.createElement('br'));
      p.appendChild(activeDocument.createTextNode('TODO second task'));
      activeDocument.body.appendChild(p);

      const processParagraphByChildNodes = (
        formatter as unknown as {
          processParagraphByChildNodes: (el: HTMLElement) => void;
        }
      ).processParagraphByChildNodes;

      processParagraphByChildNodes.call(formatter, p);

      const keywordSpans = p.querySelectorAll('.todoseq-keyword-formatted');
      expect(keywordSpans.length).toBe(2);
      expect(keywordSpans[0]?.getAttribute('data-task-keyword')).toBe('TODO');
      expect(keywordSpans[1]?.getAttribute('data-task-keyword')).toBe('TODO');

      activeDocument.body.removeChild(p);
    });

    test('should skip already-processed keyword spans', () => {
      const p = activeDocument.createElement('p');
      const existingSpan = activeDocument.createElement('span');
      existingSpan.className = 'todoseq-keyword-formatted';
      existingSpan.setAttribute('data-task-keyword', 'TODO');
      existingSpan.textContent = 'TODO';
      p.appendChild(existingSpan);
      p.appendChild(activeDocument.createTextNode(' task text'));
      activeDocument.body.appendChild(p);

      const processParagraphByChildNodes = (
        formatter as unknown as {
          processParagraphByChildNodes: (el: HTMLElement) => void;
        }
      ).processParagraphByChildNodes;

      processParagraphByChildNodes.call(formatter, p);

      const keywordSpans = p.querySelectorAll('.todoseq-keyword-formatted');
      expect(keywordSpans.length).toBe(1);

      activeDocument.body.removeChild(p);
    });
  });

  describe('applyArchivedTaskStylingToTaskContainer', () => {
    test('should wrap archived keyword and following text in archived container', () => {
      const taskContainer = activeDocument.createElement('span');
      taskContainer.className = 'todoseq-task';

      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'CANCELED');
      keywordSpan.textContent = 'CANCELED';

      const taskText = activeDocument.createTextNode(' task text');

      taskContainer.appendChild(keywordSpan);
      taskContainer.appendChild(taskText);
      activeDocument.body.appendChild(taskContainer);

      mockSettings.additionalArchivedKeywords = ['CANCELED'];
      const km = createTestKeywordManager(mockSettings);
      (mockPlugin as any).keywordManager = km;

      const applyArchivedTaskStylingToTaskContainer = (
        formatter as unknown as {
          applyArchivedTaskStylingToTaskContainer: (el: HTMLElement) => void;
        }
      ).applyArchivedTaskStylingToTaskContainer;

      applyArchivedTaskStylingToTaskContainer.call(formatter, taskContainer);

      const archivedContainer = taskContainer.querySelector(
        '.todoseq-archived-task-text',
      );
      expect(archivedContainer).not.toBeNull();
      expect(archivedContainer?.getAttribute('data-archived-task')).toBe(
        'true',
      );

      const wrappedKeyword = archivedContainer?.querySelector(
        '.todoseq-keyword-formatted',
      );
      expect(wrappedKeyword).not.toBeNull();
      expect(wrappedKeyword?.textContent).toBe('CANCELED');

      mockSettings.additionalArchivedKeywords = [];
      activeDocument.body.removeChild(taskContainer);
    });

    test('should not modify container without archived keyword span', () => {
      const taskContainer = activeDocument.createElement('span');
      taskContainer.className = 'todoseq-task';

      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';

      const taskText = activeDocument.createTextNode(' task text');

      taskContainer.appendChild(keywordSpan);
      taskContainer.appendChild(taskText);
      activeDocument.body.appendChild(taskContainer);

      const applyArchivedTaskStylingToTaskContainer = (
        formatter as unknown as {
          applyArchivedTaskStylingToTaskContainer: (el: HTMLElement) => void;
        }
      ).applyArchivedTaskStylingToTaskContainer;

      const originalHTML = taskContainer.innerHTML;
      applyArchivedTaskStylingToTaskContainer.call(formatter, taskContainer);

      expect(taskContainer.innerHTML).toEqual(originalHTML);

      activeDocument.body.removeChild(taskContainer);
    });
  });

  describe('processDateLines with task containers', () => {
    test('should process SCHEDULED date inside task container', () => {
      const container = activeDocument.createElement('div');
      const taskContainer = activeDocument.createElement('span');
      taskContainer.className = 'todoseq-task';
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      taskContainer.appendChild(keywordSpan);
      taskContainer.appendChild(
        activeDocument.createTextNode(' task SCHEDULED: 2024-01-01'),
      );
      container.appendChild(taskContainer);
      activeDocument.body.appendChild(container);

      const processDateLines = (
        formatter as unknown as { processDateLines: (el: HTMLElement) => void }
      ).processDateLines;

      processDateLines.call(formatter, container);

      const scheduledLine = taskContainer.querySelector(
        '.todoseq-scheduled-line',
      );
      expect(scheduledLine).not.toBeNull();

      activeDocument.body.removeChild(container);
    });
  });

  describe('processDateKeywordsInElement', () => {
    test('should process SCHEDULED keyword in generic element', () => {
      const element = activeDocument.createElement('div');
      element.appendChild(
        activeDocument.createTextNode('SCHEDULED: 2024-01-01'),
      );
      activeDocument.body.appendChild(element);

      const processDateKeywordsInElement = (
        formatter as unknown as {
          processDateKeywordsInElement: (el: HTMLElement) => void;
        }
      ).processDateKeywordsInElement;

      processDateKeywordsInElement.call(formatter, element);

      const scheduledLine = element.querySelector('.todoseq-scheduled-line');
      expect(scheduledLine).not.toBeNull();
      expect(
        element.querySelector('.todoseq-scheduled-keyword')?.textContent,
      ).toBe('SCHEDULED:');

      activeDocument.body.removeChild(element);
    });

    test('should process DEADLINE keyword in generic element', () => {
      const element = activeDocument.createElement('div');
      element.appendChild(
        activeDocument.createTextNode('DEADLINE: 2024-01-01'),
      );
      activeDocument.body.appendChild(element);

      const processDateKeywordsInElement = (
        formatter as unknown as {
          processDateKeywordsInElement: (el: HTMLElement) => void;
        }
      ).processDateKeywordsInElement;

      processDateKeywordsInElement.call(formatter, element);

      const deadlineLine = element.querySelector('.todoseq-deadline-line');
      expect(deadlineLine).not.toBeNull();

      activeDocument.body.removeChild(element);
    });

    test('should process CLOSED keyword in generic element', () => {
      const element = activeDocument.createElement('div');
      element.appendChild(activeDocument.createTextNode('CLOSED: 2024-01-01'));
      activeDocument.body.appendChild(element);

      const processDateKeywordsInElement = (
        formatter as unknown as {
          processDateKeywordsInElement: (el: HTMLElement) => void;
        }
      ).processDateKeywordsInElement;

      processDateKeywordsInElement.call(formatter, element);

      const closedLine = element.querySelector('.todoseq-closed-line');
      expect(closedLine).not.toBeNull();

      activeDocument.body.removeChild(element);
    });
  });

  describe('findDateKeywordNodeInElement', () => {
    test('should find SCHEDULED keyword node', () => {
      const element = activeDocument.createElement('div');
      const textNode = activeDocument.createTextNode(
        'prefix SCHEDULED: 2024-01-01',
      );
      element.appendChild(textNode);
      activeDocument.body.appendChild(element);

      const findDateKeywordNodeInElement = (
        formatter as unknown as {
          findDateKeywordNodeInElement: (
            el: HTMLElement,
            keyword: string,
          ) => { node: Text; index: number } | null;
        }
      ).findDateKeywordNodeInElement;

      const result = findDateKeywordNodeInElement.call(
        formatter,
        element,
        'SCHEDULED:',
      );

      expect(result).not.toBeNull();
      expect(result?.index).toBe(7);

      activeDocument.body.removeChild(element);
    });

    test('should return null when keyword not found', () => {
      const element = activeDocument.createElement('div');
      element.appendChild(activeDocument.createTextNode('no date keywords'));
      activeDocument.body.appendChild(element);

      const findDateKeywordNodeInElement = (
        formatter as unknown as {
          findDateKeywordNodeInElement: (
            el: HTMLElement,
            keyword: string,
          ) => { node: Text; index: number } | null;
        }
      ).findDateKeywordNodeInElement;

      const result = findDateKeywordNodeInElement.call(
        formatter,
        element,
        'SCHEDULED:',
      );

      expect(result).toBeNull();

      activeDocument.body.removeChild(element);
    });
  });

  describe('containsTaskKeyword - null parser', () => {
    test('should return false when parser is null', () => {
      const getTaskParserSpy = jest
        .spyOn(formatter as any, 'getTaskParser')
        .mockReturnValue(null);

      const containsTaskKeyword = (
        formatter as unknown as {
          containsTaskKeyword: (text: string) => boolean;
        }
      ).containsTaskKeyword;

      const result = containsTaskKeyword.call(formatter, 'TODO task');
      expect(result).toBe(false);

      getTaskParserSpy.mockRestore();
    });
  });

  describe('attachKeywordClickHandlers - already attached', () => {
    test('should skip elements that already have handlers attached', () => {
      const container = activeDocument.createElement('div');
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-todoseq-handlers-attached', 'true');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      activeDocument.body.appendChild(container);

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

      expect(mockPlugin.registerDomEvent).not.toHaveBeenCalled();

      activeDocument.body.removeChild(container);
    });
  });

  describe('handleKeywordKeydown - additional keys', () => {
    test('should open context menu with Shift+F10', () => {
      const container = activeDocument.createElement('div');
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      activeDocument.body.appendChild(container);

      const buildStateMenu = jest.fn().mockReturnValue({
        showAtPosition: jest.fn(),
      });
      const menuBuilder = (formatter as any).menuBuilder;
      jest
        .spyOn(menuBuilder, 'buildStateMenu')
        .mockImplementation(buildStateMenu as any);

      const handleKeywordKeydown = (
        formatter as unknown as {
          handleKeywordKeydown: (
            event: KeyboardEvent,
            el: HTMLElement,
            path: string,
          ) => void;
        }
      ).handleKeywordKeydown;

      const event = new KeyboardEvent('keydown', {
        key: 'F10',
        shiftKey: true,
      });
      Object.defineProperty(event, 'preventDefault', { value: jest.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: jest.fn() });

      handleKeywordKeydown.call(formatter, event, keywordSpan, 'test.md');

      expect(buildStateMenu).toHaveBeenCalledWith('TODO', expect.any(Function));

      activeDocument.body.removeChild(container);
    });

    test('should open context menu with ContextMenu key', () => {
      const container = activeDocument.createElement('div');
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      activeDocument.body.appendChild(container);

      const buildStateMenu = jest.fn().mockReturnValue({
        showAtPosition: jest.fn(),
      });
      const menuBuilder = (formatter as any).menuBuilder;
      jest
        .spyOn(menuBuilder, 'buildStateMenu')
        .mockImplementation(buildStateMenu as any);

      const handleKeywordKeydown = (
        formatter as unknown as {
          handleKeywordKeydown: (
            event: KeyboardEvent,
            el: HTMLElement,
            path: string,
          ) => void;
        }
      ).handleKeywordKeydown;

      const event = new KeyboardEvent('keydown', { key: 'ContextMenu' });
      Object.defineProperty(event, 'preventDefault', { value: jest.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: jest.fn() });

      handleKeywordKeydown.call(formatter, event, keywordSpan, 'test.md');

      expect(buildStateMenu).toHaveBeenCalledWith('TODO', expect.any(Function));

      activeDocument.body.removeChild(container);
    });
  });

  describe('handleKeywordContextMenu', () => {
    test('should clear pending click timeout', () => {
      const container = activeDocument.createElement('div');
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      activeDocument.body.appendChild(container);

      (formatter as any).pendingClickTimeout = 12345;
      const clearTimeoutSpy = jest.spyOn(window, 'clearTimeout');

      const mockMenu = { showAtPosition: jest.fn() };
      jest
        .spyOn((formatter as any).menuBuilder, 'buildStateMenu')
        .mockReturnValue(mockMenu);

      const handleKeywordContextMenu = (
        formatter as unknown as {
          handleKeywordContextMenu: (
            event: MouseEvent,
            el: HTMLElement,
            path: string,
          ) => void;
        }
      ).handleKeywordContextMenu;

      const event = new MouseEvent('contextmenu', {
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(event, 'preventDefault', { value: jest.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: jest.fn() });

      handleKeywordContextMenu.call(formatter, event, keywordSpan, 'test.md');

      expect(clearTimeoutSpy).toHaveBeenCalledWith(12345);
      expect((formatter as any).pendingClickTimeout).toBeNull();

      clearTimeoutSpy.mockRestore();
      activeDocument.body.removeChild(container);
    });

    test('should return early when no state attribute', () => {
      const container = activeDocument.createElement('div');
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.textContent = 'TODO';
      container.appendChild(keywordSpan);
      activeDocument.body.appendChild(container);

      const buildStateMenu = jest.fn().mockReturnValue({
        showAtPosition: jest.fn(),
      });
      const menuBuilder = (formatter as any).menuBuilder;
      jest
        .spyOn(menuBuilder, 'buildStateMenu')
        .mockImplementation(buildStateMenu as any);

      const handleKeywordContextMenu = (
        formatter as unknown as {
          handleKeywordContextMenu: (
            event: MouseEvent,
            el: HTMLElement,
            path: string,
          ) => void;
        }
      ).handleKeywordContextMenu;

      const event = new MouseEvent('contextmenu', {
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(event, 'preventDefault', { value: jest.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: jest.fn() });

      handleKeywordContextMenu.call(formatter, event, keywordSpan, 'test.md');

      expect(buildStateMenu).not.toHaveBeenCalled();

      activeDocument.body.removeChild(container);
    });
  });

  describe('updateTaskState - with coordinator', () => {
    test('should use taskUpdateCoordinator when available', async () => {
      const container = activeDocument.createElement('div');
      const p = activeDocument.createElement('p');
      const taskContainer = activeDocument.createElement('span');
      taskContainer.className = 'todoseq-task';
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      keywordSpan.textContent = 'TODO';
      taskContainer.appendChild(keywordSpan);
      taskContainer.appendChild(activeDocument.createTextNode(' task text'));
      p.appendChild(taskContainer);
      container.appendChild(p);
      activeDocument.body.appendChild(container);

      const mockTask = {
        path: 'test.md',
        line: 0,
        state: 'TODO',
        text: 'task text',
        rawText: 'TODO task text',
        indent: '',
        listMarker: '',
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

      const mockFile = new TFile('test.md');
      jest
        .spyOn(mockPlugin.app.vault, 'getAbstractFileByPath')
        .mockReturnValue(mockFile);
      jest
        .spyOn(mockPlugin.app.vault, 'read')
        .mockResolvedValue('TODO task text');
      jest.spyOn(formatter as any, 'getTaskParser').mockReturnValue({
        testRegex: /^TODO\s+(.*)$/,
        parseFile: jest.fn().mockReturnValue([mockTask]),
      });

      const updateTaskState = (
        formatter as unknown as {
          updateTaskState: (
            el: HTMLElement,
            path: string,
            state: string,
          ) => Promise<void>;
        }
      ).updateTaskState;

      await updateTaskState.call(formatter, keywordSpan, 'test.md', 'DOING');

      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskByPath,
      ).toHaveBeenCalledWith('test.md', 0, 'DOING', 'reader');

      activeDocument.body.removeChild(container);
    });
  });

  describe('handleCheckboxClick', () => {
    test('should handle checkbox-only subtask update', async () => {
      const container = activeDocument.createElement('div');
      const li = activeDocument.createElement('div');
      li.className = 'task-list-item';
      li.setAttribute('data-line', '0');
      const checkbox = activeDocument.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      checkbox.checked = true;
      li.appendChild(checkbox);
      li.appendChild(activeDocument.createTextNode('subtask text'));
      container.appendChild(li);
      activeDocument.body.appendChild(container);

      const mockFile = new TFile('test.md');
      jest
        .spyOn(mockPlugin.app.vault, 'getAbstractFileByPath')
        .mockReturnValue(mockFile);
      jest
        .spyOn(mockPlugin.app.vault, 'read')
        .mockResolvedValue('- [ ] subtask text');

      const handleCheckboxClick = (
        formatter as unknown as {
          handleCheckboxClick: (event: Event, path: string) => Promise<void>;
        }
      ).handleCheckboxClick;

      const event = new Event('click');
      Object.defineProperty(event, 'target', { value: checkbox });

      await handleCheckboxClick.call(formatter, event, 'test.md');

      expect(
        mockPlugin.taskStateManager.updateParentSubtaskCountsForCheckbox,
      ).toHaveBeenCalled();

      activeDocument.body.removeChild(container);
    });

    test('should handle task with keyword and state transition', async () => {
      const container = activeDocument.createElement('div');
      const li = activeDocument.createElement('div');
      li.className = 'task-list-item';
      li.setAttribute('data-line', '0');
      const checkbox = activeDocument.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      checkbox.checked = true;
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');
      li.appendChild(checkbox);
      li.appendChild(keywordSpan);
      li.appendChild(activeDocument.createTextNode(' task text'));
      container.appendChild(li);
      activeDocument.body.appendChild(container);

      const mockTask = {
        path: 'test.md',
        line: 0,
        state: 'TODO',
        text: 'task text',
        rawText: '- [ ] TODO task text',
        indent: '',
        listMarker: '- ',
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

      const mockFile = new TFile('test.md');
      jest
        .spyOn(mockPlugin.app.vault, 'getAbstractFileByPath')
        .mockReturnValue(mockFile);

      jest
        .spyOn(formatter as any, 'findTaskForCheckbox')
        .mockResolvedValue(mockTask);

      const handleCheckboxClick = (
        formatter as unknown as {
          handleCheckboxClick: (event: Event, path: string) => Promise<void>;
        }
      ).handleCheckboxClick;

      const event = new Event('click');
      Object.defineProperty(event, 'target', { value: checkbox });

      await handleCheckboxClick.call(formatter, event, 'test.md');

      expect(
        mockPlugin.taskUpdateCoordinator.updateTaskByPath,
      ).toHaveBeenCalled();

      activeDocument.body.removeChild(container);
    });

    test('should return early when no task list item', async () => {
      const checkbox = activeDocument.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      activeDocument.body.appendChild(checkbox);

      const handleCheckboxClick = (
        formatter as unknown as {
          handleCheckboxClick: (event: Event, path: string) => Promise<void>;
        }
      ).handleCheckboxClick;

      const event = new Event('click');
      Object.defineProperty(event, 'target', { value: checkbox });

      await handleCheckboxClick.call(formatter, event, 'test.md');

      expect(
        mockPlugin.taskStateManager.updateParentSubtaskCountsForCheckbox,
      ).not.toHaveBeenCalled();
    });
  });

  describe('attachCheckboxClickHandlers - embedded transclusion', () => {
    test('should handle embedded transclusion checkbox', () => {
      const container = activeDocument.createElement('div');
      const embed = activeDocument.createElement('div');
      embed.className = 'internal-embed';
      embed.setAttribute('src', 'other-file.md#^block1');
      const checkbox = activeDocument.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      embed.appendChild(checkbox);
      container.appendChild(embed);
      activeDocument.body.appendChild(container);

      const attachCheckboxClickHandlers = (
        formatter as unknown as {
          attachCheckboxClickHandlers: (
            element: HTMLElement,
            context: { sourcePath: string },
          ) => void;
        }
      ).attachCheckboxClickHandlers;

      attachCheckboxClickHandlers.call(formatter, container, {
        sourcePath: 'test.md',
      });

      expect(mockPlugin.registerDomEvent).toHaveBeenCalledWith(
        checkbox,
        'click',
        expect.any(Function),
      );

      activeDocument.body.removeChild(container);
    });
  });

  describe('findTaskForKeyword - additional paths', () => {
    test('should create minimal task when no parsed task found at line', async () => {
      const container = activeDocument.createElement('div');
      const p = activeDocument.createElement('p');
      const taskContainer = activeDocument.createElement('span');
      taskContainer.className = 'todoseq-task';
      const keyword = activeDocument.createElement('span');
      keyword.className = 'todoseq-keyword-formatted';
      keyword.setAttribute('data-task-keyword', 'TODO');
      keyword.textContent = 'TODO';
      taskContainer.appendChild(keyword);
      taskContainer.appendChild(
        activeDocument.createTextNode(' unique task text'),
      );
      const li = activeDocument.createElement('li');
      li.setAttribute('data-line', '0');
      li.appendChild(taskContainer);
      p.appendChild(li);
      container.appendChild(p);
      activeDocument.body.appendChild(container);

      const mockFile = new TFile('test.md');
      jest
        .spyOn(mockPlugin.app.vault, 'getAbstractFileByPath')
        .mockReturnValue(mockFile);
      jest
        .spyOn(mockPlugin.app.vault, 'read')
        .mockResolvedValue('TODO unique task text');
      jest.spyOn(formatter as any, 'getTaskParser').mockReturnValue({
        testRegex: /^TODO\s+(.*)$/,
        parseFile: jest.fn().mockReturnValue([]),
      });

      const findTaskForKeyword = (
        formatter as unknown as {
          findTaskForKeyword: (el: HTMLElement, path: string) => Promise<any>;
        }
      ).findTaskForKeyword;

      const task = await findTaskForKeyword.call(formatter, keyword, 'test.md');

      expect(task).not.toBeNull();
      expect(task.path).toBe('test.md');
      expect(task.line).toBe(0);
      expect(task.state).toBe('TODO');

      activeDocument.body.removeChild(container);
    });

    test('should return null when keyword element has no data-task-keyword', async () => {
      const keyword = activeDocument.createElement('span');
      keyword.className = 'todoseq-keyword-formatted';

      const findTaskForKeyword = (
        formatter as unknown as {
          findTaskForKeyword: (el: HTMLElement, path: string) => Promise<any>;
        }
      ).findTaskForKeyword;

      const task = await findTaskForKeyword.call(formatter, keyword, 'test.md');

      expect(task).toBeNull();
    });
  });

  describe('cleanup - with pending timeout', () => {
    test('should clear pending click timeout', () => {
      (formatter as any).pendingClickTimeout = 99999;
      const clearTimeoutSpy = jest.spyOn(window, 'clearTimeout');

      formatter.cleanup();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(99999);
      expect((formatter as any).pendingClickTimeout).toBeNull();

      clearTimeoutSpy.mockRestore();
    });
  });

  describe('processPriorityPills - embedded and callout skips', () => {
    test('should skip priority pills in embedded task list containers', () => {
      const container = activeDocument.createElement('div');
      const embedded = activeDocument.createElement('div');
      embedded.className = 'todoseq-embedded-task-list-container';
      const taskItem = activeDocument.createElement('div');
      taskItem.className = 'task-list-item';
      taskItem.textContent = 'TODO task [#A]';
      embedded.appendChild(taskItem);
      container.appendChild(embedded);
      activeDocument.body.appendChild(container);

      const processPriorityPills = (
        formatter as unknown as {
          processPriorityPills: (el: HTMLElement) => void;
        }
      ).processPriorityPills;

      processPriorityPills.call(formatter, container);

      expect(taskItem.querySelector('.todoseq-priority-badge')).toBeNull();

      activeDocument.body.removeChild(container);
    });

    test('should skip priority pills in callout when disabled', () => {
      mockPlugin.settings.includeCalloutBlocks = false;
      const container = activeDocument.createElement('div');
      const callout = activeDocument.createElement('div');
      callout.className = 'callout';
      const taskItem = activeDocument.createElement('div');
      taskItem.className = 'task-list-item';
      taskItem.textContent = 'TODO task [#A]';
      callout.appendChild(taskItem);
      container.appendChild(callout);
      activeDocument.body.appendChild(container);

      const processPriorityPills = (
        formatter as unknown as {
          processPriorityPills: (el: HTMLElement) => void;
        }
      ).processPriorityPills;

      processPriorityPills.call(formatter, container);

      expect(taskItem.querySelector('.todoseq-priority-badge')).toBeNull();

      mockPlugin.settings.includeCalloutBlocks = true;
      activeDocument.body.removeChild(container);
    });

    test('should process priority pills in paragraphs with task keywords', () => {
      const container = activeDocument.createElement('div');
      const p = activeDocument.createElement('p');
      p.textContent = 'TODO task with priority [#A]';
      container.appendChild(p);
      activeDocument.body.appendChild(container);

      const processPriorityPills = (
        formatter as unknown as {
          processPriorityPills: (el: HTMLElement) => void;
        }
      ).processPriorityPills;

      processPriorityPills.call(formatter, container);

      const pill = p.querySelector('.todoseq-priority-badge');
      expect(pill).not.toBeNull();
      expect(pill?.textContent).toBe('A');

      activeDocument.body.removeChild(container);
    });

    test('should skip priority pills in paragraphs without task keywords', () => {
      const container = activeDocument.createElement('div');
      const p = activeDocument.createElement('p');
      p.textContent = 'Regular text with priority [#A]';
      container.appendChild(p);
      activeDocument.body.appendChild(container);

      const processPriorityPills = (
        formatter as unknown as {
          processPriorityPills: (el: HTMLElement) => void;
        }
      ).processPriorityPills;

      processPriorityPills.call(formatter, container);

      expect(p.querySelector('.todoseq-priority-badge')).toBeNull();

      activeDocument.body.removeChild(container);
    });
  });

  describe('registerPostProcessor - end-to-end', () => {
    test('should register callback and format tasks through full pipeline', () => {
      formatter.registerPostProcessor();

      expect(mockPlugin.registerMarkdownPostProcessor).toHaveBeenCalledTimes(1);

      const callback =
        mockPlugin.registerMarkdownPostProcessor.mock.calls[0][0];

      const element = activeDocument.createElement('div');
      const p = activeDocument.createElement('p');
      p.textContent = 'TODO full pipeline task';
      element.appendChild(p);
      activeDocument.body.appendChild(element);

      callback(element, { sourcePath: 'test.md' });

      const keywordSpan = element.querySelector('.todoseq-keyword-formatted');
      expect(keywordSpan).not.toBeNull();
      expect(keywordSpan?.getAttribute('data-task-keyword')).toBe('TODO');

      activeDocument.body.removeChild(element);
    });

    test('should skip processing when formatTaskKeywords is disabled', () => {
      mockPlugin.settings.formatTaskKeywords = false;
      formatter.registerPostProcessor();

      const callback =
        mockPlugin.registerMarkdownPostProcessor.mock.calls[
          mockPlugin.registerMarkdownPostProcessor.mock.calls.length - 1
        ][0];

      const element = activeDocument.createElement('div');
      const p = activeDocument.createElement('p');
      p.textContent = 'TODO disabled task';
      element.appendChild(p);
      activeDocument.body.appendChild(element);

      callback(element, { sourcePath: 'test.md' });

      expect(element.querySelector('.todoseq-keyword-formatted')).toBeNull();

      mockPlugin.settings.formatTaskKeywords = true;
      activeDocument.body.removeChild(element);
    });
  });

  describe('findTaskForCheckbox', () => {
    test('should find a task for a checkbox in task list item', async () => {
      const container = activeDocument.createElement('div');
      const taskListItem = activeDocument.createElement('div');
      taskListItem.className = 'task-list-item';
      const checkbox = activeDocument.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      const taskText = activeDocument.createTextNode('Test task');
      taskListItem.appendChild(checkbox);
      taskListItem.appendChild(taskText);
      container.appendChild(taskListItem);
      activeDocument.body.appendChild(container);

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

      activeDocument.body.removeChild(container);
    });

    test('should return null if no task list item found', async () => {
      const container = activeDocument.createElement('div');
      const checkbox = activeDocument.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'task-list-item-checkbox';
      container.appendChild(checkbox);
      activeDocument.body.appendChild(container);

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
        activeDocument.createElement('div'),
        mockFile,
      );

      expect(task).toBeNull();

      activeDocument.body.removeChild(container);
    });
  });

  describe('processLineText - styling branches', () => {
    test('should apply completed styling for completed keyword in line', () => {
      const paragraph = activeDocument.createElement('p');
      paragraph.appendChild(
        activeDocument.createTextNode('DONE completed task'),
      );

      const processLineText = (
        formatter as unknown as {
          processLineText: (
            paragraph: HTMLElement,
            lineText: string,
            lineNodes: Node[],
          ) => void;
        }
      ).processLineText;

      processLineText.call(formatter, paragraph, 'DONE completed task', [
        ...Array.from(paragraph.childNodes),
      ]);

      const taskContainer = paragraph.querySelector('.todoseq-task');
      expect(taskContainer).not.toBeNull();

      const completedContainer = paragraph.querySelector(
        '.todoseq-completed-task-text',
      );
      expect(completedContainer).not.toBeNull();
    });

    test('should apply archived styling for archived keyword in line', () => {
      mockSettings.additionalArchivedKeywords = ['CANCELED'];
      const km = createTestKeywordManager(mockSettings);
      (mockPlugin as any).keywordManager = km;

      const wrapper = activeDocument.createElement('div');
      const paragraph = activeDocument.createElement('p');
      paragraph.appendChild(
        activeDocument.createTextNode('CANCELED archived task'),
      );
      wrapper.appendChild(paragraph);
      activeDocument.body.appendChild(wrapper);

      const processLineText = (
        formatter as unknown as {
          processLineText: (
            paragraph: HTMLElement,
            lineText: string,
            lineNodes: Node[],
          ) => void;
        }
      ).processLineText;

      processLineText.call(formatter, paragraph, 'CANCELED archived task', [
        ...Array.from(paragraph.childNodes),
      ]);

      const archivedContainer = paragraph.querySelector(
        '.todoseq-archived-task-text',
      );
      expect(archivedContainer).not.toBeNull();

      mockSettings.additionalArchivedKeywords = [];
      activeDocument.body.removeChild(wrapper);
    });
  });

  describe('replaceKeywordInTextNodesAndBuildTask - edge cases', () => {
    test('should handle keyword at start of text', () => {
      const nodes: Node[] = [activeDocument.createTextNode('TODO task text')];
      const taskContainer = activeDocument.createElement('span');
      taskContainer.className = 'todoseq-task';
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');

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
        nodes,
        'TODO',
        keywordSpan,
        taskContainer,
      );

      expect(
        taskContainer.querySelector('.todoseq-keyword-formatted'),
      ).not.toBeNull();
      expect(taskContainer.textContent).toContain('task text');
      expect(taskContainer.childNodes[0]?.nodeType).toBe(Node.ELEMENT_NODE);
    });

    test('should handle keyword at end of text', () => {
      const nodes: Node[] = [activeDocument.createTextNode('task text TODO')];
      const taskContainer = activeDocument.createElement('span');
      taskContainer.className = 'todoseq-task';
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'TODO');

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
        nodes,
        'TODO',
        keywordSpan,
        taskContainer,
      );

      expect(
        taskContainer.querySelector('.todoseq-keyword-formatted'),
      ).not.toBeNull();
      expect(taskContainer.textContent).toContain('task text');
    });
  });

  describe('processTaskListItemDirectly - null parser', () => {
    test('should return early when parser is null', () => {
      const li = activeDocument.createElement('li');
      li.className = 'task-list-item';
      li.appendChild(activeDocument.createTextNode('TODO task'));
      activeDocument.body.appendChild(li);

      const getTaskParserSpy = jest
        .spyOn(formatter as any, 'getTaskParser')
        .mockReturnValue(null);

      const processTaskListItemDirectly = (
        formatter as unknown as {
          processTaskListItemDirectly: (el: HTMLElement) => void;
        }
      ).processTaskListItemDirectly;

      processTaskListItemDirectly.call(formatter, li);

      expect(li.querySelector('.todoseq-keyword-formatted')).toBeNull();

      getTaskParserSpy.mockRestore();
      activeDocument.body.removeChild(li);
    });
  });

  describe('processListItemDirectly - null parser', () => {
    test('should return early when parser is null', () => {
      const li = activeDocument.createElement('li');
      li.appendChild(activeDocument.createTextNode('TODO task'));
      activeDocument.body.appendChild(li);

      const getTaskParserSpy = jest
        .spyOn(formatter as any, 'getTaskParser')
        .mockReturnValue(null);

      const processListItemDirectly = (
        formatter as unknown as {
          processListItemDirectly: (el: HTMLElement) => void;
        }
      ).processListItemDirectly;

      processListItemDirectly.call(formatter, li);

      expect(li.querySelector('.todoseq-keyword-formatted')).toBeNull();

      getTaskParserSpy.mockRestore();
      activeDocument.body.removeChild(li);
    });
  });

  describe('processParagraphByChildNodes - element nodes', () => {
    test('should process paragraph containing element nodes with task text', () => {
      const paragraph = activeDocument.createElement('p');
      const bold = activeDocument.createElement('strong');
      bold.textContent = 'TODO';
      paragraph.appendChild(bold);
      paragraph.appendChild(activeDocument.createTextNode(' task text'));
      activeDocument.body.appendChild(paragraph);

      const processParagraphByChildNodes = (
        formatter as unknown as {
          processParagraphByChildNodes: (el: HTMLElement) => void;
        }
      ).processParagraphByChildNodes;

      processParagraphByChildNodes.call(formatter, paragraph);

      const taskContainer = paragraph.querySelector('.todoseq-task');
      expect(taskContainer).not.toBeNull();

      activeDocument.body.removeChild(paragraph);
    });
  });

  describe('applyCompletedTaskStylingToTaskContainer - keyword not direct child', () => {
    test('should not wrap when keyword span parent is not the task container', () => {
      const taskContainer = activeDocument.createElement('span');
      taskContainer.className = 'todoseq-task';

      const innerSpan = activeDocument.createElement('span');
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';
      keywordSpan.setAttribute('data-task-keyword', 'DONE');
      keywordSpan.textContent = 'DONE';
      innerSpan.appendChild(keywordSpan);

      taskContainer.appendChild(innerSpan);
      taskContainer.appendChild(activeDocument.createTextNode(' task text'));
      activeDocument.body.appendChild(taskContainer);

      const applyCompletedTaskStylingToTaskContainer = (
        formatter as unknown as {
          applyCompletedTaskStylingToTaskContainer: (
            container: HTMLElement,
            keyword: string,
          ) => void;
        }
      ).applyCompletedTaskStylingToTaskContainer;

      const originalHTML = taskContainer.innerHTML;
      applyCompletedTaskStylingToTaskContainer.call(
        formatter,
        taskContainer,
        'DONE',
      );

      expect(taskContainer.innerHTML).toEqual(originalHTML);

      activeDocument.body.removeChild(taskContainer);
    });
  });

  describe('hasTaskBeforeDateInParagraph - element node with date', () => {
    test('should detect task before date keyword in element node', () => {
      const paragraph = activeDocument.createElement('p');
      const span = activeDocument.createElement('span');
      span.textContent = 'TODO task SCHEDULED: 2024-01-01';
      paragraph.appendChild(span);
      activeDocument.body.appendChild(paragraph);

      const hasTaskBeforeDateInParagraph = (
        formatter as unknown as {
          hasTaskBeforeDateInParagraph: (p: HTMLParagraphElement) => boolean;
        }
      ).hasTaskBeforeDateInParagraph;

      const result = hasTaskBeforeDateInParagraph.call(formatter, paragraph);
      expect(result).toBe(true);

      activeDocument.body.removeChild(paragraph);
    });

    test('should check previous sibling when paragraph only has date text', () => {
      const container = activeDocument.createElement('div');
      const prevP = activeDocument.createElement('p');
      prevP.textContent = 'TODO something';
      const dateP = activeDocument.createElement('p');
      dateP.textContent = 'SCHEDULED: 2024-01-01';
      container.appendChild(prevP);
      container.appendChild(dateP);
      activeDocument.body.appendChild(container);

      const hasTaskBeforeDateInParagraph = (
        formatter as unknown as {
          hasTaskBeforeDateInParagraph: (p: HTMLParagraphElement) => boolean;
        }
      ).hasTaskBeforeDateInParagraph;

      const result = hasTaskBeforeDateInParagraph.call(formatter, dateP);
      expect(result).toBe(true);

      activeDocument.body.removeChild(container);
    });
  });

  describe('handleKeywordKeydown - no state attribute', () => {
    test('should return early for Shift+F10 without state attribute', () => {
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';

      const buildStateMenu = jest.fn().mockReturnValue({
        showAtPosition: jest.fn(),
      });
      jest
        .spyOn((formatter as any).menuBuilder, 'buildStateMenu')
        .mockImplementation(buildStateMenu as any);

      const handleKeywordKeydown = (
        formatter as unknown as {
          handleKeywordKeydown: (
            event: KeyboardEvent,
            el: HTMLElement,
            path: string,
          ) => void;
        }
      ).handleKeywordKeydown;

      const event = new KeyboardEvent('keydown', {
        key: 'F10',
        shiftKey: true,
      });
      Object.defineProperty(event, 'preventDefault', { value: jest.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: jest.fn() });

      handleKeywordKeydown.call(formatter, event, keywordSpan, 'test.md');

      expect(buildStateMenu).not.toHaveBeenCalled();
    });

    test('should return early for ContextMenu key without state attribute', () => {
      const keywordSpan = activeDocument.createElement('span');
      keywordSpan.className = 'todoseq-keyword-formatted';

      const buildStateMenu = jest.fn().mockReturnValue({
        showAtPosition: jest.fn(),
      });
      jest
        .spyOn((formatter as any).menuBuilder, 'buildStateMenu')
        .mockImplementation(buildStateMenu as any);

      const handleKeywordKeydown = (
        formatter as unknown as {
          handleKeywordKeydown: (
            event: KeyboardEvent,
            el: HTMLElement,
            path: string,
          ) => void;
        }
      ).handleKeywordKeydown;

      const event = new KeyboardEvent('keydown', { key: 'ContextMenu' });
      Object.defineProperty(event, 'preventDefault', { value: jest.fn() });
      Object.defineProperty(event, 'stopPropagation', { value: jest.fn() });

      handleKeywordKeydown.call(formatter, event, keywordSpan, 'test.md');

      expect(buildStateMenu).not.toHaveBeenCalled();
    });
  });

  describe('findTaskForCheckbox - null parser', () => {
    test('should return null when parser is null', async () => {
      const mockFile = new TFile('test.md');
      jest.spyOn(mockPlugin.app.vault, 'read').mockResolvedValue('- [ ] test');
      jest.spyOn(formatter as any, 'getTaskParser').mockReturnValue(null);

      const findTaskForCheckbox = (
        formatter as unknown as {
          findTaskForCheckbox: (
            taskListItem: Element,
            file: any,
          ) => Promise<any>;
        }
      ).findTaskForCheckbox;

      const taskListItem = activeDocument.createElement('div');
      taskListItem.textContent = 'test';

      const result = await findTaskForCheckbox.call(
        formatter,
        taskListItem,
        mockFile,
      );

      expect(result).toBeNull();
    });
  });
});
