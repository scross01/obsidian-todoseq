/**
 * Numeric footnote tasks inside excluded code/comment/math blocks must not be
 * collected. Uses the real parser and the same inclusion settings as any task.
 */

import { App } from 'obsidian';
import { TaskParser } from '../src/parser/task-parser';
import { Task } from '../src/types/task';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

const app = { vault: { getConfig: () => undefined } } as unknown as App;

function parse(
  source: string,
  settings: {
    includeCodeBlocks: boolean;
    includeCommentBlocks: boolean;
  },
): Task[] {
  const parser = TaskParser.create(
    createTestKeywordManager(createBaseSettings()),
    app,
    undefined,
    settings,
  );
  return parser.parseFile(source, 'notes/footnotes.md');
}

const OFF = { includeCodeBlocks: false, includeCommentBlocks: false };
const ON = { includeCodeBlocks: true, includeCommentBlocks: true };

describe('numeric footnote tasks and block inclusion', () => {
  it('collects a plain footnote outside any block', () => {
    const tasks = parse('[^1]: TODO visible footnote', OFF);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text).toContain('visible footnote');
    expect(tasks[0].line).toBe(0);
  });

  it('skips backtick and tilde fences when code blocks are excluded', () => {
    for (const fence of ['```', '~~~']) {
      const source = [fence, '[^1]: TODO hidden example', fence].join('\n');
      expect(parse(source, OFF)).toHaveLength(0);
      expect(parse(source, ON)).toHaveLength(1);
    }
  });

  it('always skips math blocks', () => {
    const source = ['$$', '[^1]: TODO hidden math', '$$'].join('\n');
    expect(parse(source, OFF)).toHaveLength(0);
    expect(parse(source, ON)).toHaveLength(0);
  });

  it('honours the comment-block setting', () => {
    const source = ['%%', '[^1]: TODO hidden comment', '%%'].join('\n');
    expect(parse(source, OFF)).toHaveLength(0);
    expect(parse(source, ON)).toHaveLength(1);
  });

  it('treats an unclosed fence as excluded content', () => {
    const source = [
      '```markdown',
      '[^1]: TODO hidden',
      'no closing fence',
    ].join('\n');
    expect(parse(source, OFF)).toHaveLength(0);
  });

  it('parses footnotes after a closing delimiter with the right heading', () => {
    const source = [
      '## Weekly review',
      '```',
      'code',
      '```',
      '[^1]: TODO after the block',
    ].join('\n');
    const tasks = parse(source, OFF);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text).toContain('after the block');
    expect(tasks[0].parentHeading).toBe('Weekly review');
    expect(tasks[0].line).toBe(4);
  });
});
