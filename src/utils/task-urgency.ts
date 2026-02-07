import { Task } from '../types/task';
import { App } from 'obsidian';
import { DateUtils } from './date-utils';

/**
 * Urgency coefficients interface matching the urgency.ini configuration
 */
export interface UrgencyCoefficients {
  priorityHigh: number;
  priorityMedium: number;
  priorityLow: number;
  scheduled: number;
  deadline: number;
  active: number;
  age: number;
  tags: number;
  waiting: number;
}

/**
 * Default urgency coefficients (fallback if INI parsing fails)
 */
const DEFAULT_URGENCY_COEFFICIENTS: UrgencyCoefficients = {
  priorityHigh: 6.0,
  priorityMedium: 3.9,
  priorityLow: 1.8,
  scheduled: 5.0,
  deadline: 12.0,
  active: 4.0,
  age: 2.0,
  tags: 1.0,
  waiting: -3.0,
};

/**
 * Parse urgency coefficients from urgency.ini file content
 * @param content The content of urgency.ini file
 * @returns UrgencyCoefficients object
 */
export function parseUrgencyCoefficientsFromContent(
  content: string,
): UrgencyCoefficients {
  const coefficients = { ...DEFAULT_URGENCY_COEFFICIENTS };
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Try pattern with subcategory first: urgency.category.subcategory.coefficient
    let match = trimmed.match(
      /^urgency\.(\w+)\.(\w+)\.coefficient\s*=\s*([-\d.]+)/,
    );

    // If no match, try pattern without subcategory: urgency.category.coefficient
    if (!match) {
      match = trimmed.match(/^urgency\.(\w+)\.coefficient\s*=\s*([-\d.]+)/);
    }

    if (match) {
      const category = match[1];
      const subcategory = match.length === 4 ? match[2] : null;
      const value = match.length === 4 ? match[3] : match[2];
      const numValue = parseFloat(value);

      if (category === 'priority') {
        if (subcategory === 'high') coefficients.priorityHigh = numValue;
        else if (subcategory === 'medium')
          coefficients.priorityMedium = numValue;
        else if (subcategory === 'low') coefficients.priorityLow = numValue;
      } else if (category === 'scheduled') {
        coefficients.scheduled = numValue;
      } else if (category === 'deadline' || category === 'due') {
        coefficients.deadline = numValue;
      } else if (category === 'active') {
        coefficients.active = numValue;
      } else if (category === 'age') {
        coefficients.age = numValue;
      } else if (category === 'tags') {
        coefficients.tags = numValue;
      } else if (category === 'waiting') {
        coefficients.waiting = numValue;
      }
    }
  }

  return coefficients;
}

/**
 * Parse urgency coefficients from urgency.ini file
 * @param app Obsidian app instance for file access
 * @returns UrgencyCoefficients object
 */
export async function parseUrgencyCoefficients(
  app: App,
): Promise<UrgencyCoefficients> {
  try {
    // Get the plugin directory path using configDir
    const configDir = app.vault.configDir;
    const pluginDir = `${configDir}/plugins/todoseq`;
    const filePath = `${pluginDir}/urgency.ini`;

    // Try to load user-customized urgency.ini from the plugin directory
    const content = await app.vault.adapter.read(filePath);
    if (content) {
      return parseUrgencyCoefficientsFromContent(content);
    }

    // If no custom file found, use default coefficients
    return { ...DEFAULT_URGENCY_COEFFICIENTS };
  } catch (error) {
    // Fallback to defaults on any error
    return { ...DEFAULT_URGENCY_COEFFICIENTS };
  }
}

/**
 * Get default urgency coefficients (synchronous fallback)
 */
export function getDefaultCoefficients(): UrgencyCoefficients {
  return { ...DEFAULT_URGENCY_COEFFICIENTS };
}

/**
 * Calculate the age factor of a task (only for daily notes)
 * @param task The task to calculate age for
 * @returns Age factor between 0.0 and 1.0, or 1.0 if not a daily note
 */
function getTaskAge(task: Task): number {
  // Use the new isDailyNote field and dailyNoteDate
  if (!task.isDailyNote || !task.dailyNoteDate) {
    return 1.0;
  }

  try {
    const noteDate = task.dailyNoteDate;
    const today = DateUtils.getStartOfDay(new Date());

    const diffTime = today.getTime() - noteDate.getTime();
    const age = Math.floor(diffTime / DateUtils.MILLISECONDS_PER_DAY);
    const urgencyAgeMax = 365;

    return Math.min(age / urgencyAgeMax, 1.0);
  } catch (error) {
    console.warn('Failed to calculate task age', error);
    return 1.0;
  }
}

/**
 * Calculate due urgency based on deadline date using linear gradient formula
 * @param task The task to check
 * @returns Urgency value between 0.2 and 1.0 based on deadline proximity
 *
 * Formula: ((days_overdue + 14.0) * 0.8 / 21.0) + 0.2
 * - 7 days overdue: 1.0
 * - Today (0 days): ~0.847
 * - 7 days future: ~0.6
 * - 14 days future: 0.2
 */
