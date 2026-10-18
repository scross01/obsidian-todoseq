import { Search } from '../src/search/search';
import { Task } from '../src/types/task';
import { TaskParser } from '../src/parser/task-parser';
import {
  createBaseTask,
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

describe('description: and heading: search prefixes', () => {
  const task = (overrides: Partial<Task>): Task =>
    createBaseTask({
      path: 'notes/meeting.md',
      rawText: 'TODO task',
      text: 'task',
      ...overrides,
    });

  const matches = async (
    query: string,
    candidate: Task,
    caseSensitive = false,
  ): Promise<boolean> => Search.evaluate(query, candidate, caseSensitive);

  describe('description:', () => {
    it('matches a substring of the DESCRIPTION field', async () => {
      const candidate = task({ description: 'Call the bank about the loan' });
      expect(await matches('description:bank', candidate)).toBe(true);
      expect(await matches('description:loans', candidate)).toBe(false);
    });

    it('is case-insensitive by default and case-sensitive when asked', async () => {
      const candidate = task({ description: 'Call the Bank' });
      expect(await matches('description:bank', candidate, false)).toBe(true);
      expect(await matches('description:bank', candidate, true)).toBe(false);
    });

    it('does not match when the task has no description', async () => {
      const candidate = task({ description: undefined });
      expect(await matches('description:bank', candidate)).toBe(false);
    });

    it('matches a quoted phrase as a substring', async () => {
      const candidate = task({ description: 'Call the bank about the loan' });
      expect(await matches('description:"the bank about"', candidate)).toBe(
        true,
      );
      expect(await matches('description:"the gym about"', candidate)).toBe(
        false,
      );
    });

    it('supports negation', async () => {
      const candidate = task({ description: 'Call the bank' });
      expect(await matches('-description:bank', candidate)).toBe(false);
      expect(await matches('-description:gym', candidate)).toBe(true);
    });
  });

  describe('default (no-prefix) search', () => {
    // Expanding plan 034: an unprefixed term/phrase matches the task line OR
    // its DESCRIPTION text. The user's acceptance example, verbatim.
    const lineOnly = task({
      rawText: 'TODO check the document format',
      text: 'check the document format',
    });
    const descriptionOnly = task({
      rawText: 'TODO release the presentation',
      text: 'release the presentation',
      description: 'updated document format presentation',
    });

    it('matches a term in the description when the task line lacks it', async () => {
      expect(await matches('format', descriptionOnly)).toBe(true);
      expect(await matches('format', lineOnly)).toBe(true);
    });

    it('still matches a term in the task line when there is no description', async () => {
      expect(await matches('document', lineOnly)).toBe(true);
    });

    it('does not match a term absent from both line and description', async () => {
      expect(await matches('spreadsheet', descriptionOnly)).toBe(false);
      expect(await matches('spreadsheet', lineOnly)).toBe(false);
    });

    it('matches a quoted phrase across description word boundaries', async () => {
      expect(await matches('"document format"', descriptionOnly)).toBe(true);
      expect(await matches('"format document"', descriptionOnly)).toBe(false);
    });

    it('honours case sensitivity for description matches', async () => {
      const candidate = task({
        rawText: 'TODO release',
        text: 'release',
        description: 'Updated DOCUMENT format',
      });
      expect(await matches('document', candidate, false)).toBe(true);
      expect(await matches('document', candidate, true)).toBe(false);
    });

    it('reaches the same result through the bulk filter facade', async () => {
      const filtered = await Search.filterTasks(
        [lineOnly, descriptionOnly],
        'format',
      );
      expect(filtered).toEqual([lineOnly, descriptionOnly]);
    });

    it('excludes the description from heading: matches (field stays scoped)', async () => {
      // Guard against a blanket searchable-fields change: heading: must not
      // start matching description text, and description: must not match
      // heading-only text.
      const candidate = task({
        parentHeading: 'Meeting Notes',
        description: 'agenda for the call',
      });
      expect(await matches('heading:agenda', candidate)).toBe(false);
      expect(await matches('description:notes', candidate)).toBe(false);
      expect(await matches('heading:notes', candidate)).toBe(true);
    });
  });

  describe('heading:', () => {
    it('matches a substring of the parent heading', async () => {
      const candidate = task({ parentHeading: 'Meeting Notes' });
      expect(await matches('heading:meeting', candidate)).toBe(true);
      expect(await matches('heading:notes', candidate)).toBe(true);
      expect(await matches('heading:archive', candidate)).toBe(false);
    });

    it('does not match when the task has no heading', async () => {
      const candidate = task({ parentHeading: undefined });
      expect(await matches('heading:meeting', candidate)).toBe(false);
    });

    it('matches a quoted phrase as a substring', async () => {
      const candidate = task({ parentHeading: 'Meeting Notes' });
      expect(await matches('heading:"meeting notes"', candidate)).toBe(true);
      expect(await matches('heading:"notes meeting"', candidate)).toBe(false);
    });

    it('is case-insensitive by default', async () => {
      const candidate = task({ parentHeading: 'Meeting Notes' });
      expect(await matches('heading:MEETING', candidate)).toBe(true);
    });
  });

  it('combines with other filters', async () => {
    const match = task({
      description: 'Call the bank',
      parentHeading: 'Finance',
      state: 'TODO',
    });
    const wrongHeading = task({
      description: 'Call the bank',
      parentHeading: 'Personal',
      state: 'TODO',
    });

    expect(await matches('description:bank heading:finance', match)).toBe(true);
    expect(
      await matches('description:bank heading:finance', wrongHeading),
    ).toBe(false);
  });

  it('works through the bulk filter facade too', async () => {
    const match = task({ parentHeading: 'Setup' });
    const other = task({ parentHeading: 'Teardown' });
    const filtered = await Search.filterTasks([match, other], 'heading:setup');
    expect(filtered).toEqual([match]);
  });

  describe('parentHeading capture in parseFile', () => {
    let parser: TaskParser;

    beforeEach(() => {
      const settings = createBaseSettings();
      parser = TaskParser.create(
        createTestKeywordManager(settings),
        null,
        undefined,
        settings,
      );
    });

    it('captures the nearest enclosing heading for tasks below it', () => {
      const tasks = parser.parseFile(
        '## Setup\n\n- TODO install deps\n',
        'test.md',
      );
      expect(tasks).toHaveLength(1);
      expect(tasks[0].parentHeading).toBe('Setup');
    });

    it('uses the nearest heading when nested', () => {
      const tasks = parser.parseFile(
        '# Parent\n\n## Setup\n\n- TODO install deps\n\n# Other\n\n- TODO next\n',
        'test.md',
      );
      expect(tasks).toHaveLength(2);
      expect(tasks[0].parentHeading).toBe('Setup');
      expect(tasks[1].parentHeading).toBe('Other');
    });

    it('is undefined for tasks before any heading', () => {
      const tasks = parser.parseFile(
        '- TODO orphan task\n\n## Later\n\n- TODO kept task\n',
        'test.md',
      );
      expect(tasks).toHaveLength(2);
      expect(tasks[0].parentHeading).toBeUndefined();
      expect(tasks[1].parentHeading).toBe('Later');
    });

    it('gives a heading task its own heading text (hashes stripped)', () => {
      const tasks = parser.parseFile('# TODO Ship release\n', 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].parentHeading).toBe('TODO Ship release');
    });

    it('ignores headings inside code fences', () => {
      const content =
        '## Real\n\n```md\n# Not A Heading\n- just text\n```\n\n- TODO outside\n';
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].text).toBe('outside');
      expect(tasks[0].parentHeading).toBe('Real');
    });

    it('picks up a heading rename on re-parse (rescan)', () => {
      const first = parser.parseFile('## Old Name\n\n- TODO task\n', 'test.md');
      expect(first[0].parentHeading).toBe('Old Name');
      const second = parser.parseFile(
        '## New Name\n\n- TODO task\n',
        'test.md',
      );
      expect(second[0].parentHeading).toBe('New Name');
    });

    it('captures parentHeading for table-cell tasks too', () => {
      const content =
        '## Table Section\n\n| Task | State |\n| --- | --- |\n| TODO cell task | x |\n';
      const tasks = parser.parseFile(content, 'test.md');
      expect(tasks.length).toBeGreaterThan(0);
      for (const t of tasks) {
        expect(t.parentHeading).toBe('Table Section');
      }
    });
  });
});
