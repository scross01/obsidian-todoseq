import { TaskParser } from '../src/parser/task-parser';
import { TodoTrackerSettings } from '../src/settings/settings-types';
import {
  createBaseSettings,
  createTestKeywordManager,
} from './helpers/test-helper';

describe('TaskParser.extractPriorityFromText', () => {
  test('should extract high priority [#A] and clean text', () => {
    const result = TaskParser['extractPriorityFromText'](
      'Some task [#A] with priority',
    );
    expect(result.priority).toBe('high');
    expect(result.cleanedText).toBe('Some task with priority');
  });

  test('should extract medium priority [#B] and clean text', () => {
    const result = TaskParser['extractPriorityFromText'](
      'Another [#B] task here',
    );
    expect(result.priority).toBe('med');
    expect(result.cleanedText).toBe('Another task here');
  });

  test('should extract low priority [#C] and clean text', () => {
    const result = TaskParser['extractPriorityFromText'](
      'Low priority [#C] item',
    );
    expect(result.priority).toBe('low');
    expect(result.cleanedText).toBe('Low priority item');
  });

  test('should return null priority and original text when no priority token', () => {
    const result = TaskParser['extractPriorityFromText'](
      'Regular task without priority',
    );
    expect(result.priority).toBeNull();
    expect(result.cleanedText).toBe('Regular task without priority');
  });

  test('should handle priority token with surrounding spaces', () => {
    const result = TaskParser['extractPriorityFromText'](
      'Task  [#A]  with spaces',
    );
    expect(result.priority).toBe('high');
    expect(result.cleanedText).toBe('Task with spaces');
  });

  test('should handle priority token at beginning of text', () => {
    const result = TaskParser['extractPriorityFromText'](
      '[#B] Task at beginning',
    );
    expect(result.priority).toBe('med');
    expect(result.cleanedText).toBe('Task at beginning');
  });

  test('should handle priority token at end of text', () => {
    const result = TaskParser['extractPriorityFromText']('Task at end [#C]');
    expect(result.priority).toBe('low');
    expect(result.cleanedText).toBe('Task at end ');
  });
});

describe('TaskParser.extractFootnoteReference', () => {
  test('should extract footnote reference from task text', () => {
    const result = TaskParser['extractFootnoteReference'](
      'Some task text [^1]',
    );
    expect(result.footnoteReference).toBe('[^1]');
    expect(result.cleanedText).toBe('Some task text');
  });

  test('should extract first footnote reference when multiple exist', () => {
    const result = TaskParser['extractFootnoteReference'](
      'Task [^1] with [^2] references',
    );
    expect(result.footnoteReference).toBe('[^1]');
    expect(result.cleanedText).toBe('Task  with  references');
  });

  test('should return original text when no footnote reference', () => {
    const result = TaskParser['extractFootnoteReference']('Regular task text');
    expect(result.footnoteReference).toBeUndefined();
    expect(result.cleanedText).toBe('Regular task text');
  });
});

describe('TaskParser.extractEmbedReference', () => {
  test('should extract embed reference from end of task text', () => {
    const result = TaskParser['extractEmbedReference'](
      'Some task text ^abc123',
    );
    expect(result.embedReference).toBe('^abc123');
    expect(result.cleanedText).toBe('Some task text');
  });

  test('should return original text when no embed reference', () => {
    const result = TaskParser['extractEmbedReference']('Regular task text');
    expect(result.embedReference).toBeUndefined();
    expect(result.cleanedText).toBe('Regular task text');
  });

  test('should not extract embed reference from middle of text', () => {
    const result = TaskParser['extractEmbedReference'](
      'Task ^abc123 more text',
    );
    expect(result.embedReference).toBeUndefined();
    expect(result.cleanedText).toBe('Task ^abc123 more text');
  });
});