function getDeadlineUrgency(task: Task): number {
  // Only use deadline date (not scheduled date)
  if (!task.deadlineDate) return 0;

  const deadline = task.deadlineDate;
  const today = DateUtils.getStartOfDay(new Date());

  // Calculate days overdue (positive for overdue, negative for future)
  // daysOverdue = today - deadline (so overdue tasks have positive values)
  const diffTime = today.getTime() - deadline.getTime();
  const daysOverdue = Math.floor(diffTime / DateUtils.MILLISECONDS_PER_DAY);

  // Clamp to the 21-day range: -14 (14 days future) to +7 (7 days overdue)
  const clampedDays = Math.max(-14, Math.min(7, daysOverdue));

  // Apply the formula: ((days_overdue + 14.0) * 0.8 / 21.0) + 0.2
  const urgency = ((clampedDays + 14.0) * 0.8) / 21.0 + 0.2;

  return urgency;
}

/**
 * Calculate scheduled urgency based on scheduled date
 * @param task The task to check
 * @returns 1.0 if scheduled date is today or in the past, 0 otherwise
 */
function getScheduledUrgency(task: Task): number {
  if (!task.scheduledDate) return 0;

  const scheduled = task.scheduledDate;
  const today = DateUtils.getStartOfDay(new Date());

  // Check if scheduled date is today or in the past
  // scheduled <= today means today or overdue
  return scheduled <= today ? 1.0 : 0;
}

/**
 * Check if task is in active state
 * @param task The task to check
 * @returns 1 if active, 0 otherwise
 */
function isActive(task: Task): number {
  const activeStates = ['DOING', 'NOW', 'IN-PROGRESS'];
  return activeStates.includes(task.state) ? 1 : 0;
}

/**
 * Check if task is waiting
 * @param task The task to check
 * @returns 1 if waiting, 0 otherwise
 */
function isWaiting(task: Task): number {
  const waitingStates = ['WAIT', 'WAITING'];
  return waitingStates.includes(task.state) ? 1 : 0;
}

/**
 * Count tags in task text or from tags array
 * @param task The task to check
 * @returns Number of tags
 */
function countTags(task: Task): number {
  // Use the tags array if available
  if (task.tags && Array.isArray(task.tags)) {
    return task.tags.length;
  }

  // Fall back to parsing tags from text (shouldn't happen with new implementation)
  // Match #tag patterns, but not #A, #B, #C (priorities)
  const tagRegex = /#(?!A|B|C)(\w+)/g;
  const matches = task.text.match(tagRegex);
  return matches ? matches.length : 0;
}

/**
 * Calculate urgency score for a task
 * @param task The task to calculate urgency for
 * @param coefficients Urgency coefficients to use
 * @returns Urgency score or null if calculation fails
 */
export function calculateTaskUrgency(
  task: Task,
  coefficients: UrgencyCoefficients,
): number | null {
  try {
    // Completed tasks have no urgency
    if (task.completed) {
      return null;
    }

    let urgency = 0;

    const deadlineUrgency = getDeadlineUrgency(task);
    urgency += coefficients.deadline * deadlineUrgency;

    // Priority urgency
    if (task.priority === 'high') {
      urgency += coefficients.priorityHigh;
    } else if (task.priority === 'med') {
      urgency += coefficients.priorityMedium;
    } else if (task.priority === 'low') {
      urgency += coefficients.priorityLow;
    }

    // Scheduled date urgency - use getScheduledUrgency() function
    const scheduledUrgency = getScheduledUrgency(task);
    urgency += coefficients.scheduled * scheduledUrgency;

    // Active state urgency
    const active = isActive(task);
    urgency += coefficients.active * active;

    // Age urgency (only for daily notes)
    const age = getTaskAge(task);
    urgency += coefficients.age * age;

    // Tag count urgency - factor based on number of tags
    const tagCount = countTags(task);
    let tagFactor = 0.0;

    if (tagCount === 0) {
      tagFactor = 0.0;
    } else if (tagCount === 1) {
      tagFactor = 0.8;
    } else if (tagCount === 2) {
      tagFactor = 0.9;
    } else if (tagCount >= 3) {
      tagFactor = 1.0;
    }

    urgency += coefficients.tags * tagFactor;

    // Waiting state urgency (negative)
    const waiting = isWaiting(task);
    urgency += coefficients.waiting * waiting;

    return urgency;
  } catch (error) {
    console.warn('Failed to calculate urgency for task', task, error);
    return null;
  }
}

/**
 * Check if a task needs urgency recalculation based on changed properties
 * @param task The task to check
 * @param changedProps Array of property names that changed
 * @returns true if urgency needs recalculation
 */
export function needsUrgencyRecalculation(
  task: Task,
  changedProps: string[],
): boolean {
  const urgencyAffectingProps = [
    'priority',
    'scheduledDate',
    'deadlineDate',
    'state',
    'completed',
    'tags', // tags array
    'isDailyNote', // new field
    'dailyNoteDate', // new field
  ];

  return changedProps.some((prop) => urgencyAffectingProps.includes(prop));
}
