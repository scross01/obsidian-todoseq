/**
 * Unit tests for urgency calculation
 */

import {
  parseUrgencyCoefficients,
  calculateTaskUrgency,
  getDefaultCoefficients,
  needsUrgencyRecalculation,
} from '../src/utils/task-urgency';
import { Task } from '../src/task';
import { App, Vault, DataAdapter } from 'obsidian';

// Mock Obsidian app for testing
const createMockApp = (): App => {
  return {
    vault: {
      configDir: '.obsidian',
      adapter: {
        read: jest.fn(),
      } as unknown as DataAdapter,
    } as unknown as Vault,
  } as App;
};

// Helper to create a test task
const createTestTask = (overrides: Partial<Task> = {}): Task => ({
  path: 'test.md',
  line: 1,
  rawText: 'Test task',
  indent: '',
  listMarker: '- ',
  text: 'Test task',
  state: 'TODO',
  completed: false,
  priority: null,
  scheduledDate: null,
  deadlineDate: null,
  urgency: null,
  tags: [],
  ...overrides,
});

describe('Urgency Coefficient Parsing', () => {
  it('should parse urgency.ini file correctly', async () => {
    const mockApp = createMockApp();
    const iniContent = `
# Urgency coefficients
urgency.due.coefficient = 12.0
urgency.priority.high.coefficient = 6.0
urgency.priority.medium.coefficient = 3.9
urgency.priority.low.coefficient = 1.8
urgency.scheduled.coefficient = 5.0
urgency.active.coefficient = 4.0
urgency.age.coefficient = 2.0
urgency.tags.coefficient = 1.0
urgency.waiting.coefficient = -3.0
`;

    (mockApp.vault.adapter.read as jest.Mock).mockResolvedValue(iniContent);

    const coefficients = await parseUrgencyCoefficients(mockApp);

    expect(coefficients.priorityHigh).toBe(6.0);
    expect(coefficients.priorityMedium).toBe(3.9);
    expect(coefficients.priorityLow).toBe(1.8);
    expect(coefficients.scheduled).toBe(5.0);
    expect(coefficients.deadline).toBe(12.0); // urgency.due.coefficient should map to deadline
    expect(coefficients.active).toBe(4.0);
    expect(coefficients.age).toBe(2.0);
    expect(coefficients.tags).toBe(1.0);
    expect(coefficients.waiting).toBe(-3.0);

    // Verify the correct path was used
    expect(mockApp.vault.adapter.read).toHaveBeenCalledWith(
      '.obsidian/plugins/todoseq/urgency.ini',
    );
  });

  it('should return default coefficients when file not found', async () => {
    const mockApp = createMockApp();
    (mockApp.vault.adapter.read as jest.Mock).mockRejectedValue(
      new Error('File not found'),
    );

    const coefficients = await parseUrgencyCoefficients(mockApp);
    const defaults = getDefaultCoefficients();

    expect(coefficients).toEqual(defaults);
  });

  it('should return default coefficients on parse error', async () => {
    const mockApp = createMockApp();
    (mockApp.vault.adapter.read as jest.Mock).mockRejectedValue(
      new Error('Parse error'),
    );

    const coefficients = await parseUrgencyCoefficients(mockApp);
    const defaults = getDefaultCoefficients();

    expect(coefficients).toEqual(defaults);
  });

  it('should handle malformed lines gracefully', async () => {
    const mockApp = createMockApp();
    const iniContent = `
urgency.due.coefficient = 12.0
malformed line here
urgency.priority.high.coefficient = 6.0
# Comment line
urgency.invalid.format = 99.0
`;

    (mockApp.vault.adapter.read as jest.Mock).mockResolvedValue(iniContent);

    const coefficients = await parseUrgencyCoefficients(mockApp);

    expect(coefficients.deadline).toBe(12.0); // Should map to deadline
    expect(coefficients.priorityHigh).toBe(6.0);
    // Invalid lines should be ignored
  });

  it('should handle negative coefficient values correctly', async () => {
    const mockApp = createMockApp();
    const iniContent = `
urgency.due.coefficient = -12.0
urgency.priority.high.coefficient = 6.0
urgency.priority.medium.coefficient = 3.9
urgency.priority.low.coefficient = 1.8
urgency.scheduled.coefficient = -4.0
urgency.active.coefficient = 4.0
urgency.age.coefficient = 2.0
urgency.tags.coefficient = 1.0
urgency.waiting.coefficient = -3.0
`;

    (mockApp.vault.adapter.read as jest.Mock).mockResolvedValue(iniContent);

    const coefficients = await parseUrgencyCoefficients(mockApp);

    expect(coefficients.deadline).toBe(-12.0); // urgency.due.coefficient maps to deadline
    expect(coefficients.scheduled).toBe(-4.0);
    expect(coefficients.waiting).toBe(-3.0);
    expect(coefficients.priorityHigh).toBe(6.0);
    expect(coefficients.priorityMedium).toBe(3.9);
    expect(coefficients.priorityLow).toBe(1.8);
    expect(coefficients.active).toBe(4.0);
    expect(coefficients.age).toBe(2.0);
    expect(coefficients.tags).toBe(1.0);
  });
});