describe('Regular task parsing', () => {
  let parser: TaskParser;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = createBaseSettings({
      additionalInactiveKeywords: ['FIXME'],
      languageCommentSupport: {
        enabled: false,
      },
    });
    parser = TaskParser.create(
      createTestKeywordManager(settings),
      null,
      undefined,
      settings,
    );
  });

  describe('Task prefixes', () => {
    test(`should match no prefix`, () => {
      const line = `TODO task`;
      const tasks = parser.parseFile(line, 'test.md');

      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.text).toBe('task');
    });

    test(`should match valid bullets`, () => {
      const lines = `
- TODO task
+ TODO task
* TODO task
# TODO invalid task
`;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(3);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.text).toBe('task');
    });

    test(`should match valid lists`, () => {
      const lines = `
1. [ ] TODO task text
2. TODO task text

a) TODO task text
b) TODO task text

(A1) TODO task text
(B2) TODO task text

A1) TODO invalid task
1/ TODO invlaid task
2> TODO invalid task
`;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(6);
      expect(tasks[0].listMarker).toBe('1. [ ] ');
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('task text');
      expect(tasks[1].listMarker).toBe('2. ');
      expect(tasks[1].state).toBe('TODO');
      expect(tasks[1].text).toBe('task text');
      expect(tasks[2].listMarker).toBe('a) ');
      expect(tasks[2].state).toBe('TODO');
      expect(tasks[2].text).toBe('task text');
      expect(tasks[4].listMarker).toBe('(A1) ');
      expect(tasks[4].state).toBe('TODO');
      expect(tasks[4].text).toBe('task text');
    });

    test(`should match valid checkboxes`, () => {
      const lines = `
- [ ] TODO task text
+ [ ] TODO task text
* [ ] TODO task text
- [x] DONE task text
- [-] DOING task text
- [+] DOING task text
- [*] DOING task text
- [] TODO invalid task
- [  ] TODO invalid task
`;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(7);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.text).toBe('task text');
    });

    test(`should match indents`, () => {
      const lines = `
TODO task text
  TODO task text
    TODO task text
- TODO task text
  - TODO task text
`;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(5);
      expect(tasks[0].indent).toBe('');
      expect(tasks[0].listMarker).toBe('');
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('task text');
      expect(tasks[1].indent).toBe('  ');
      expect(tasks[1].listMarker).toBe('');
      expect(tasks[2].indent).toBe('    ');
      expect(tasks[2].listMarker).toBe('');
      expect(tasks[3].indent).toBe('');
      expect(tasks[3].listMarker).toBe('- ');
      expect(tasks[4].indent).toBe('  ');
      expect(tasks[4].listMarker).toBe('- ');
    });

    test(`should match extra space after prefix`, () => {
      const lines = `
      -  TODO task text
      -     TODO task text
      - [ ]  TODO task text
      `;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(3);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.text).toBe('task text');
    });
  });

  describe('Task keywords', () => {
    test(`should match stardard keywords`, () => {
      const lines = `
      TODO task text
      DOING task text
      DONE task text
      WAIT task text
      WAITING task text
      CANCELED task text
      CANCELLED task text
      `;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(7);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('task text');
      expect(tasks[0].completed).toBe(false);
      expect(tasks[1].state).toBe('DOING');
      expect(tasks[1].completed).toBe(false);
      expect(tasks[2].state).toBe('DONE');
      expect(tasks[2].completed).toBe(true);
      expect(tasks[3].state).toBe('WAIT');
      expect(tasks[3].completed).toBe(false);
      expect(tasks[4].state).toBe('WAITING');
      expect(tasks[4].completed).toBe(false);
      expect(tasks[5].state).toBe('CANCELED');
      expect(tasks[5].completed).toBe(true);
      expect(tasks[6].state).toBe('CANCELLED');
      expect(tasks[6].completed).toBe(true);
    });

    test(`should match custom keywords`, () => {
      const lines = `
      FIXME task text
      BOGUS not a task
      `;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('FIXME');
      expect(task.text).toBe('task text');
      expect(task.completed).toBe(false);
    });
  });

  describe('Tasks with tags', () => {
    test(`should match tasks starting with #tag`, () => {
      const lines = `
      TODO #tag my first task
      TODO my second task #tag
      `;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(2);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('#tag my first task');
      expect(tasks[1].state).toBe('TODO');
      expect(tasks[1].text).toBe('my second task #tag');
    });
  });

  describe('Tasks with priorities', () => {
    test(`should match priorities`, () => {
      const lines = `
      TODO [#A] task text
      TODO [#B] task text
      TODO [#C] task text
      TODO [#D] task text

      TODO task text [#A]
      TODO tast text
      `;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(6);
      expect(tasks[0].priority).toBe('high');
      expect(tasks[1].priority).toBe('med');
      expect(tasks[2].priority).toBe('low');
      expect(tasks[3].priority).toBeNull();
      expect(tasks[4].priority).toBe('high');
      expect(tasks[5].priority).toBeNull();
    });
  });

  describe('Tasks with dates', () => {
    test(`should get sceduled task dates`, () => {
      const lines = `
      TODO tast text
      SCHEDULED: <2025-10-31>

      TODO tast text
      SCHEDULED: <2025-10-31 18:30>

      TODO tast text
      SCHEDULED: <2025-10-31 Fri>

      TODO tast text
      SCHEDULED: <2025-10-31 Fri 18:30>
      `;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(4);
      expect(tasks[0].scheduledDate?.getFullYear()).toBe(2025);
      expect(tasks[0].scheduledDate?.getMonth()).toBe(9);
      expect(tasks[0].scheduledDate?.getDate()).toBe(31);
      expect(tasks[0].scheduledDate?.getHours()).toBe(0);
      expect(tasks[0].scheduledDate?.getMinutes()).toBe(0);
      expect(tasks[1].scheduledDate?.getDate()).toBe(31);
      expect(tasks[1].scheduledDate?.getHours()).toBe(18);
      expect(tasks[1].scheduledDate?.getMinutes()).toBe(30);
      expect(tasks[2].scheduledDate?.getDate()).toBe(31);
      expect(tasks[3].scheduledDate?.getDate()).toBe(31);
      expect(tasks[3].scheduledDate?.getHours()).toBe(18);
      expect(tasks[3].scheduledDate?.getMinutes()).toBe(30);
    });

    test(`should get deadline task dates`, () => {
      const lines = `
      TODO tast text
      DEADLINE: <2025-10-31>

      TODO tast text
      DEADLINE: <2025-10-31 18:30>

      TODO tast text
      DEADLINE: <2025-10-31 Fri>

      TODO tast text
      DEADLINE: <2025-10-31 Fri 18:30>
      `;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(4);
      expect(tasks[0].deadlineDate?.getFullYear()).toBe(2025);
      expect(tasks[0].deadlineDate?.getMonth()).toBe(9);
      expect(tasks[0].deadlineDate?.getDate()).toBe(31);
      expect(tasks[0].deadlineDate?.getHours()).toBe(0);
      expect(tasks[0].deadlineDate?.getMinutes()).toBe(0);
      expect(tasks[1].deadlineDate?.getDate()).toBe(31);
      expect(tasks[1].deadlineDate?.getHours()).toBe(18);
      expect(tasks[1].deadlineDate?.getMinutes()).toBe(30);
      expect(tasks[2].deadlineDate?.getDate()).toBe(31);
      expect(tasks[3].deadlineDate?.getDate()).toBe(31);
      expect(tasks[3].deadlineDate?.getHours()).toBe(18);
      expect(tasks[3].deadlineDate?.getMinutes()).toBe(30);
    });

    test(`should get scheduled and deadline task dates`, () => {
      const lines = `
      TODO tast text
      SCHEDULED: <2025-10-31>
      DEADLINE: <2025-11-01>
      `;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(1);
      expect(tasks[0].scheduledDate?.getFullYear()).toBe(2025);
      expect(tasks[0].scheduledDate?.getMonth()).toBe(9);
      expect(tasks[0].scheduledDate?.getDate()).toBe(31);
      expect(tasks[0].deadlineDate?.getFullYear()).toBe(2025);
      expect(tasks[0].deadlineDate?.getMonth()).toBe(10);
      expect(tasks[0].deadlineDate?.getDate()).toBe(1);
    });
  });

  describe('Tasks in quotes and callouts', () => {
    test(`should match quoted tasks`, () => {
      const lines = `
>TODO task text
> TODO task text
> - TODO task text
  > TODO task text 
`;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(4);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('task text');
    });

    test(`should match dates in quoted tasks`, () => {
      const lines = `
> TODO task text
> SCHEDULED: <2025-10-31>
> DEADLINE: <2025-11-01>
      `;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(1);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('task text');
      expect(tasks[0].scheduledDate?.getFullYear()).toBe(2025);
      expect(tasks[0].scheduledDate?.getMonth()).toBe(9);
      expect(tasks[0].scheduledDate?.getDate()).toBe(31);
      expect(tasks[0].deadlineDate?.getFullYear()).toBe(2025);
      expect(tasks[0].deadlineDate?.getMonth()).toBe(10);
      expect(tasks[0].deadlineDate?.getDate()).toBe(1);
    });

    test(`should match callout block tasks`, () => {
      const lines = `
>[!info] TODO task text

> [!todo]-
> - [ ] TODO task text 
`;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(2);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('task text');
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('task text');
    });
  });

  describe('Tasks in math blocks', () => {
    test(`should not match math blocks`, () => {
      const lines = `
$$ TODO task text $$

$$ 
TODO task text
$$
      `;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(0);
    });
  });

  describe('Tasks in comment blocks', () => {
    test(`should not match comment blocks when disabled (default)`, () => {
      const lines = `
%% TODO task text %%

%%
TODO task text
%%
      `;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(0);
    });

    test(`should match comment blocks when enabled`, () => {
      const settingsWithCommentBlocks: TodoTrackerSettings = createBaseSettings(
        {
          additionalInactiveKeywords: ['FIXME'],
          includeCommentBlocks: true,
          languageCommentSupport: {
            enabled: false,
          },
        },
      );
      const parserWithCommentBlocks = TaskParser.create(
        createTestKeywordManager(settingsWithCommentBlocks),
        null,
      );

      const lines = `
%% TODO task text %%

%%
TODO task text
%%
      `;
      const tasks = parserWithCommentBlocks.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(2);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('task text');
      expect(tasks[0].indent).toBe('');
      expect(tasks[0].listMarker).toBe('');
      expect(tasks[1].state).toBe('TODO');
      expect(tasks[1].text).toBe('task text');
      expect(tasks[1].indent).toBe('');
      expect(tasks[1].listMarker).toBe('');
    });

    test(`should match comment blocks with different task states`, () => {
      const settingsWithCommentBlocks: TodoTrackerSettings = createBaseSettings(
        {
          additionalInactiveKeywords: ['FIXME'],
          includeCommentBlocks: true,
          languageCommentSupport: {
            enabled: false,
          },
        },
      );
      const parserWithCommentBlocks = TaskParser.create(
        createTestKeywordManager(settingsWithCommentBlocks),
        null,
      );

      const lines = `
%% TODO task text %%
%% DOING another task %%
%% DONE completed task %%
%% FIXME custom keyword task %%
      `;
      const tasks = parserWithCommentBlocks.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(4);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('task text');
      expect(tasks[0].completed).toBe(false);
      expect(tasks[1].state).toBe('DOING');
      expect(tasks[1].text).toBe('another task');
      expect(tasks[1].completed).toBe(false);
      expect(tasks[2].state).toBe('DONE');
      expect(tasks[2].text).toBe('completed task');
      expect(tasks[2].completed).toBe(true);
      expect(tasks[3].state).toBe('FIXME');
      expect(tasks[3].text).toBe('custom keyword task');
      expect(tasks[3].completed).toBe(false);
    });

    test(`should match comment blocks with priorities`, () => {
      const settingsWithCommentBlocks: TodoTrackerSettings = createBaseSettings(
        {
          additionalInactiveKeywords: ['FIXME'],
          includeCommentBlocks: true,
          languageCommentSupport: {
            enabled: false,
          },
        },
      );
      const parserWithCommentBlocks = TaskParser.create(
        createTestKeywordManager(settingsWithCommentBlocks),
        null,
      );

      const lines = `
%% TODO [#A] high priority task %%
%% TODO [#B] medium priority task %%
%% TODO [#C] low priority task %%
%% TODO normal priority task %%
      `;
      const tasks = parserWithCommentBlocks.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(4);
      expect(tasks[0].priority).toBe('high');
      expect(tasks[0].text).toBe('high priority task');
      expect(tasks[1].priority).toBe('med');
      expect(tasks[1].text).toBe('medium priority task');
      expect(tasks[2].priority).toBe('low');
      expect(tasks[2].text).toBe('low priority task');
      expect(tasks[3].priority).toBeNull();
      expect(tasks[3].text).toBe('normal priority task');
    });

    test(`should match comment blocks with dates`, () => {
      const settingsWithCommentBlocks: TodoTrackerSettings = createBaseSettings(
        {
          additionalInactiveKeywords: ['FIXME'],
          includeCommentBlocks: true,
          languageCommentSupport: {
            enabled: false,
          },
        },
      );
      const parserWithCommentBlocks = TaskParser.create(
        createTestKeywordManager(settingsWithCommentBlocks),
        null,
      );

      const lines = `
%% TODO task text %%
SCHEDULED: <2025-10-31>
DEADLINE: <2025-11-01>

%% DOING another task %%
      SCHEDULED: <2025-12-01>
      `;
      const tasks = parserWithCommentBlocks.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(2);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('task text');
      expect(tasks[0].scheduledDate?.getFullYear()).toBe(2025);
      expect(tasks[0].scheduledDate?.getMonth()).toBe(9);
      expect(tasks[0].scheduledDate?.getDate()).toBe(31);
      expect(tasks[0].deadlineDate?.getFullYear()).toBe(2025);
      expect(tasks[0].deadlineDate?.getMonth()).toBe(10);
      expect(tasks[0].deadlineDate?.getDate()).toBe(1);

      expect(tasks[1].state).toBe('DOING');
      expect(tasks[1].text).toBe('another task');
      expect(tasks[1].scheduledDate?.getFullYear()).toBe(2025);
      expect(tasks[1].scheduledDate?.getMonth()).toBe(11);
      expect(tasks[1].scheduledDate?.getDate()).toBe(1);
    });
  });

  describe('Tasks in code blocks when disabled', () => {
    test(`should not match code blocks when disabled`, () => {
      const lines = `
\`\`\`
TODO task text
\`\`\`

~~~
TODO task text
~~~
`;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(0);
    });
  });

  describe('Tasks in footnote definitions', () => {
    test(`should match footnote tasks`, () => {
      const lines = `
This text a has a footnote[^1]

[^1]: TODO task in the footnote description
[^2]: DOING another task in footnote
[^3]: DONE completed task in footnote
[^4]: FIXME custom keyword task in footnote
[^5]: TODO [#A] high priority task in footnote
[^6]: TODO task with #tag in footnote
`;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(6);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('task in the footnote description');
      expect(tasks[0].indent).toBe('');
      expect(tasks[0].listMarker).toBe('');

      expect(tasks[1].state).toBe('DOING');
      expect(tasks[1].text).toBe('another task in footnote');
      expect(tasks[1].completed).toBe(false);

      expect(tasks[2].state).toBe('DONE');
      expect(tasks[2].text).toBe('completed task in footnote');
      expect(tasks[2].completed).toBe(true);

      expect(tasks[3].state).toBe('FIXME');
      expect(tasks[3].text).toBe('custom keyword task in footnote');

      expect(tasks[4].state).toBe('TODO');
      expect(tasks[4].text).toBe('high priority task in footnote');
      expect(tasks[4].priority).toBe('high');

      expect(tasks[5].state).toBe('TODO');
      expect(tasks[5].text).toBe('task with #tag in footnote');
    });

    test(`should match footnote tasks with dates`, () => {
      const lines = `
[^1]: TODO task in footnote
SCHEDULED: <2025-10-31>
DEADLINE: <2025-11-01>

[^2]: DOING another task
      SCHEDULED: <2025-12-01>
`;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(2);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('task in footnote');
      expect(tasks[0].scheduledDate?.getFullYear()).toBe(2025);
      expect(tasks[0].scheduledDate?.getMonth()).toBe(9);
      expect(tasks[0].scheduledDate?.getDate()).toBe(31);
      expect(tasks[0].deadlineDate?.getFullYear()).toBe(2025);
      expect(tasks[0].deadlineDate?.getMonth()).toBe(10);
      expect(tasks[0].deadlineDate?.getDate()).toBe(1);

      expect(tasks[1].state).toBe('DOING');
      expect(tasks[1].text).toBe('another task');
      expect(tasks[1].scheduledDate?.getFullYear()).toBe(2025);
      expect(tasks[1].scheduledDate?.getMonth()).toBe(11);
      expect(tasks[1].scheduledDate?.getDate()).toBe(1);
    });
  });
});

