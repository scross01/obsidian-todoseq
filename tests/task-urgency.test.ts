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
import { TFile, App, Vault } from 'obsidian';

// Mock Obsidian app for testing
const createMockApp = (): App => {
  return {
    vault: {
      getAbstractFileByPath: jest.fn(),
      read: jest.fn(),
    } as unknown as Vault,
  } as App;
};

// Helper to create a test task
const createTestTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'test-task',
  text: 'Test task',
  path: 'test.md',
  line: 1,
  lineEnd: 1,
  completed: false,
  state: 'TODO',
  priority: null,
  scheduledDate: null,
  deadlineDate: null,
  tags: [],
  urgency: null,
  ...overrides,
});

describe('Urgency Coefficient Parsing', () => {
  it('should parse urgency.ini file correctly', async () => {
    const mockApp = createMockApp();
    const mockFile = { path: 'src/urgency.ini' } as TFile;
    const iniContent = `
# Urgency coefficients
urgency.due.coefficient = 12.0
urgency.priority.high.coefficient = 6.0
urgency.priority.medium.coefficient = 3.9
urgency.priority.low.coefficient = 1.8
urgency.scheduled.coefficient = 5.0
urgency.deadline.coefficient = 5.0
urgency.active.coefficient = 4.0
urgency.age.coefficient = 2.0
urgency.tags.coefficient = 1.0
urgency.waiting.coefficient = -3.0
`;

    (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
      mockFile,
    );
    (mockApp.vault.read as jest.Mock).mockResolvedValue(iniContent);

    const coefficients = await parseUrgencyCoefficients(mockApp);

    expect(coefficients.due).toBe(12.0);
    expect(coefficients.priorityHigh).toBe(6.0);
    expect(coefficients.priorityMedium).toBe(3.9);
    expect(coefficients.priorityLow).toBe(1.8);
    expect(coefficients.scheduled).toBe(5.0);
    expect(coefficients.deadline).toBe(5.0);
    expect(coefficients.active).toBe(4.0);
    expect(coefficients.age).toBe(2.0);
    expect(coefficients.tags).toBe(1.0);
    expect(coefficients.waiting).toBe(-3.0);
  });

  it('should return default coefficients when file not found', async () => {
    const mockApp = createMockApp();
    (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

    const coefficients = await parseUrgencyCoefficients(mockApp);
    const defaults = getDefaultCoefficients();

    expect(coefficients).toEqual(defaults);
  });

  it('should return default coefficients on parse error', async () => {
    const mockApp = createMockApp();
    const mockFile = { path: 'src/urgency.ini' } as TFile;

    (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
      mockFile,
    );
    (mockApp.vault.read as jest.Mock).mockRejectedValue(
      new Error('Parse error'),
    );

    const coefficients = await parseUrgencyCoefficients(mockApp);
    const defaults = getDefaultCoefficients();

    expect(coefficients).toEqual(defaults);
  });

  it('should handle malformed lines gracefully', async () => {
    const mockApp = createMockApp();
    const mockFile = { path: 'src/urgency.ini' } as TFile;
    const iniContent = `
urgency.due.coefficient = 12.0
malformed line here
urgency.priority.high.coefficient = 6.0
# Comment line
urgency.invalid.format = 99.0
`;

    (mockApp.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(
      mockFile,
    );
    (mockApp.vault.read as jest.Mock).mockResolvedValue(iniContent);

    const coefficients = await parseUrgencyCoefficients(mockApp);

    expect(coefficients.due).toBe(12.0);
    expect(coefficients.priorityHigh).toBe(6.0);
    // Invalid lines should be ignored
  });
});

describe('Urgency Calculation', () => {
  const defaultCoefficients = getDefaultCoefficients();

  it('should return null for completed tasks', () => {
    const task = createTestTask({ completed: true });
    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    expect(urgency).toBeNull();
  });

  it('should calculate urgency with due date (overdue)', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const task = createTestTask({
      scheduledDate: yesterday,
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    expect(urgency).toBeGreaterThan(0);
    expect(urgency).toBeGreaterThanOrEqual(defaultCoefficients.due);
  });

  it('should calculate urgency with due date (today)', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const task = createTestTask({
      scheduledDate: today,
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    expect(urgency).toBeGreaterThan(0);
    expect(urgency).toBeGreaterThanOrEqual(defaultCoefficients.due);
  });

  it('should not add due urgency for future dates', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const task = createTestTask({
      scheduledDate: tomorrow,
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    // Future scheduled dates add scheduled coefficient but not due coefficient
    expect(urgency).toBe(defaultCoefficients.scheduled);
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

  it('should add urgency for scheduled date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);

    const task = createTestTask({
      scheduledDate: future,
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    expect(urgency).toBe(defaultCoefficients.scheduled);
  });

  it('should add urgency for deadline date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);

    const task = createTestTask({
      deadlineDate: future,
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    expect(urgency).toBe(defaultCoefficients.deadline);
  });

  it('should use earliest date when both scheduled and deadline exist', () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 2);

    const later = new Date();
    later.setDate(later.getDate() + 5);

    const task = createTestTask({
      scheduledDate: soon,
      deadlineDate: later,
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    // Should only count scheduled once (earliest)
    expect(urgency).toBe(defaultCoefficients.scheduled);
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
      scheduledDate: today,
      tags: ['work'],
      state: 'DOING',
      urgency: null,
    });

    const urgency = calculateTaskUrgency(task, defaultCoefficients);
    const expected =
      defaultCoefficients.due +
      defaultCoefficients.priorityHigh +
      defaultCoefficients.scheduled +
      defaultCoefficients.tags +
      defaultCoefficients.active;

    expect(urgency).toBe(expected);
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

    expect(defaults.due).toBe(12.0);
    expect(defaults.priorityHigh).toBe(6.0);
    expect(defaults.priorityMedium).toBe(3.9);
    expect(defaults.priorityLow).toBe(1.8);
    expect(defaults.scheduled).toBe(5.0);
    expect(defaults.deadline).toBe(5.0);
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
