import { collectStructuralEntries } from '../src/utils/task-structure-entries';
import { createTestKeywordManager } from './helpers/test-helper';

describe('structural entry collection', () => {
  it('publishes headings, prose, keywordless checkboxes and archived rows', () => {
    const content = [
      '# TODO Launch',
      '',
      '## Research',
      '',
      'TODO Gather evidence',
      'A separate paragraph.',
      '- [ ] unassigned box',
      'TODO Done task',
      'ARCHIVED Old task',
      '',
      '```',
      '## not a heading',
      '```',
    ].join('\n');

    const entries = collectStructuralEntries(
      content,
      'note.md',
      'markdown',
      createTestKeywordManager(),
    );

    expect(
      entries.filter((entry) => entry.kind === 'heading').map((entry) => entry.line),
    ).toEqual([0, 2]);
    expect(entries.map((entry) => entry.kind)).toContain('prose');
    expect(
      entries.find(
        (entry) => entry.kind === 'checkbox' && entry.line === 6,
      ),
    ).toMatchObject({ checked: false, indentLength: 0 });
    expect(entries.find((entry) => entry.line === 8)).toMatchObject({
      kind: 'archived',
    });
    expect(entries.some((entry) => entry.line === 12)).toBe(false);
  });

  it('publishes Org headings and checked or partial checkboxes', () => {
    const content = [
      '* TODO Parent',
      '  - [X] done',
      '  - [-] partial',
      '** TODO Child',
      '   - [ ] waiting',
    ].join('\n');

    const entries = collectStructuralEntries(
      content,
      'note.org',
      'org',
      createTestKeywordManager(),
    );

    expect(
      entries.filter((entry) => entry.kind === 'heading').map((entry) => entry.line),
    ).toEqual([0, 3]);
    expect(entries.find((entry) => entry.line === 1)).toMatchObject({
      kind: 'checkbox',
      checked: true,
    });
    expect(entries.find((entry) => entry.line === 2)).toMatchObject({
      kind: 'checkbox',
      checked: false,
    });
    expect(entries.find((entry) => entry.line === 4)).toMatchObject({
      kind: 'checkbox',
      checked: false,
    });
  });
});
