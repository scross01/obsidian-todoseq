import {
  CodeCommentTaskParser,
  SUPPORTED_EXTENSIONS,
} from '../src/parser/code-comment-task-parser';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

const defaultSettings = createBaseSettings();
const defaultKeywordManager = createTestKeywordManager(defaultSettings);

describe('CodeCommentTaskParser', () => {
  let parser: CodeCommentTaskParser;

  beforeEach(() => {
    parser = CodeCommentTaskParser.create(defaultKeywordManager);
  });

  describe('parserId and supportedExtensions', () => {
    it('should have correct parser ID', () => {
      expect(parser.parserId).toBe('code-comment');
    });

    it('should support .js extension', () => {
      expect(parser.supportedExtensions).toContain('.js');
    });

    it('should support .ts extension', () => {
      expect(parser.supportedExtensions).toContain('.ts');
    });

    it('should support .py extension', () => {
      expect(parser.supportedExtensions).toContain('.py');
    });
  });

  describe('hasAnyKeyword', () => {
    it('should detect keyword in content', () => {
      expect(parser.hasAnyKeyword('// TODO: test')).toBe(true);
    });

    it('should return false for content without keywords', () => {
      expect(parser.hasAnyKeyword('// just a comment')).toBe(false);
    });
  });

  describe('isTaskLine', () => {
    it('should match // TODO comment', () => {
      expect(parser.isTaskLine('// TODO: fix this bug')).toBe(true);
    });

    it('should not match code without comment', () => {
      expect(parser.isTaskLine('const x = 1;')).toBe(false);
    });

    it('should not match plain comment without keyword', () => {
      expect(parser.isTaskLine('// just a description')).toBe(false);
    });
  });

  describe('parseLine', () => {
    it('should parse // TODO task in JS file', () => {
      const task = parser.parseLine('// TODO: fix this bug', 0, 'test.js');
      expect(task).not.toBeNull();
      expect(task?.state).toBe('TODO');
      expect(task?.text).toBe(': fix this bug');
      expect(task?.completed).toBe(false);
      expect(task?.line).toBe(0);
      expect(task?.path).toBe('test.js');
    });

    it('should parse # TODO task in Python file', () => {
      const task = parser.parseLine('# TODO: implement feature', 3, 'test.py');
      expect(task).not.toBeNull();
      expect(task?.state).toBe('TODO');
      expect(task?.text).toBe(': implement feature');
      expect(task?.line).toBe(3);
    });

    it('should return null for non-comment line', () => {
      const task = parser.parseLine('const x = 1;', 0, 'test.js');
      expect(task).toBeNull();
    });

    it('should return null for comment without keyword', () => {
      const task = parser.parseLine('// just a comment', 0, 'test.js');
      expect(task).toBeNull();
    });

    it('should not detect keyword inside string literal', () => {
      const task = parser.parseLine(
        'const x = "TODO: not a task";',
        0,
        'test.js',
      );
      expect(task).toBeNull();
    });

    it('should handle mixed code and comment', () => {
      const task = parser.parseLine(
        'const x = 1; // TODO: fix this',
        0,
        'test.js',
      );
      expect(task).not.toBeNull();
      expect(task?.state).toBe('TODO');
      expect(task?.text).toBe(': fix this');
    });

    it('should handle indent before comment', () => {
      const task = parser.parseLine('    // TODO: indented task', 0, 'test.js');
      expect(task).not.toBeNull();
      expect(task?.state).toBe('TODO');
      expect(task?.indent).toBe('    // ');
    });
  });

  describe('parseFile', () => {
    it('should parse multiple tasks in a file', () => {
      const content = [
        '#!/usr/bin/env node',
        '// TODO: first task',
        'const x = 1;',
        '// DOING: second task',
        '// DONE: completed task',
      ].join('\n');

      const tasks = parser.parseFile(content, 'test.js');
      expect(tasks).toHaveLength(3);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe(': first task');
      expect(tasks[1].state).toBe('DOING');
      expect(tasks[2].state).toBe('DONE');
    });

    it('should skip empty content', () => {
      const tasks = parser.parseFile('', 'test.js');
      expect(tasks).toHaveLength(0);
    });

    it('should skip content without keywords', () => {
      const content = ['const x = 1;', 'const y = 2;'].join('\n');
      const tasks = parser.parseFile(content, 'test.js');
      expect(tasks).toHaveLength(0);
    });

    it('should skip keywords inside string literals', () => {
      const content = [
        'const msg = "TODO: not a task";',
        '// TODO: actual task',
        "const msg2 = 'TODO: also not a task';",
      ].join('\n');

      const tasks = parser.parseFile(content, 'test.js');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].text).toBe(': actual task');
    });

    it('should handle Python-style comments', () => {
      const content = [
        '# TODO: implement feature',
        'def foo():',
        '    pass',
        '# DONE: implemented',
      ].join('\n');

      const tasks = parser.parseFile(content, 'test.py');
      expect(tasks).toHaveLength(2);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[1].state).toBe('DONE');
    });

    it('should handle shell-style comments', () => {
      const content = [
        '#!/bin/bash',
        '# TODO: add error handling',
        'echo "hello"',
        '# DOING: testing',
      ].join('\n');

      const tasks = parser.parseFile(content, 'test.sh');
      expect(tasks).toHaveLength(2);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[1].state).toBe('DOING');
    });

    it('should handle SQL-style comments', () => {
      const content = [
        'SELECT * FROM users;',
        '-- TODO: add WHERE clause',
        '-- DOING: optimizing query',
      ].join('\n');

      const tasks = parser.parseFile(content, 'test.sql');
      expect(tasks).toHaveLength(2);
    });
  });

  describe('parseFile with string literal filtering', () => {
    it('should skip keywords in JS template literals', () => {
      const content = [
        'const msg = `TODO: not a task`;',
        '// TODO: real task',
      ].join('\n');

      const tasks = parser.parseFile(content, 'test.js');
      expect(tasks).toHaveLength(1);
    });

    it('should skip keywords in Python triple-quoted strings', () => {
      const content = [
        '"""',
        'TODO: not a task',
        '"""',
        '# TODO: real task',
      ].join('\n');

      const tasks = parser.parseFile(content, 'test.py');
      expect(tasks).toHaveLength(1);
    });

    it('should handle keywords in mixed string+comment line', () => {
      const content = [
        'x = "string with TODO"; // TODO: real task on same line',
      ].join('\n');

      const tasks = parser.parseFile(content, 'test.js');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].text).toBe(': real task on same line');
    });
  });

  describe('parseFile with multi-line comments', () => {
    it('should detect keyword inside /* */ block comment', () => {
      const content = ['/*', ' * TODO: task inside block comment', ' */'].join(
        '\n',
      );

      const tasks = parser.parseFile(content, 'test.js');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].state).toBe('TODO');
    });

    it('should detect keyword on /* */ start line', () => {
      const content = ['/* TODO: task on start line */'].join('\n');

      const tasks = parser.parseFile(content, 'test.js');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].state).toBe('TODO');
    });

    it('should detect keyword on multi-line comment end line', () => {
      const content = [
        '/*',
        ' * some description',
        ' * TODO: task before closing */',
        ' */',
      ].join('\n');

      const tasks = parser.parseFile(content, 'test.js');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].state).toBe('TODO');
    });
  });

  describe('word-boundary keyword matching', () => {
    it('should not match TODO when it appears as substring TODOLIST', () => {
      const task = parser.parseLine(
        '// TODOLIST: this should not match',
        0,
        'test.js',
      );
      expect(task).toBeNull();
    });

    it('should match standalone TODO in comment', () => {
      const task = parser.parseLine('// TODO: this should match', 0, 'test.js');
      expect(task).not.toBeNull();
      expect(task?.state).toBe('TODO');
    });

    it('should not match when keyword is part of a larger word with suffix', () => {
      const task = parser.parseLine(
        '// NOTTODO: test with suffix',
        0,
        'test.js',
      );
      expect(task).toBeNull();
    });

    it('should not match keyword inside string literal within multi-line block comment', () => {
      const content = [
        '/*',
        ' * const msg = "TODO: not a task";',
        ' * TODO: actual task inside block comment',
        ' */',
      ].join('\n');

      const tasks = parser.parseFile(content, 'test.js');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].text).toBe(': actual task inside block comment');
    });

    it('should match keyword at start of comment text after comment delimiter', () => {
      const task = parser.parseLine('// TODO: start of text', 0, 'test.js');
      expect(task).not.toBeNull();
      expect(task?.state).toBe('TODO');
    });

    it('should not match lowercase keyword in comment', () => {
      const task = parser.parseLine('// todo: this is lowercase', 0, 'test.js');
      expect(task).toBeNull();
    });
  });

  describe('isTaskLine with non-C-style comments', () => {
    it('should match Python # comment', () => {
      expect(parser.isTaskLine('# TODO: python task')).toBe(true);
    });

    it('should match SQL -- comment', () => {
      expect(parser.isTaskLine('-- TODO: sql task')).toBe(true);
    });

    it('should match INI ; comment', () => {
      expect(parser.isTaskLine('; TODO: ini task')).toBe(true);
    });

    it('should not match bare keyword without comment prefix', () => {
      expect(parser.isTaskLine('const TODO = 1;')).toBe(false);
    });

    it('should not match lowercase TODO in comment', () => {
      expect(parser.isTaskLine('// todo: lowercase task')).toBe(false);
    });
  });

  describe('hasAnyKeyword with large content', () => {
    it('should return true for oversized content (>500KB)', () => {
      const largeContent = 'x'.repeat(600000);
      expect(parser.hasAnyKeyword(largeContent)).toBe(true);
    });

    it('should return false for small content without keywords', () => {
      expect(parser.hasAnyKeyword('// just a comment')).toBe(false);
    });

    it('should return false for lowercase keyword', () => {
      expect(parser.hasAnyKeyword('// todo: lowercase')).toBe(false);
    });
  });

  describe('SUPPORTED_EXTENSIONS export', () => {
    it('should include .js, .ts, .py, .rb, .java, .rs, .go, .c', () => {
      const expected = [
        '.js',
        '.ts',
        '.py',
        '.rb',
        '.java',
        '.rs',
        '.go',
        '.c',
      ];
      for (const ext of expected) {
        expect(SUPPORTED_EXTENSIONS).toContain(ext);
      }
    });

    it('should contain all extensions from settings codeExtensions list', () => {
      // Verify all known code extensions are covered
      const knownExtensions = [
        '.js',
        '.jsx',
        '.mjs',
        '.cjs',
        '.ts',
        '.tsx',
        '.mts',
        '.py',
        '.rb',
        '.java',
        '.rs',
        '.go',
        '.c',
        '.h',
        '.cpp',
        '.hpp',
        '.cc',
        '.cxx',
        '.cs',
        '.swift',
        '.kt',
        '.kts',
        '.sh',
        '.bash',
        '.zsh',
        '.yaml',
        '.yml',
        '.toml',
        '.sql',
        '.ini',
        '.r',
        '.dockerfile',
        '.ps1',
        '.psm1',
        '.psd1',
      ];
      for (const ext of knownExtensions) {
        expect(SUPPORTED_EXTENSIONS).toContain(ext);
      }
    });
  });

  describe('updateConfig', () => {
    it('should update keywords from config', () => {
      const settings = createBaseSettings({
        additionalInactiveKeywords: ['FIXME'],
      });
      const km = createTestKeywordManager(settings);
      parser.updateConfig({
        keywords: km.getAllKeywords(),
        urgencyCoefficients: {
          priorityHigh: 6,
          priorityMedium: 3.9,
          priorityLow: 1.8,
          scheduled: 5,
          scheduledTime: 1,
          deadline: 12,
          deadlineTime: 1,
          active: 4,
          age: 2,
          tags: 1,
          waiting: -3,
        },
      });

      expect(parser.isTaskLine('// FIXME: bug')).toBe(true);
      expect(parser.isTaskLine('// TODO: task')).toBe(true);
    });
  });
});
