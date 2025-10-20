import { TaskParser } from '../task-parser';
import { TodoTrackerSettings } from '../settings';
import { Task, DEFAULT_PENDING_STATES, DEFAULT_ACTIVE_STATES, DEFAULT_COMPLETED_STATES } from '../task';

describe('Regular Task Parsing (Non-Code Block Tasks)', () => {
  let parser: TaskParser;
  let settings: TodoTrackerSettings;

  beforeEach(() => {
    settings = {
      refreshInterval: 60,
      includeCodeBlocks: false,
      includeCalloutBlocks: true,
      languageCommentSupport: {
        enabled: false,
        languages: []
      },
      additionalTaskKeywords: [],
      taskViewMode: 'default'
    };
    parser = TaskParser.create(settings);
  });

  describe('Default Pending States', () => {
    const pendingStates = Array.from(DEFAULT_PENDING_STATES);
    
    pendingStates.forEach(state => {
      test(`should parse ${state} task with basic list marker`, () => {
        const line = `- ${state} test task`;
        const tasks = parser.parseFile(line, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe(state);
        expect(task.completed).toBe(false);
        expect(task.listMarker).toBe('- ');
        expect(task.text).toBe('test task');
        expect(task.indent).toBe('');
      });

      test(`should parse ${state} task with numbered list marker`, () => {
        const line = `1. ${state} test task`;
        const tasks = parser.parseFile(line, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe(state);
        expect(task.completed).toBe(false);
        expect(task.listMarker).toBe('1. ');
        expect(task.text).toBe('test task');
        expect(task.indent).toBe('');
      });

      test(`should parse ${state} task with letter list marker`, () => {
        const line = `a) ${state} test task`;
        const tasks = parser.parseFile(line, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe(state);
        expect(task.completed).toBe(false);
        expect(task.listMarker).toBe('a) ');
        expect(task.text).toBe('test task');
        expect(task.indent).toBe('');
      });

      test(`should parse ${state} task with checkbox`, () => {
        const line = `- [ ] ${state} test task`;
        const tasks = parser.parseFile(line, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe(state);
        expect(task.completed).toBe(false);
        expect(task.listMarker).toBe('- [ ]');
        expect(task.text).toBe('test task');
        expect(task.indent).toBe('');
      });

      test(`should parse ${state} task with indentation`, () => {
        const line = `    - ${state} test task`;
        const tasks = parser.parseFile(line, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe(state);
        expect(task.completed).toBe(false);
        expect(task.listMarker).toBe('- ');
        expect(task.text).toBe('test task');
        expect(task.indent).toBe('    ');
      });

      test(`should parse ${state} task with priority`, () => {
        const line = `- ${state} [#A] high priority task`;
        const tasks = parser.parseFile(line, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe(state);
        expect(task.completed).toBe(false);
        expect(task.priority).toBe('high');
        expect(task.text).toBe('high priority task');
      });

      test(`should parse ${state} task with complex text`, () => {
        const line = `- ${state} task with multiple words and punctuation!`;
        const tasks = parser.parseFile(line, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe(state);
        expect(task.completed).toBe(false);
        expect(task.text).toBe('task with multiple words and punctuation!');
      });
    });
  });

  describe('Default Active States', () => {
    const activeStates = Array.from(DEFAULT_ACTIVE_STATES);
    
    activeStates.forEach(state => {
      test(`should parse ${state} task with basic list marker`, () => {
        const line = `- ${state} test task`;
        const tasks = parser.parseFile(line, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe(state);
        expect(task.completed).toBe(false);
        expect(task.listMarker).toBe('- ');
        expect(task.text).toBe('test task');
        expect(task.indent).toBe('');
      });

      test(`should parse ${state} task with checkbox`, () => {
        const line = `- [ ] ${state} test task`;
        const tasks = parser.parseFile(line, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe(state);
        expect(task.completed).toBe(false);
        expect(task.listMarker).toBe('- [ ]');
        expect(task.text).toBe('test task');
        expect(task.indent).toBe('');
      });
    });
  });

  describe('Default Completed States', () => {
    const completedStates = Array.from(DEFAULT_COMPLETED_STATES);
    
    completedStates.forEach(state => {
      test(`should parse ${state} task with basic list marker`, () => {
        const line = `- ${state} test task`;
        const tasks = parser.parseFile(line, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe(state);
        expect(task.completed).toBe(true);
        expect(task.listMarker).toBe('- ');
        expect(task.text).toBe('test task');
        expect(task.indent).toBe('');
      });

      test(`should parse ${state} task with checkbox`, () => {
        const line = `- [x] ${state} test task`;
        const tasks = parser.parseFile(line, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe(state);
        expect(task.completed).toBe(true);
        expect(task.listMarker).toBe('- [x]');
        expect(task.text).toBe('test task');
        expect(task.indent).toBe('');
      });
    });
  });

  describe('Task with SCHEDULED date', () => {
    test('should parse task with SCHEDULED date', () => {
      const content = `- TODO test task\nSCHEDULED: <2024-01-15>`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.completed).toBe(false);
      expect(task.scheduledDate).not.toBeNull();
      expect(task.scheduledDate?.getFullYear()).toBe(2024);
      expect(task.scheduledDate?.getMonth()).toBe(0); // January (0-indexed)
      expect(task.scheduledDate?.getDate()).toBe(15);
    });

    test('should parse task with SCHEDULED date and time', () => {
      const content = `- TODO test task\nSCHEDULED: <2024-01-15 14:30>`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.completed).toBe(false);
      expect(task.scheduledDate).not.toBeNull();
      expect(task.scheduledDate?.getFullYear()).toBe(2024);
      expect(task.scheduledDate?.getMonth()).toBe(0);
      expect(task.scheduledDate?.getDate()).toBe(15);
      expect(task.scheduledDate?.getHours()).toBe(14);
      expect(task.scheduledDate?.getMinutes()).toBe(30);
    });

    test('should parse task with SCHEDULED date and day of week', () => {
      const content = `- TODO test task\nSCHEDULED: <2024-01-15 Mon>`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.completed).toBe(false);
      expect(task.scheduledDate).not.toBeNull();
      expect(task.scheduledDate?.getFullYear()).toBe(2024);
      expect(task.scheduledDate?.getMonth()).toBe(0);
      expect(task.scheduledDate?.getDate()).toBe(15);
    });

    test('should parse task with SCHEDULED date, time and day of week', () => {
      const content = `- TODO test task\nSCHEDULED: <2024-01-15 Mon 14:30>`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.completed).toBe(false);
      expect(task.scheduledDate).not.toBeNull();
      expect(task.scheduledDate?.getFullYear()).toBe(2024);
      expect(task.scheduledDate?.getMonth()).toBe(0);
      expect(task.scheduledDate?.getDate()).toBe(15);
      expect(task.scheduledDate?.getHours()).toBe(14);
      expect(task.scheduledDate?.getMinutes()).toBe(30);
    });
  });

  describe('Task with DEADLINE date', () => {
    test('should parse task with DEADLINE date', () => {
      const content = `- TODO test task\nDEADLINE: <2024-01-20>`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.completed).toBe(false);
      expect(task.deadlineDate).not.toBeNull();
      expect(task.deadlineDate?.getFullYear()).toBe(2024);
      expect(task.deadlineDate?.getMonth()).toBe(0);
      expect(task.deadlineDate?.getDate()).toBe(20);
    });

    test('should parse task with both SCHEDULED and DEADLINE dates', () => {
      const content = `- TODO test task\nSCHEDULED: <2024-01-15>\nDEADLINE: <2024-01-20>`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.completed).toBe(false);
      expect(task.scheduledDate).not.toBeNull();
      expect(task.deadlineDate).not.toBeNull();
      expect(task.scheduledDate?.getDate()).toBe(15);
      expect(task.deadlineDate?.getDate()).toBe(20);
    });
  });

  describe('Task with multiple lines', () => {
    test('should parse multiple tasks from file content', () => {
      const content = `- TODO first task\n- DOING second task\n- DONE third task`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(3);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[1].state).toBe('DOING');
      expect(tasks[2].state).toBe('DONE');
    });

    test('should skip non-task lines', () => {
      const content = `- TODO first task\nThis is not a task\n- DOING second task`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(2);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[1].state).toBe('DOING');
    });

    test('should handle empty lines between tasks', () => {
      const content = `- TODO first task\n\n- DOING second task`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(2);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[1].state).toBe('DOING');
    });
  });

  describe('Edge cases', () => {
    test('should parse task without list marker', () => {
      const line = `TODO test task without list marker`;
      const tasks = parser.parseFile(line, 'test.md');
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.completed).toBe(false);
      expect(task.listMarker).toBe('');
      expect(task.text).toBe('test task without list marker');
      expect(task.indent).toBe('');
    });

    test('should not parse task with incorrect case', () => {
      const line = `- todo test task (lowercase)`;
      const tasks = parser.parseFile(line, 'test.md');
      
      expect(tasks).toHaveLength(0);
    });

    test('should not parse task with partial keyword match', () => {
      const line = `- TOD test task (partial match)`;
      const tasks = parser.parseFile(line, 'test.md');
      
      expect(tasks).toHaveLength(0);
    });

    test('should parse task with keyword at start of text', () => {
      const line = `- TODO TODO test task (keyword in text)`;
      const tasks = parser.parseFile(line, 'test.md');
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.text).toBe('TODO test task (keyword in text)');
    });

    test('should handle task with special characters in text', () => {
      const line = `- TODO test task with @mentions #hashtags and [links]`;
      const tasks = parser.parseFile(line, 'test.md');
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.text).toBe('test task with @mentions #hashtags and [links]');
    });
  });

  describe('Checkbox tasks', () => {
    test('should parse unchecked checkbox task', () => {
      const line = `- [ ] TODO test task`;
      const tasks = parser.parseFile(line, 'test.md');
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.completed).toBe(false);
      expect(task.listMarker).toBe('- [ ]');
      expect(task.text).toBe('test task');
    });

    test('should parse checked checkbox task', () => {
      const line = `- [x] DONE test task`;
      const tasks = parser.parseFile(line, 'test.md');
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('DONE');
      expect(task.completed).toBe(true);
      expect(task.listMarker).toBe('- [x]');
      expect(task.text).toBe('test task');
    });

    test('should parse checked checkbox task with different state', () => {
      const line = `- [x] TODO test task (but checked)`;
      const tasks = parser.parseFile(line, 'test.md');
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.completed).toBe(true); // Checkbox overrides state
      expect(task.listMarker).toBe('- [x]');
      expect(task.text).toBe('test task (but checked)');
    });
  });

  describe('Complex scenarios', () => {
    test('should parse task with all features', () => {
      const content = `- TODO [#A] complex task\nSCHEDULED: <2024-01-15>\nDEADLINE: <2024-01-20>`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.completed).toBe(false);
      expect(task.priority).toBe('high');
      expect(task.text).toBe('complex task');
      expect(task.scheduledDate).not.toBeNull();
      expect(task.deadlineDate).not.toBeNull();
    });

    test('should parse indented task with dates', () => {
      const content = `    - TODO indented task\n    SCHEDULED: <2024-01-15>`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.completed).toBe(false);
      expect(task.indent).toBe('    ');
      expect(task.scheduledDate).not.toBeNull();
    });

    test('should handle multiple date lines correctly', () => {
      const content = `- TODO task with multiple dates\nSCHEDULED: <2024-01-15>\nDEADLINE: <2024-01-20>\nSCHEDULED: <2024-01-16> (should be ignored)`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.completed).toBe(false);
      expect(task.scheduledDate?.getDate()).toBe(15); // First SCHEDULED should be used
      expect(task.deadlineDate?.getDate()).toBe(20);
    });
  });

  describe('Math Block Tasks ($$ delimiters)', () => {
    let parser: TaskParser;
    let settings: TodoTrackerSettings;

    beforeEach(() => {
      settings = {
        refreshInterval: 60,
        includeCodeBlocks: false,
        includeCalloutBlocks: true,
        languageCommentSupport: {
          enabled: false,
          languages: []
        },
        additionalTaskKeywords: [],
        taskViewMode: 'default'
      };
      parser = TaskParser.create(settings);
    });

    test('should ignore task items inside math blocks', () => {
      const content = `$$
TODO = x + y / z
$$`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(0);
    });

    test('should ignore task items inside multi-line math blocks', () => {
      const content = `$$
TODO = x + y / z
DOING = a + b * c
DONE = result
$$`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(0);
    });

    test('should ignore task items inside math blocks with surrounding text', () => {
      const content = `Some text before

$$
TODO = x + y / z
$$

Some text after`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(0);
    });

    test('should parse tasks outside math blocks', () => {
      const content = `$$
TODO = x + y / z
$$

- TODO real task`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      expect(task.state).toBe('TODO');
      expect(task.completed).toBe(false);
      expect(task.text).toBe('real task');
    });

    test('should parse tasks before and after math blocks', () => {
      const content = `- TODO first task

$$
TODO = x + y / z
$$

- TODO second task`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(2);
      expect(tasks[0].state).toBe('TODO');
      expect(tasks[0].text).toBe('first task');
      expect(tasks[1].state).toBe('TODO');
      expect(tasks[1].text).toBe('second task');
    });

    test('should handle nested math blocks correctly', () => {
      const content = `$$
TODO = x + y / z
$$

Some text

$$
DOING = a + b * c
$$

More text`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(0);
    });

    test('should handle incomplete math blocks (no closing $$)', () => {
      const content = `$$
TODO = x + y / z
- TODO this should be ignored since we're still in math block`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(0);
    });

    test('should handle math blocks with indentation', () => {
      const content = `    $$
    TODO = x + y / z
    $$`;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(0);
    });

    test('should not confuse $$ with code block fences', () => {
      const content = `$$
TODO = x + y / z
$$

\`\`\`python
# This is a code block, not a math block
TODO = some code
\`\`\``;
      const tasks = parser.parseFile(content, 'test.md');
      
      expect(tasks).toHaveLength(0);
    });
  });

  describe('Callout Block Tasks', () => {
    let parser: TaskParser;
    let settings: TodoTrackerSettings;

    beforeEach(() => {
      settings = {
        refreshInterval: 60,
        includeCodeBlocks: false,
        includeCalloutBlocks: true,
        languageCommentSupport: {
          enabled: false,
          languages: []
        },
        additionalTaskKeywords: [],
        taskViewMode: 'default'
      };
      parser = TaskParser.create(settings);
    });

    describe('Simple quote blocks', () => {
      test('should parse task in simple quote block', () => {
        const content = '> TODO task in a quote block';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe('TODO');
        expect(task.completed).toBe(false);
        expect(task.text).toBe('task in a quote block');
        expect(task.rawText).toBe('> TODO task in a quote block');
      });

      test('should parse task in simple quote block without space', () => {
        const content = '>TODO task in a quote block';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe('TODO');
        expect(task.completed).toBe(false);
        expect(task.text).toBe('task in a quote block');
        expect(task.rawText).toBe('>TODO task in a quote block');
      });

      test('should parse task in simple quote block with extra space', () => {
        const content = '>  TODO task in a quote block';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe('TODO');
        expect(task.completed).toBe(false);
        expect(task.text).toBe('task in a quote block');
        expect(task.rawText).toBe('>  TODO task in a quote block');
      });

      test('should parse task in simple quote block with bullet', () => {
        const content = '> - TODO task in a quote block';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe('TODO');
        expect(task.completed).toBe(false);
        expect(task.text).toBe('task in a quote block');
        expect(task.rawText).toBe('> - TODO task in a quote block');
      });


      test('should parse task in multi-line quote block', () => {
        const content = '> TODO first task\n> DOING second task\n> DONE third task';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(3);
        expect(tasks[0].state).toBe('TODO');
        expect(tasks[1].state).toBe('DOING');
        expect(tasks[2].state).toBe('DONE');
      });

      test('should handle mixed content with quote block', () => {
        const content = '- TODO regular task\n> TODO task in quote\n- DOING another regular task';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(3);
        expect(tasks[0].state).toBe('TODO');
        expect(tasks[1].state).toBe('TODO');
        expect(tasks[2].state).toBe('DOING');
      });

      test('should exit quote block when line does not start with >', () => {
        const content = '> TODO task in quote\nThis is not a quote\n> TODO another task';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(2);
        expect(tasks[0].state).toBe('TODO');
        expect(tasks[1].state).toBe('TODO');
      });
    });

    describe('Info callout blocks', () => {
      test('should parse task in info block', () => {
        const content = '>[!info] \n> TODO task in a info block';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe('TODO');
        expect(task.completed).toBe(false);
        expect(task.text).toBe('task in a info block');
        expect(task.rawText).toBe('> TODO task in a info block');
      });

      test('should parse task in info block title', () => {
        const content = '>[!info] TODO task in info block title';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe('TODO');
        expect(task.completed).toBe(false);
        expect(task.text).toBe('task in info block title');
        expect(task.rawText).toBe('>[!info] TODO task in info block title');
      });

      test('should parse task in collapsible info block', () => {
        const content = '>[!info]-\n> TODO task with checkbox in expandable info block';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe('TODO');
        expect(task.completed).toBe(false);
        expect(task.text).toBe('task with checkbox in expandable info block');
        expect(task.rawText).toBe('> TODO task with checkbox in expandable info block');
      });

      test('should parse multiple tasks in info block', () => {
        const content = '>[!info] \n> TODO first task\n> DOING second task\n> DONE third task';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(3);
        expect(tasks[0].state).toBe('TODO');
        expect(tasks[1].state).toBe('DOING');
        expect(tasks[2].state).toBe('DONE');
      });
    });

    describe('Other callout block types', () => {
      const calloutTypes = ['note', 'tip', 'faq', 'example', 'abstract', 'todo'];
      
      calloutTypes.forEach(type => {
        test(`should parse task in ${type} block`, () => {
          const content = `>[!${type}] \n> TODO task in ${type} block`;
          const tasks = parser.parseFile(content, 'test.md');
          
          expect(tasks).toHaveLength(1);
          const task = tasks[0];
          expect(task.state).toBe('TODO');
          expect(task.completed).toBe(false);
          expect(task.text).toBe(`task in ${type} block`);
        });

        test(`should parse task in collapsible ${type} block`, () => {
          const content = `>[!${type}]-\n> TODO task in collapsible ${type} block`;
          const tasks = parser.parseFile(content, 'test.md');
          
          expect(tasks).toHaveLength(1);
          const task = tasks[0];
          expect(task.state).toBe('TODO');
          expect(task.completed).toBe(false);
          expect(task.text).toBe(`task in collapsible ${type} block`);
        });
      });
    });

    describe('Callout block with dates', () => {
      test('should parse task with SCHEDULED date in callout block', () => {
        const content = '>[!info] \n> TODO test task\n> SCHEDULED: <2024-01-15>';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe('TODO');
        expect(task.completed).toBe(false);
        expect(task.scheduledDate).not.toBeNull();
        expect(task.scheduledDate?.getFullYear()).toBe(2024);
        expect(task.scheduledDate?.getMonth()).toBe(0);
        expect(task.scheduledDate?.getDate()).toBe(15);
      });

      test('should parse task with DEADLINE date in callout block', () => {
        const content = '>[!note] \n> TODO test task\n> DEADLINE: <2024-01-20>';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe('TODO');
        expect(task.completed).toBe(false);
        expect(task.deadlineDate).not.toBeNull();
        expect(task.deadlineDate?.getFullYear()).toBe(2024);
        expect(task.deadlineDate?.getMonth()).toBe(0);
        expect(task.deadlineDate?.getDate()).toBe(20);
      });

      test('should parse task with both SCHEDULED and DEADLINE dates in callout block, no space', () => {
        const content = '>[!tip] \n>TODO test task\n>SCHEDULED: <2024-01-15>\n>DEADLINE: <2024-01-20>';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe('TODO');
        expect(task.completed).toBe(false);
        expect(task.scheduledDate).not.toBeNull();
        expect(task.deadlineDate).not.toBeNull();
        expect(task.scheduledDate?.getDate()).toBe(15);
        expect(task.deadlineDate?.getDate()).toBe(20);
      });
    });

    describe('Callout block with checkboxes', () => {
      test('should parse unchecked checkbox task in callout block', () => {
        const content = '>[!info] \n> - [ ] TODO test task';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe('TODO');
        expect(task.completed).toBe(false);
        expect(task.listMarker).toBe('- [ ]');
        expect(task.text).toBe('test task');
      });

      test('should parse checked checkbox task in callout block', () => {
        const content = '>[!note] \n> - [x] DONE test task';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe('DONE');
        expect(task.completed).toBe(true);
        expect(task.listMarker).toBe('- [x]');
        expect(task.text).toBe('test task');
      });
    });

    describe('Callout block with priorities', () => {
      test('should parse task with priority in callout block', () => {
        const content = '>[!tip] \n> - TODO [#A] high priority task';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe('TODO');
        expect(task.completed).toBe(false);
        expect(task.priority).toBe('high');
        expect(task.text).toBe('high priority task');
      });
    });

    describe('Disabled callout blocks', () => {
      beforeEach(() => {
        settings.includeCalloutBlocks = false;
        parser = TaskParser.create(settings);
      });

      test('should not parse tasks in callout blocks when disabled', () => {
        const content = '>[!info] \n> TODO task in info block\n- TODO regular task';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe('TODO');
        expect(task.text).toBe('regular task');
        expect(task.rawText).toBe('- TODO regular task');
      });

      test('should not parse tasks in simple quote blocks when disabled', () => {
        const content = '> TODO task in quote block\n- TODO regular task';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe('TODO');
        expect(task.text).toBe('regular task');
        expect(task.rawText).toBe('- TODO regular task');
      });
    });

    describe('Complex scenarios', () => {
      test('should parse mixed content with various callout blocks', () => {
        const content = `
- TODO regular task
>[!info]
> TODO task in info block

>[!note]-
> DOING task in collapsible note
> - [ ] TODO checkbox task
>[!tip] TODO task in title
- DOING another regular task
`;
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(6);
        expect(tasks[0].state).toBe('TODO');
        expect(tasks[0].text).toBe('regular task');
        expect(tasks[1].state).toBe('TODO');
        expect(tasks[1].text).toBe('task in info block');
        expect(tasks[2].state).toBe('DOING');
        expect(tasks[2].text).toBe('task in collapsible note');
        expect(tasks[3].state).toBe('TODO');
        expect(tasks[3].text).toBe('checkbox task');
        expect(tasks[4].state).toBe('TODO');
        expect(tasks[4].text).toBe('task in title');
        expect(tasks[5].state).toBe('DOING');
        expect(tasks[5].text).toBe('another regular task');
      });

      test('should handle nested callout blocks (should not happen in Obsidian)', () => {
        const content = '>[!info] \n> >[!note] \n> > TODO nested task';
        const tasks = parser.parseFile(content, 'test.md');
        
        expect(tasks).toHaveLength(1);
        const task = tasks[0];
        expect(task.state).toBe('TODO');
        expect(task.text).toBe('nested task');
      });
    });
  });
});