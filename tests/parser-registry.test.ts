/**
 * Unit tests for ParserRegistry.
 * Tests parser registration and lookup functionality.
 */

import { ParserRegistry } from '../src/parser/parser-registry';
import { ITaskParser, ParserConfig } from '../src/parser/types';
import { Task } from '../src/types/task';

// Mock parser for testing
class MockParser implements ITaskParser {
  readonly parserId: string;
  readonly supportedExtensions: string[];

  constructor(parserId: string, extensions: string[]) {
    this.parserId = parserId;
    this.supportedExtensions = extensions;
  }

  parseFile(content: string, path: string, file?: any): Task[] {
    return [];
  }

  parseLine(line: string, lineNumber: number, filePath: string): Task | null {
    return null;
  }

  isTaskLine(line: string): boolean {
    return false;
  }

  updateConfig(config: ParserConfig): void {
    // Mock implementation
  }
}

describe('ParserRegistry', () => {
  let registry: ParserRegistry;

  beforeEach(() => {
    registry = new ParserRegistry();
  });

  describe('register', () => {
    it('should register a parser', () => {
      const parser = new MockParser('test', ['.test']);
      registry.register(parser);

      expect(registry.getParser('test')).toBe(parser);
    });

    it('should map extensions to parser', () => {
      const parser = new MockParser('test', ['.test', '.tst']);
      registry.register(parser);

      expect(registry.getParserForExtension('.test')).toBe(parser);
      expect(registry.getParserForExtension('.tst')).toBe(parser);
    });

    it('should handle extensions without leading dot', () => {
      const parser = new MockParser('test', ['.test']);
      registry.register(parser);

      expect(registry.getParserForExtension('test')).toBe(parser);
    });

    it('should normalize extension case', () => {
      const parser = new MockParser('test', ['.test']);
      registry.register(parser);

      expect(registry.getParserForExtension('.TEST')).toBe(parser);
      expect(registry.getParserForExtension('Test')).toBe(parser);
    });

    it('should warn when overwriting extension mapping', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const parser1 = new MockParser('test1', ['.test']);
      const parser2 = new MockParser('test2', ['.test']);

      registry.register(parser1);
      registry.register(parser2);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Extension ".test" already registered'),
      );

      consoleSpy.mockRestore();
    });

    it('should overwrite extension mapping when registering new parser', () => {
      const parser1 = new MockParser('test1', ['.test']);
      const parser2 = new MockParser('test2', ['.test']);

      registry.register(parser1);
      registry.register(parser2);

      expect(registry.getParserForExtension('.test')).toBe(parser2);
    });
  });

  describe('getParser', () => {
    it('should return parser by ID', () => {
      const parser = new MockParser('test', ['.test']);
      registry.register(parser);

      expect(registry.getParser('test')).toBe(parser);
    });

    it('should return null for unknown ID', () => {
      expect(registry.getParser('unknown')).toBeNull();
    });
  });

  describe('getParserForExtension', () => {
    it('should return parser for extension', () => {
      const parser = new MockParser('test', ['.test']);
      registry.register(parser);

      expect(registry.getParserForExtension('.test')).toBe(parser);
    });

    it('should return null for unknown extension', () => {
      expect(registry.getParserForExtension('.unknown')).toBeNull();
    });
  });

  describe('getAllParsers', () => {
    it('should return all registered parsers', () => {
      const parser1 = new MockParser('test1', ['.test1']);
      const parser2 = new MockParser('test2', ['.test2']);

      registry.register(parser1);
      registry.register(parser2);

      const parsers = registry.getAllParsers();
      expect(parsers).toHaveLength(2);
      expect(parsers).toContain(parser1);
      expect(parsers).toContain(parser2);
    });

    it('should return empty array when no parsers registered', () => {
      expect(registry.getAllParsers()).toHaveLength(0);
    });
  });

  describe('hasParserForExtension', () => {
    it('should return true for registered extension', () => {
      const parser = new MockParser('test', ['.test']);
      registry.register(parser);

      expect(registry.hasParserForExtension('.test')).toBe(true);
    });

    it('should return false for unknown extension', () => {
      expect(registry.hasParserForExtension('.unknown')).toBe(false);
    });
  });

  describe('getSupportedExtensions', () => {
    it('should return all supported extensions', () => {
      const parser1 = new MockParser('test1', ['.test1', '.tst1']);
      const parser2 = new MockParser('test2', ['.test2']);

      registry.register(parser1);
      registry.register(parser2);

      const extensions = registry.getSupportedExtensions();
      expect(extensions).toContain('.test1');
      expect(extensions).toContain('.tst1');
      expect(extensions).toContain('.test2');
    });

    it('should return empty array when no parsers registered', () => {
      expect(registry.getSupportedExtensions()).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should clear all registered parsers', () => {
      const parser = new MockParser('test', ['.test']);
      registry.register(parser);

      registry.clear();

      expect(registry.getAllParsers()).toHaveLength(0);
      expect(registry.getSupportedExtensions()).toHaveLength(0);
      expect(registry.getParser('test')).toBeNull();
      expect(registry.getParserForExtension('.test')).toBeNull();
    });
  });
});