describe('Urgency Calculation', () => {
  const defaultCoefficients = getDefaultCoefficients();

  it('should return null for completed tasks', () => {
    const task = createTestTask({ completed: true });
    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    expect(urgency).toBeNull();
  });

  it('should calculate urgency with deadline date (7 days overdue)', () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const task = createTestTask({
      deadlineDate: sevenDaysAgo,
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    // getDeadlineUrgency returns 1.0, multiplied by 12.0 = 12.0
    expect(urgency).toBeCloseTo(12.0, 2);
  });

  it('should calculate urgency with deadline date (today)', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const task = createTestTask({
      deadlineDate: today,
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    // getDeadlineUrgency returns ~0.733, multiplied by 12.0 ≈ 8.8
    expect(urgency).toBeCloseTo(8.8, 2);
  });

  it('should add urgency for future deadline dates', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const task = createTestTask({
      deadlineDate: tomorrow,
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    // getDeadlineUrgency returns ~0.695, multiplied by 12.0 ≈ 8.34
    expect(urgency).toBeCloseTo(8.34, 2);
  });

  it('should calculate urgency with priority high', () => {
    const task = createTestTask({
      priority: 'high',
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    expect(urgency).toBe(defaultCoefficients.priorityHigh);
  });

  it('should calculate urgency with priority medium', () => {
    const task = createTestTask({
      priority: 'med',
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    expect(urgency).toBe(defaultCoefficients.priorityMedium);
  });

  it('should calculate urgency with priority low', () => {
    const task = createTestTask({
      priority: 'low',
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    expect(urgency).toBe(defaultCoefficients.priorityLow);
  });

  it('should handle tasks with no priority', () => {
    const task = createTestTask({
      priority: null,
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    expect(urgency).toBe(0);
  });

  it('should add urgency for scheduled date (today)', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const task = createTestTask({
      scheduledDate: today,
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    // getScheduledUrgency returns 1.0, multiplied by 5.0 = 5.0
    expect(urgency).toBe(defaultCoefficients.scheduled);
  });

  it('should add urgency for scheduled date (past)', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const task = createTestTask({
      scheduledDate: yesterday,
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    // getScheduledUrgency returns 1.0, multiplied by 5.0 = 5.0
    expect(urgency).toBe(defaultCoefficients.scheduled);
  });

  it('should NOT add urgency for future scheduled dates', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const task = createTestTask({
      scheduledDate: tomorrow,
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    // getScheduledUrgency returns 0, so no scheduled urgency
    expect(urgency).toBe(0);
  });

  it('should add urgency for deadline date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    future.setHours(0, 0, 0, 0);

    const task = createTestTask({
      deadlineDate: future,
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    // getDeadlineUrgency returns ~0.543, multiplied by 12.0 ≈ 6.51
    expect(urgency).toBeCloseTo(6.51, 2);
  });

  it('should use both scheduled and deadline when both exist', () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 2);
    soon.setHours(0, 0, 0, 0);

    const later = new Date();
    later.setDate(later.getDate() + 5);
    later.setHours(0, 0, 0, 0);

    const task = createTestTask({
      scheduledDate: soon,
      deadlineDate: later,
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    // Scheduled urgency: 0 (future date)
    // Deadline urgency: ~0.543 * 12.0 ≈ 6.51
    // Total ≈ 6.51
    expect(urgency).toBeCloseTo(6.51, 2);
  });

  it('should use both scheduled and deadline when both exist (scheduled is past)', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const later = new Date();
    later.setDate(later.getDate() + 5);
    later.setHours(0, 0, 0, 0);

    const task = createTestTask({
      scheduledDate: yesterday,
      deadlineDate: later,
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    // Scheduled urgency: 5.0 (past date)
    // Deadline urgency: ~0.543 * 12.0 ≈ 6.51
    // Total ≈ 5.0 + 6.51 = 11.51
    expect(urgency).toBeCloseTo(11.51, 2);
  });

  it('should add urgency for active states', () => {
    const task = createTestTask({
      state: 'DOING',
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    expect(urgency).toBe(defaultCoefficients.active);
  });

  it('should add urgency for each tag', () => {
    const task = createTestTask({
      tags: ['work', 'urgent', 'project'],
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    expect(urgency).toBe(3 * defaultCoefficients.tags);
  });

  it('should handle empty tags array', () => {
    const task = createTestTask({
      tags: [],
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    expect(urgency).toBe(0);
  });

  it('should subtract urgency for waiting state', () => {
    const task = createTestTask({
      state: 'WAIT',
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    expect(urgency).toBe(defaultCoefficients.waiting);
  });

  it('should calculate combined urgency correctly', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const task = createTestTask({
      priority: 'high',
      deadlineDate: today,
      tags: ['work'],
      state: 'DOING',
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    // getDeadlineUrgency = ~0.733, * 12.0 ≈ 8.8
    // + priorityHigh (6.0) + active (4.0) + tags (1.0)
    // Total ≈ 8.8 + 6.0 + 4.0 + 1.0 = 19.8
    expect(urgency).toBeCloseTo(19.8, 2);
  });

  it('should handle task with no urgency factors', () => {
    const task = createTestTask();
    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    expect(urgency).toBe(0);
  });
});

describe('Urgency Recalculation Logic', () => {
  it('should require recalculation when priority changes', () => {
    const changes = ['priority'];
    expect(needsUrgencyRecalculation(createTestTask(), changes)).toBe(true);
  });

  it('should require recalculation when scheduled date changes', () => {
    const changes = ['scheduledDate'];
    expect(needsUrgencyRecalculation(createTestTask(), changes)).toBe(true);
  });

  it('should require recalculation when deadline date changes', () => {
    const changes = ['deadlineDate'];
    expect(needsUrgencyRecalculation(createTestTask(), changes)).toBe(true);
  });

  it('should require recalculation when state changes', () => {
    const changes = ['state'];
    expect(needsUrgencyRecalculation(createTestTask(), changes)).toBe(true);
  });

  it('should require recalculation when tags change', () => {
    const changes = ['tags'];
    expect(needsUrgencyRecalculation(createTestTask(), changes)).toBe(true);
  });

  it('should require recalculation when completion status changes', () => {
    const changes = ['completed'];
    expect(needsUrgencyRecalculation(createTestTask(), changes)).toBe(true);
  });

  it('should not require recalculation for unrelated changes', () => {
    const changes = ['text', 'path', 'line'];
    expect(needsUrgencyRecalculation(createTestTask(), changes)).toBe(false);
  });

  it('should require recalculation for multiple relevant changes', () => {
    const changes = ['text', 'priority', 'tags'];
    expect(needsUrgencyRecalculation(createTestTask(), changes)).toBe(true);
  });
});

describe('Default Coefficients', () => {
  it('should return correct default values', () => {
    const defaults = getDefaultCoefficients();

    expect(defaults.priorityHigh).toBe(6.0);
    expect(defaults.priorityMedium).toBe(3.9);
    expect(defaults.priorityLow).toBe(1.8);
    expect(defaults.scheduled).toBe(5.0);
    expect(defaults.deadline).toBe(12.0);
    expect(defaults.active).toBe(4.0);
    expect(defaults.age).toBe(2.0);
    expect(defaults.tags).toBe(1.0);
    expect(defaults.waiting).toBe(-3.0);
  });

  it('should return a new object each time (no mutation)', () => {
    const first = getDefaultCoefficients();
    const second = getDefaultCoefficients();

    // Should be different objects
    expect(first).not.toBe(second);
    // But with same values
    expect(first).toEqual(second);
  });
});
