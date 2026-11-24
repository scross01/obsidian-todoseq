// Closure-snapshot staleness: rapid cycling inside the 50 ms-delayed
// recurrence window may overwrite the file. Re-resolve from the state
// manager when rawText diverges, keeping the trigger's date/repeat.

import { RecurrenceCoordinator } from '../src/services/recurrence-coordinator';
import { TaskStateManager } from '../src/services/task-state-manager';
import { App, TFile } from 'obsidian';
import { Task } from '../src/types/task';
import {
  createTestKeywordManager,
  createBaseSettings,
} from './helpers/test-helper';

const originalDebug = console.debug;
const originalError = console.error;

beforeAll(() => {
  console.debug = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.debug = originalDebug;
  console.error = originalError;
});

const mockFile = new TFile('test.md', 'test.md', 'md');
Object.assign(mockFile, {
  stat: { mtime: Date.now(), ctime: Date.now(), size: 100 },
});

const mockParser = {
  getDateLineType: jest.fn(),
  parseFile: jest.fn(),
};

const mockApp = {
  vault: {
    getAbstractFileByPath: jest.fn().mockReturnValue(mockFile),
    read: jest.fn().mockResolvedValue('- [x] Test task'),
    modify: jest.fn().mockResolvedValue(undefined),
  },
  plugins: {
    getPlugin: jest.fn().mockReturnValue({
      vaultScanner: {
        getParser: () => mockParser,
      },
    }),
  },
} as unknown as App;

const mockPlugin = {
  app: mockApp,
  settings: createBaseSettings(),
} as any;

const keywordManager = createTestKeywordManager();

