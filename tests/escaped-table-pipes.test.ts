/**
 * Escaped pipes are display-level escapes: `a\|b` is one Markdown cell.
 * Cell parsing must not treat that pipe as a delimiter, and cell writes must
 * replace only the selected cell's bytes.
 */

import { App } from 'obsidian';
import { TaskParser } from '../src/parser/task-parser';
import {
  parseTableCells,
  replaceTableCellContent,
} from '../src/utils/task-line-utils';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

const app = { vault: { getConfig: () => undefined } } as unknown as App;

function parser() {
  return TaskParser.create(
    createTestKeywordManager(createBaseSettings()),
    app,
    undefined,
    {},
  );
}

describe('parseTableCells with escaped delimiters', () => {
  it('keeps an escaped pipe inside its cell and reports exact spans', () => {
    const line = '| a\\|b | TODO actual task |';
    const cells = parseTableCells(line);
    expect(cells).toHaveLength(2);
    expect(cells[0].content).toBe('a\\|b');
    expect(cells[1].content).toBe('TODO actual task');
    for (const cell of cells) {
      expect(line.slice(cell.start, cell.end)).toBe(cell.raw);
    }
  });

  it('does not split an escaped backslash before a delimiter', () => {
    const line = '| a\\\\ | TODO second |';
    const cells = parseTableCells(line);
    expect(cells).toHaveLength(2);
    expect(cells[0].content).toBe('a\\\\');
    expect(cells[1].content).toBe('TODO second');
  });

  it('preserves surrounding whitespace and outer-pipe semantics', () => {
    expect(parseTableCells('|  a  |  b  |').map((c) => c.content)).toEqual([
      'a',
      'b',
    ]);
    const bare = parseTableCells('a | b');
    expect(bare.map((c) => c.content)).toEqual(['a', 'b']);
    expect(parseTableCells('plain text')).toEqual([]);
  });
});

describe('tasks in rows with escaped pipes', () => {
  it('assigns the displayed cell index and parses the task', () => {
    const tasks = parser().parseFile(
      '| a\\|b | TODO actual task |',
      'notes/table.md',
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0].isTableTask).toBe(true);
    expect(tasks[0].tableCell?.cellIndex).toBe(1);
    expect(tasks[0].text).toBe('actual task');
  });

  it('parses both tasks in separate cells', () => {
    const tasks = parser().parseFile(
      '| x\\|y | TODO first | DONE second |',
      'notes/table.md',
    );
    expect(tasks.map((t) => [t.tableCell?.cellIndex, t.state])).toEqual([
      [1, 'TODO'],
      [2, 'DONE'],
    ]);
  });
});

describe('replaceTableCellContent', () => {
  it('rewrites only the selected cell of an escaped-pipe row', () => {
    const line = '| a\\|b | TODO actual task | other |';
    const updated = replaceTableCellContent(line, 1, 'DOING actual task');
    expect(updated).toBe('| a\\|b | DOING actual task | other |');
  });

  it('returns null when the cell does not exist', () => {
    expect(replaceTableCellContent('| a | b |', 5, 'x')).toBeNull();
  });
});