describe('Task parsing with code blocks', () => {
  let parser: TaskParser;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = createBaseSettings({
      additionalInactiveKeywords: [],
      includeCodeBlocks: true,
      languageCommentSupport: {
        enabled: false,
      },
    });
    parser = TaskParser.create(
      createTestKeywordManager(settings),
      null,
      undefined,
      settings,
    );
  });

  describe('Tasks in code blocks when enabled (no language processing)', () => {
    test(`should match regular task format in code blocks when enabled`, () => {
      const lines = `
\`\`\`
TODO task text
\`\`\`

~~~
TODO task text
~~~

\`\`\` javascript
TODO task text
// TODO commented task not collected 
\`\`\`

`;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(3);
    });
  });
});

describe('Task parsing within langauge spefic comments in code blocks', () => {
  let parser: TaskParser;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = createBaseSettings({
      additionalInactiveKeywords: [],
      includeCodeBlocks: true,
      languageCommentSupport: {
        enabled: true,
      },
    });
    parser = TaskParser.create(
      createTestKeywordManager(settings),
      null,
      undefined,
      settings,
    );
  });

  describe('Tasks in code blocks', () => {
    test(`should match regular tasks in generic code blocks when enabled`, () => {
      const lines = `
\`\`\`
TODO test task text
- [ ] TODO [#A] test task text
// TODO ignored task
\`\`\`

~~~
TODO test task text
// TODO ignored task
~~~
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(3);
      expect(tasks[0].indent).toBe('');
      expect(tasks[0].text).toBe('test task text');
      expect(tasks[1].indent).toBe('');
      expect(tasks[1].listMarker).toBe('- [ ]');
      expect(tasks[1].priority).toBe('high');
      expect(tasks[1].text).toBe('test task text');
      expect(tasks[2].indent).toBe('');
      expect(tasks[2].text).toBe('test task text');
    });

    test(`should match regular tasks in unknown code blocks when enabled`, () => {
      const lines = `
\`\`\` bogus
TODO test task text
/* TODO ignored task */

/*
TODO test task text
 */
\`\`\`
`;
      const tasks = parser.parseFile(lines, 'test.md');
      expect(tasks).toHaveLength(2);
      expect(tasks[0].indent).toBe('');
      expect(tasks[0].text).toBe('test task text');
      expect(tasks[1].indent).toBe('');
      expect(tasks[1].text).toBe('test task text');
    });

    test(`should match tasks with multibyte characters as first character`, () => {
      const lines = `
TODO letter a b
TODO letter a 中
TODO 中 letter a
TODO 🚀 task text
TODO 📝 another task
TODO 你好世界
TODO 🇨🇦 Canadian flag
`;
      const tasks = parser.parseFile(lines, 'test.md');

      expect(tasks).toHaveLength(7);
      expect(tasks[0].text).toBe('letter a b');
      expect(tasks[1].text).toBe('letter a 中');
      expect(tasks[2].text).toBe('中 letter a');
      expect(tasks[3].text).toBe('🚀 task text');
      expect(tasks[4].text).toBe('📝 another task');
      expect(tasks[5].text).toBe('你好世界');
      expect(tasks[6].text).toBe('🇨🇦 Canadian flag');
    });
  });
});
