import { Task } from '../task';
import { TFile, App } from 'obsidian';

/**
 * Urgency coefficients interface matching the urgency.ini configuration
 */
export interface UrgencyCoefficients {
  due: number;
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
  due: 12.0,
  priorityHigh: 6.0,
  priorityMedium: 3.9,
  priorityLow: 1.8,
  scheduled: 5.0,
  deadline: 5.0,
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

    const match = trimmed.match(
      /^urgency\.(\w+)\.(\w+)?\.coefficient\s*=\s*([-\d.]+)/,
    );
    if (match) {
      const [, category, subcategory, value] = match;
      const numValue = parseFloat(value);

      if (category === 'due') {
        coefficients.due = numValue;
      } else if (category === 'priority') {
        if (subcategory === 'high') coefficients.priorityHigh = numValue;
        else if (subcategory === 'medium')
          coefficients.priorityMedium = numValue;
        else if (subcategory === 'low') coefficients.priorityLow = numValue;
      } else if (category === 'scheduled') {
        coefficients.scheduled = numValue;
      } else if (category === 'deadline') {
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
    const file = app.vault.getAbstractFileByPath('src/urgency.ini');
    if (!file || !(file instanceof TFile)) {
      console.warn('urgency.ini not found, using default coefficients');
      return { ...DEFAULT_URGENCY_COEFFICIENTS };
    }

    const content = await app.vault.read(file);
    return parseUrgencyCoefficientsFromContent(content);
  } catch (error) {
    console.warn('Error reading urgency.ini, using defaults', error);
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
 * Check if a file path represents a daily note based on common patterns
 * @param filePath The file path to check
 * @returns true if the file appears to be a daily note
 */
function isDailyNotePath(filePath?: string): boolean {
  if (!filePath) return false;

  // Check if file is in daily notes folder (common patterns)
  const path = filePath.toLowerCase();

  // Common daily note patterns
  const dailyPatterns = [
    /^daily\//,
    /^journal\//,
    /^diary\//,
    /^notes\/daily\//,
    /^notes\/journal\//,
  ];

  // Check path patterns
  for (const pattern of dailyPatterns) {
    if (pattern.test(path)) return true;
  }

  // Check if filename matches date pattern (YYYY-MM-DD, YYYYMMDD, etc.)
  const filename = path.split('/').pop() || '';
  const datePattern = /^\d{4}[-._]\d{2}[-._]\d{2}/;
  if (datePattern.test(filename)) return true;

  return false;
}

/**
 * Check if a file is a daily note based on common patterns
 * @param file The file to check
 * @returns true if the file appears to be a daily note
 */
function isDailyNote(file?: TFile): boolean {
  if (!file) return false;
  return isDailyNotePath(file.path);
}

/**
 * Calculate the age of a task in days (only for daily notes)
 * @param task The task to calculate age for
 * @returns Age in days, or 0 if not a daily note
 */
function getTaskAge(task: Task): number {
  if (!task.file || !isDailyNote(task.file)) {
    return 0;
  }

  try {
    // Extract date from filename
    const name = task.file.name;
    const dateMatch = name.match(/(\d{4})[-._](\d{2})[-._](\d{2})/);
    if (!dateMatch) return 0;

    const year = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1; // JavaScript months are 0-indexed
    const day = parseInt(dateMatch[3], 10);

    const noteDate = new Date(year, month, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - noteDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  } catch (error) {
    console.warn('Failed to calculate task age', error);
    return 0;
  }
}

/**
 * Check if task has due urgency (overdue or due today)
 * @param task The task to check
 * @returns 1 if due/overdue, 0 otherwise
 */
function getDueUrgency(task: Task): number {
  const dates: Date[] = [];
  if (task.scheduledDate) dates.push(task.scheduledDate);
  if (task.deadlineDate) dates.push(task.deadlineDate);

  if (dates.length === 0) return 0;

  const earliestDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (earliestDate < today) return 1; // overdue
  if (earliestDate.toDateString() === today.toDateString()) return 1; // due today
  return 0; // future date
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
  // First check if task has a tags array property
  if (task.tags && Array.isArray(task.tags)) {
    return task.tags.length;
  }

  // Fall back to parsing tags from text
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

    // Due date urgency
    const dueUrgency = getDueUrgency(task);
    urgency += coefficients.due * dueUrgency;

    // Priority urgency
    if (task.priority === 'high') {
      urgency += coefficients.priorityHigh;
    } else if (task.priority === 'med') {
      urgency += coefficients.priorityMedium;
    } else if (task.priority === 'low') {
      urgency += coefficients.priorityLow;
    }

    // Scheduled and deadline date urgency (use earliest to avoid double-counting)
    const dates: Date[] = [];
    if (task.scheduledDate) dates.push(task.scheduledDate);
    if (task.deadlineDate) dates.push(task.deadlineDate);

    if (dates.length > 0) {
      const earliestDate = new Date(Math.min(...dates.map((d) => d.getTime())));
      const isScheduledEarliest =
        task.scheduledDate &&
        earliestDate.getTime() === task.scheduledDate.getTime();
      const isDeadlineEarliest =
        task.deadlineDate &&
        earliestDate.getTime() === task.deadlineDate.getTime();

      if (isScheduledEarliest) {
        urgency += coefficients.scheduled;
      } else if (isDeadlineEarliest) {
        urgency += coefficients.deadline;
      }
    }

    // Active state urgency
    const active = isActive(task);
    urgency += coefficients.active * active;

    // Age urgency (only for daily notes)
    const age = getTaskAge(task);
    urgency += coefficients.age * age;

    // Tag count urgency
    const tagCount = countTags(task);
    urgency += coefficients.tags * tagCount;

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
    'file', // file affects daily notes detection
  ];

  return changedProps.some((prop) => urgencyAffectingProps.includes(prop));
}
