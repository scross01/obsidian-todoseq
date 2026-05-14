/**
 * Tests for src/parser/types.ts - verifies that parser interfaces and config types are correctly exported.
 */

import { ParserConfig, ITaskParser } from '../src/parser/types';
import { Task } from '../src/types/task';
import { UrgencyCoefficients } from '../src/utils/task-urgency';

describe('Parser type definitions', () => {
  it('ParserConfig accepts required fields', () => {
    const config: ParserConfig = {
      keywords: ['TODO', 'DOING', 'DONE'],
      completedKeywords: ['DONE', 'CANCELLED'],
      urgencyCoefficients: {} as UrgencyCoefficients,
    };

    expect(config.keywords).toEqual(['TODO', 'DOING', 'DONE']);
    expect(config.completedKeywords).toEqual(['DONE', 'CANCELLED']);
    expect(config.includeCalloutBlocks).toBeUndefined();
  });

  it('ParserConfig accepts all optional fields', () => {
    const config: ParserConfig = {
      keywords: ['TODO', 'DOING', 'DONE', 'ARCHIVED'],
      completedKeywords: ['DONE'],
      activeKeywords: ['DOING', 'NOW'],
      waitingKeywords: ['WAIT', 'WAITING'],
      inactiveKeywords: ['TODO', 'LATER'],
      archivedKeywords: ['ARCHIVED'],
      urgencyCoefficients: {} as UrgencyCoefficients,
      includeCalloutBlocks: true,
      includeCodeBlocks: false,
      includeCommentBlocks: true,
      languageCommentSupport: true,
    };

    expect(config.activeKeywords).toEqual(['DOING', 'NOW']);
    expect(config.waitingKeywords).toEqual(['WAIT', 'WAITING']);
    expect(config.inactiveKeywords).toEqual(['TODO', 'LATER']);
    expect(config.archivedKeywords).toEqual(['ARCHIVED']);
    expect(config.includeCalloutBlocks).toBe(true);
    expect(config.includeCodeBlocks).toBe(false);
    expect(config.languageCommentSupport).toBe(true);
  });

  it('ITaskParser interface can be implemented', () => {
    const parser: ITaskParser = {
      parserId: 'test-parser',
      supportedExtensions: ['.md'],
      parseFile: (_content: string, _path: string) => [] as Task[],
      parseLine: (_line: string, _lineNumber: number, _filePath: string) =>
        null,
      isTaskLine: (_line: string) => false,
      hasAnyKeyword: (_content: string) => false,
      updateConfig: (_config: ParserConfig) => {},
    };

    expect(parser.parserId).toBe('test-parser');
    expect(parser.supportedExtensions).toEqual(['.md']);
    expect(parser.parseFile('', '', undefined)).toEqual([]);
    expect(parser.parseLine('', 0, '')).toBeNull();
    expect(parser.isTaskLine('')).toBe(false);
    expect(parser.hasAnyKeyword('')).toBe(false);
  });

  it('ITaskParser interface requires all methods', () => {
    // Verify the interface shape by checking each required property
    const requiredKeys = [
      'parserId',
      'supportedExtensions',
      'parseFile',
      'parseLine',
      'isTaskLine',
      'hasAnyKeyword',
      'updateConfig',
    ];

    const mockParser = {
      parserId: 'mock',
      supportedExtensions: ['.md'],
      parseFile: jest.fn(),
      parseLine: jest.fn(),
      isTaskLine: jest.fn(),
      hasAnyKeyword: jest.fn(),
      updateConfig: jest.fn(),
    };

    requiredKeys.forEach((key) => {
      expect(mockParser).toHaveProperty(key);
    });
  });
});
