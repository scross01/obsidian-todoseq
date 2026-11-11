/**
 * Default (unprefixed) search must match the displayed task text even when the
 * parser removed priority/footnote markers from the middle of the line. The
 * real TaskParser is the oracle: a phrase that is not contiguous in rawText is
 * still a valid match through the normalized text.
 */

import { Search } from '../src/search/search';
import { TaskParser } from '../src/parser/task-parser';
import { App } from 'obsidian';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

const settings = createBaseSettings();
const keywordManager = createTestKeywordManager(settings);
const app = { vault: { getConfig: () => undefined } } as unknown as App;
const parser = TaskParser.create(keywordManager, app, undefined, {});

function parse(line: string) {
  const task = parser.parseFile(line, 'test.md')[0];
  if (!task) throw new Error(`fixture did not parse: ${line}`);
  return task;
}

function matches(
  query: string,
  task: ReturnType<typeof parse>,
  cs = false,
): Promise<boolean> {
  return Search.evaluate(query, task, cs);
}

describe('default search over normalized task text', () => {
  it('matches a phrase that straddles a footnote reference', async () => {
    const task = parse('TODO Review[^1] report');
    expect(task.text).toBe('Review report');
    expect(await matches('"Review report"', task)).toBe(true);
    // Raw text stays searchable too (the marker itself is tokenizer syntax,
    // so the surrounding words are the stable raw-text check).
    expect(await matches('Review', task)).toBe(true);
    expect(await matches('report', task)).toBe(true);
  });

  it('matches a phrase that straddles a priority token', async () => {
    const task = parse('TODO alpha [#A] beta');
    expect(task.text).toBe('alpha beta');
    expect(await matches('"alpha beta"', task)).toBe(true);
    expect(await matches('#A', task)).toBe(true);
  });

  it('matches joined words left by a removed footnote', async () => {
    const task = parse('TODO Review[^12]report');
    expect(task.text).toBeTruthy();
    expect(await matches(`"${task.text}"`, task)).toBe(true);
  });

  it('still honours case sensitivity and negation', async () => {
    const task = parse('TODO Review[^1] report');
    expect(await matches('"review report"', task, true)).toBe(false);
    expect(await matches('"Review report"', task, true)).toBe(true);
    expect(await matches('-"Review report"', task)).toBe(false);
    expect(await matches('-"Other thing"', task)).toBe(true);
  });

  it('keeps DESCRIPTION and parent headings in their own scopes', async () => {
    const task = parse('TODO Review[^1] report');
    task.description = 'Check the appendix';
    task.parentHeading = 'Weekly review';
    expect(await matches('appendix', task)).toBe(true);
    expect(await matches('"Weekly review"', task)).toBe(false);
    expect(await matches('heading:"Weekly review"', task)).toBe(true);
  });
});