describe('RecurrenceCoordinator - stale task re-resolution', () => {
  let coordinator: RecurrenceCoordinator;
  let mockTaskStateManager: TaskStateManager;
  let mockUpdateCoordinator: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockParser.getDateLineType.mockReturnValue('scheduled');
    mockTaskStateManager = {
      findTaskByPathAndLine: jest.fn(),
      updateTask: jest.fn(),
      getTasks: jest.fn(() => []),
      setTasks: jest.fn(),
    } as unknown as TaskStateManager;
    mockParser.parseFile.mockImplementation(() =>
      mockTaskStateManager.getTasks(),
    );
    coordinator = new RecurrenceCoordinator(
      mockPlugin,
      mockTaskStateManager,
      keywordManager,
      {},
    );
    mockUpdateCoordinator = {
      updateTaskRecurrence: jest.fn().mockResolvedValue(undefined),
    };
    coordinator.setTaskUpdateCoordinator(mockUpdateCoordinator);
  });

  afterEach(() => {
    coordinator.destroy();
  });

  const createBaseTask = (): Task => ({
    path: 'test.md',
    line: 0,
    // This is what the user-clicked cycle captured: stale rawText=DOING
    // even though the cycle processed correctly and the file now shows TODO.
    rawText: '- [ ] DOING my task',
    text: 'my task',
    state: 'DOING',
    completed: false,
    scheduledDate: new Date('2026-06-24'),
    deadlineDate: new Date('2026-06-24'),
    scheduledDateRepeat: {
      type: '+' as const,
      unit: 'd' as const,
      value: 1,
      raw: '+1d',
    },
    deadlineDateRepeat: {
      type: '+' as const,
      unit: 'd' as const,
      value: 1,
      raw: '+1d',
    },
    priority: null,
    tags: [],
    indent: '',
    listMarker: '',
    urgency: null,
    isDailyNote: false,
    dailyNoteDate: null,
    subtaskCount: 0,
    subtaskCompletedCount: 0,
    closedDate: null,
  });

  it('refreshes content fields from state manager when rawText has changed', async () => {
    // The live file shows the cycle result (TODO) but the closure still
    // holds the pre-cycle snapshot (DOING). The fix must catch this stale
    // rawText and use the up-to-date stored task.
    const staleTask = createBaseTask();
    const storedTask: Task = {
      ...staleTask,
      rawText: '- [ ] TODO my task',
      text: 'my task',
      state: 'TODO',
      completed: false,
    };
    (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([storedTask]);
    (mockApp.vault.read as jest.Mock).mockResolvedValue(
      '- [ ] TODO my task\n  DEADLINE: <2026-06-24 Wed +1d>',
    );

    await coordinator.performRecurrenceUpdate(staleTask);

    expect(mockParser.parseFile).toHaveBeenCalledWith(
      '- [ ] TODO my task\n  DEADLINE: <2026-06-24 Wed +1d>',
      'test.md',
    );
    expect(mockUpdateCoordinator.updateTaskRecurrence).toHaveBeenCalledTimes(1);
    const [passedTask, _options] =
      mockUpdateCoordinator.updateTaskRecurrence.mock.calls[0];
    // After re-resolution, the newStateForRecurrence path should rebuild
    // the line from storedTask.rawText instead of staleTask.rawText.
    expect(passedTask.rawText).toBe(storedTask.rawText);
    expect(passedTask.text).toBe(storedTask.text);
    expect(passedTask.state).toBe(storedTask.state);
  });

  it('uses a moved identity instead of the captured line', async () => {
    const staleTask = { ...createBaseTask(), id: 'recurring' };
    const movedTask: Task = {
      ...staleTask,
      line: 3,
      rawText: '- [ ] TODO my task',
      state: 'TODO',
      completed: false,
    };
    (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([movedTask]);
    (mockTaskStateManager.findTaskByPathAndLine as jest.Mock).mockReturnValue(
      null,
    );
    (mockApp.vault.read as jest.Mock).mockResolvedValue(
      'one\ntwo\nthree\n- [ ] TODO my task\n  SCHEDULED: <2026-06-24 Wed +1d>',
    );

    await coordinator.performRecurrenceUpdate(staleTask);

    const [passedTask] =
      mockUpdateCoordinator.updateTaskRecurrence.mock.calls[0];
    expect(passedTask.line).toBe(3);
    expect(passedTask.rawText).toBe(movedTask.rawText);
  });

  it('keeps original date/repeat fields when re-resolving', async () => {
    // The recurrence was scheduled because the DEADLINE had +1d repeat. The
    // fix must NOT swap the deadline repeat to whatever is in the stored
    // task — those date fields are what triggered the recurrence and must
    // be preserved.
    const staleTask = createBaseTask();
    const storedTask: Partial<Task> = {
      ...staleTask,
      rawText: '- [ ] TODO my task',
      text: 'my task',
      state: 'TODO',
    };
    (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([storedTask]);
    (mockApp.vault.read as jest.Mock).mockResolvedValue(
      '- [ ] TODO my task\n  DEADLINE: <2026-06-24 Wed +1d>',
    );

    await coordinator.performRecurrenceUpdate(staleTask);

    const [passedTask] =
      mockUpdateCoordinator.updateTaskRecurrence.mock.calls[0];
    expect(passedTask.scheduledDateRepeat).toEqual(
      staleTask.scheduledDateRepeat,
    );
    expect(passedTask.deadlineDateRepeat).toEqual(staleTask.deadlineDateRepeat);
  });

  it('refuses a removed target instead of reusing the captured snapshot', async () => {
    const staleTask = createBaseTask();
    const sibling: Task = {
      ...staleTask,
      line: 0,
      text: 'another task',
      rawText: '- [ ] TODO another task',
      state: 'TODO',
    };
    (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([sibling]);
    (mockApp.vault.read as jest.Mock).mockResolvedValue(
      '- [ ] TODO another task\n  DEADLINE: <2026-06-24 Wed +1d>',
    );

    const result = await coordinator.performRecurrenceUpdate(staleTask);

    expect(result.success).toBe(false);
    expect(mockUpdateCoordinator.updateTaskRecurrence).not.toHaveBeenCalled();
  });

  it('keeps the original task when stored rawText matches (content unchanged)', async () => {
    // No cycle happened since scheduling — no need to swap the task. The
    // gate `storedTask.rawText !== task.rawText` must be a strict
    // inequality so a matching stored task is left alone.
    const staleTask = createBaseTask();
    const storedTask: Task = {
      ...staleTask,
      // Same rawText: closure and state manager agree, so keep the closure
      // (avoids pointless copies and preserves any extra fields like
      // subtaskCount that the merge in the fix doesn't touch).
      rawText: staleTask.rawText,
    };
    (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([storedTask]);
    (mockApp.vault.read as jest.Mock).mockResolvedValue(
      '- [ ] DOING my task\n  DEADLINE: <2026-06-24 Wed +1d>',
    );

    await coordinator.performRecurrenceUpdate(staleTask);

    const [passedTask] =
      mockUpdateCoordinator.updateTaskRecurrence.mock.calls[0];
    expect(passedTask).toBe(staleTask);
  });

  it('does not crash when stored task has different defined fields', async () => {
    // Stored task may be missing optional fields (e.g. subtaskCount). The
    // merge must not depend on any of them being present.
    const staleTask = createBaseTask();
    const storedTask: Partial<Task> = {
      path: 'test.md',
      line: 0,
      rawText: '- [ ] TODO my task',
      text: 'my task',
      state: 'TODO',
      completed: false,
    };
    (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([storedTask]);
    (mockApp.vault.read as jest.Mock).mockResolvedValue(
      '- [ ] TODO my task\n  DEADLINE: <2026-06-24 Wed +1d>',
    );

    const result = await coordinator.performRecurrenceUpdate(staleTask);

    expect(result.success).toBe(true);
  });

  it('preserves trigger task warning periods even when stored task would overwrite them', async () => {
    // Regression: spread-order bug where ...storedTask landed AFTER ...task
    // and silently overwrote the trigger's scheduled/deadline warning
    // periods. The fix destructures date-bearing fields out of storedTask
    // before spreading so the closure-captured `task` retains every field
    // that drives the recurrence math.
    const staleTask = createBaseTask();
    const storedTask: Task = {
      ...staleTask,
      rawText: '- [ ] TODO my task',
      state: 'TODO',
      scheduledWarningPeriod: {
        value: 99,
        text: '-99d',
        parsed: '-99d',
        isFirstOnly: false,
      } as Task['scheduledWarningPeriod'],
      deadlineWarningPeriod: {
        value: 99,
        text: '-99d',
        parsed: '-99d',
        isFirstOnly: false,
      } as Task['deadlineWarningPeriod'],
      // These Date instances are stale and must NOT leak through the merge.
      scheduledDate: new Date('2000-01-01'),
      deadlineDate: new Date('2000-01-01'),
    };
    (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([storedTask]);
    (mockApp.vault.read as jest.Mock).mockResolvedValue(
      '- [ ] TODO my task\n  DEADLINE: <2026-06-24 Wed +1d>',
    );

    await coordinator.performRecurrenceUpdate(staleTask);

    const [passedTask] =
      mockUpdateCoordinator.updateTaskRecurrence.mock.calls[0];
    expect(passedTask.scheduledWarningPeriod).toEqual(
      staleTask.scheduledWarningPeriod,
    );
    expect(passedTask.deadlineWarningPeriod).toEqual(
      staleTask.deadlineWarningPeriod,
    );
    expect(passedTask.scheduledDate).toBe(staleTask.scheduledDate);
    expect(passedTask.deadlineDate).toBe(staleTask.deadlineDate);
  });

  it('relocates an unanchored row by unique content after a metadata shift', async () => {
    const staleTask = createBaseTask();
    const sibling: Task = {
      ...staleTask,
      line: 0,
      text: 'another task',
      rawText: '- [ ] TODO another task',
      state: 'TODO',
      scheduledDate: new Date(2026, 6, 2),
    };
    const moved: Task = {
      ...staleTask,
      line: 4,
      rawText: '- [ ] TODO my task',
      state: 'TODO',
      scheduledDate: new Date(2026, 6, 3),
    };
    (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([
      sibling,
      moved,
    ]);
    (mockTaskStateManager.findTaskByPathAndLine as jest.Mock).mockReturnValue(
      sibling,
    );
    (mockApp.vault.read as jest.Mock).mockResolvedValue(
      [
        '- [ ] TODO another task',
        '  SCHEDULED: <2026-07-02 Thu +1d>',
        '',
        '',
        '- [ ] TODO my task',
        '  SCHEDULED: <2026-07-03 Fri +1d>',
      ].join('\n'),
    );

    const result = await coordinator.performRecurrenceUpdate(staleTask);

    expect(result.success).toBe(true);
    const [passedTask] =
      mockUpdateCoordinator.updateTaskRecurrence.mock.calls[0];
    expect(passedTask.line).toBe(4);
    expect(passedTask.text).toBe('my task');
    expect(passedTask.scheduledDate).toEqual(staleTask.scheduledDate);
  });

  it('accepts rapid keyword cycling when the row content is otherwise stable', async () => {
    const staleTask = createBaseTask();
    const liveTask: Task = {
      ...staleTask,
      rawText: '- [ ] TODO my task',
      state: 'TODO',
    };
    (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([liveTask]);
    (mockTaskStateManager.findTaskByPathAndLine as jest.Mock).mockReturnValue(
      liveTask,
    );
    (mockApp.vault.read as jest.Mock).mockResolvedValue(
      '- [ ] TODO my task\n  DEADLINE: <2026-06-24 Wed +1d>',
    );

    const result = await coordinator.performRecurrenceUpdate(staleTask);

    expect(result.success).toBe(true);
    const [passedTask] =
      mockUpdateCoordinator.updateTaskRecurrence.mock.calls[0];
    expect(passedTask.rawText).toBe(liveTask.rawText);
    expect(passedTask.state).toBe('TODO');
  });

  it('refuses a moved row when both identity and content are ambiguous', async () => {
    const staleTask = createBaseTask();
    const sibling: Task = {
      ...staleTask,
      line: 0,
      rawText: '- [ ] TODO my task',
      state: 'TODO',
    };
    const duplicate: Task = {
      ...staleTask,
      line: 4,
      rawText: '- [ ] TODO my task',
      state: 'TODO',
    };
    (mockTaskStateManager.getTasks as jest.Mock).mockReturnValue([
      sibling,
      duplicate,
    ]);
    (mockTaskStateManager.findTaskByPathAndLine as jest.Mock).mockReturnValue(
      sibling,
    );
    (mockApp.vault.read as jest.Mock).mockResolvedValue(
      [
        '- [ ] TODO my task',
        '  SCHEDULED: <2026-06-23 Tue +1d>',
        '',
        '',
        '- [ ] TODO my task',
        '  SCHEDULED: <2026-06-24 Wed +1d>',
      ].join('\n'),
    );

    const result = await coordinator.performRecurrenceUpdate(staleTask);

    expect(result.success).toBe(false);
    expect(mockUpdateCoordinator.updateTaskRecurrence).not.toHaveBeenCalled();
  });

  it('refuses a stale line when no identity resolves', async () => {
    const staleTask = createBaseTask();
    (mockTaskStateManager.findTaskByPathAndLine as jest.Mock).mockReturnValue(
      null,
    );
    (mockApp.vault.read as jest.Mock).mockResolvedValue(
      '- [ ] ARCHIVED my task\n  DEADLINE: <2026-06-24 Wed +1d>',
    );

    const result = await coordinator.performRecurrenceUpdate(staleTask);

    expect(result.success).toBe(false);
    expect(mockUpdateCoordinator.updateTaskRecurrence).not.toHaveBeenCalled();
  });
});
