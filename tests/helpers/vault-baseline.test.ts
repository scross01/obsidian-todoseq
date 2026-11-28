import { App } from 'obsidian';
import { Task } from '../../src/types/task';
import { TaskParser } from '../../src/parser/task-parser';
import {
  baselineVaultMarkdown,
  baselineVaultPaths,
} from '../integration/helpers/vault-setup';
import { createBaseSettings, createTestKeywordManager } from './test-helper';

/**
 * Plan 077: the integration fixture inventory and reset must consume one
 * deterministic baseline source. Dates use local constructors so the test is
 * timezone-independent.
 */
describe('integration baseline vault', () => {
  const fixedToday = new Date(2026, 6, 8, 12, 0, 0);

  const expectedPaths = [
    'daily/2026-07-08.md',
    'embedded-demo.md',
    'external-change.md',
    'inbox.md',
    'projects/alpha.md',
    'recurrence-deadline.md',
    'recurrence-doing.md',
    'recurrence-identity.md',
    'recurrence-mixed.md',
    'recurrence-table-warning.md',
    'recurrence-warning-edit.md',
    'recurrence.md',
    'smart-date.md',
    'states.md',
    'subtask-progress.md',
    'table-tasks.md',
    'with-properties.md',
  ];

  it('pins the deterministic baseline path inventory', () => {
    expect(baselineVaultPaths(fixedToday)).toEqual(expectedPaths);
    expect(Object.keys(baselineVaultMarkdown(fixedToday)).sort()).toEqual(
      expectedPaths,
    );
  });

  it('is byte-identical for the same local date', () => {
    const morning = new Date(2026, 6, 8, 6, 15, 0);
    const evening = new Date(2026, 6, 8, 23, 45, 0);
    expect(baselineVaultMarkdown(morning)).toEqual(
      baselineVaultMarkdown(evening),
    );
  });

  it('advances the daily note across a local day/month boundary', () => {
    expect(baselineVaultPaths(new Date(2026, 6, 31, 12, 0, 0))).toContain(
      'daily/2026-07-31.md',
    );
    const nextMonth = baselineVaultPaths(new Date(2026, 7, 1, 12, 0, 0));
    expect(nextMonth).toContain('daily/2026-08-01.md');
    expect(nextMonth).not.toContain('daily/2026-07-31.md');
  });

  it('parses the baseline through the real parser with stable task identities', () => {
    const settings = createBaseSettings();
    const keywordManager = createTestKeywordManager(settings);
    const parser = TaskParser.create(
      keywordManager,
      null as unknown as App,
      undefined,
      {
        includeCalloutBlocks: true,
        includeCodeBlocks: true,
        includeCommentBlocks: true,
      },
    );

    const tasks: Task[] = [];
    for (const [path, content] of Object.entries(
      baselineVaultMarkdown(fixedToday),
    )) {
      tasks.push(...parser.parseFile(content, path));
    }

    expect(tasks).toHaveLength(36);
    expect(
      tasks.map(
        ({ path, line, state, text }) => `${path}:${line} ${state} ${text}`,
      ),
    ).toMatchInlineSnapshot(`
      [
        "inbox.md:2 TODO Buy groceries",
        "inbox.md:3 TODO Review PR #123",
        "inbox.md:4 DONE Write documentation",
        "inbox.md:5 WAITING For feedback on proposal",
        "projects/alpha.md:2 TODO Implement feature A",
        "projects/alpha.md:3 TODO Fix bug in module B",
        "projects/alpha.md:4 DONE Deploy to staging",
        "daily/2026-07-08.md:2 TODO Daily task 1",
        "recurrence.md:2 TODO Recurring daily task",
        "states.md:2 TODO State cycling task",
        "states.md:3 DOING In-progress task",
        "states.md:4 DONE Completed task",
        "states.md:5 WAITING Blocked task",
        "subtask-progress.md:2 TODO Parent task",
        "subtask-progress.md:3 TODO Child one",
        "subtask-progress.md:4 TODO Child two",
        "subtask-progress.md:6 TODO Plain sibling",
        "smart-date.md:2 TODO Type a task with natural date here",
        "with-properties.md:8 TODO Property task one",
        "with-properties.md:9 DOING Property task two",
        "with-properties.md:10 DONE Property task three",
        "recurrence-deadline.md:2 TODO Daily deadline task",
        "recurrence-doing.md:2 DOING Recurring DOING task",
        "recurrence-mixed.md:2 TODO Mixed date task",
        "recurrence-mixed.md:6 DOING First-only warning task",
        "recurrence-identity.md:2 TODO Identity target",
        "recurrence-identity.md:8 TODO Identity target",
        "recurrence-table-warning.md:4 TODO Table warning task",
        "recurrence-warning-edit.md:2 TODO Warning edit task",
        "table-tasks.md:4 TODO Table task one",
        "table-tasks.md:5 DOING Table task two with description",
        "table-tasks.md:6 DONE Table task three",
        "table-tasks.md:7 WAITING Table task four",
        "table-tasks.md:13 DOING four",
        "table-tasks.md:13 NOW five",
        "table-tasks.md:13 IN-PROGRESS six",
      ]
    `);
  });
});
