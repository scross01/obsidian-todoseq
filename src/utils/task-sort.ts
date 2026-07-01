import { Task } from '../types/task';
import { DateUtils } from './date-utils';
import { KeywordManager } from './keyword-manager';
import { warningPeriodToDays } from './date-utils';

/**
 * Task Classification Types
 */
export type TaskCategory = 'current' | 'upcoming' | 'future' | 'completed';
export type BlockType = 'main' | 'future' | 'completed';

/**
 * Keyword Group type for keyword-based sorting
 * Groups are sorted in priority order: 1 (highest) to 5 (lowest)
 */
export type KeywordSortGroup = 1 | 2 | 3 | 4 | 5;

/**
 * Configuration for keyword-based sorting
 * Each group has both a Set for fast lookup and an ordered array for intra-group sorting
 *
 * Group Priority (1 = highest, 5 = lowest):
 * - Group 1: Active keywords (built-in + custom active)
 * - Group 2: Inactive keywords (built-in + custom inactive)
 * - Group 3: Unknown/empty states (fallback only)
 * - Group 4: Waiting keywords (built-in + custom waiting)
 * - Group 5: Completed keywords (built-in + custom completed)
 */
export interface KeywordSortConfig {
  activeKeywords: Set<string>; // Group 1 - highest priority (fast lookup)
  activeKeywordsOrder: string[]; // Group 1 - ordered for intra-group sorting
  inactiveKeywords: Set<string>; // Group 2 - inactive/pending (fast lookup)
  inactiveKeywordsOrder: string[]; // Group 2 - ordered for intra-group sorting
  waitingKeywords: Set<string>; // Group 4 - waiting/blocked (fast lookup)
  waitingKeywordsOrder: string[]; // Group 4 - ordered for intra-group sorting
  completedKeywords: Set<string>; // Group 5 - lowest priority (fast lookup)
  completedKeywordsOrder: string[]; // Group 5 - ordered for intra-group sorting
}

/**
 * Sorting method types
 */
export type SortMethod =
  | 'default'
  | 'sortByScheduled'
  | 'sortByDeadline'
  | 'sortByClosedDate'
  | 'sortByPriority'
  | 'sortByUrgency'
  | 'sortByKeyword';

/**
 * Future task display options
 */
export type FutureTaskSetting =
  'showAll' | 'showUpcoming' | 'sortToEnd' | 'hideFuture';

/**
 * Completed task display options
 */
export type CompletedTaskSetting = 'showAll' | 'sortToEnd' | 'hide';

/**
 * Task classification result
 */
interface TaskClassification {
  category: TaskCategory;
  earliestDate: Date | null;
}

/**
 * Task block structure for three-block system
 */
export interface TaskBlock {
  type: BlockType;
  tasks: Task[];
}

/**
 * Shared task comparator for consistent ordering across views
 * Sorts by file path first, then by line number
 */
export const taskComparator = (a: Task, b: Task): number => {
  if (a.path === b.path) return a.line - b.line;
  return a.path.localeCompare(b.path);
};

/**
 * Classify a task into a keyword group for sorting
 *
 * Group Priority (1 = highest, 5 = lowest):
 * - Group 1: Active keywords (built-in + custom active)
 * - Group 2: Inactive keywords (built-in + custom inactive)
 * - Group 3: Unknown/empty states (fallback only)
 * - Group 4: Waiting keywords (built-in + custom waiting)
 * - Group 5: Completed keywords (built-in + custom completed)
 *
 * @param task The task to classify
 * @param config Keyword sort configuration
 * @returns The keyword group (1-5)
 */
export function getKeywordGroup(
  task: Task,
  config: KeywordSortConfig,
): KeywordSortGroup {
  // Completed flag takes precedence - always group 5
  if (task.completed) {
    return 5;
  }

  const stateUpper = task.state.toUpperCase();

  // Group 1: Active keywords (highest priority for incomplete tasks)
  if (config.activeKeywords.has(stateUpper)) {
    return 1;
  }

  // Group 2: Inactive keywords
  if (config.inactiveKeywords.has(stateUpper)) {
    return 2;
  }

  // Group 4: Waiting keywords
  if (config.waitingKeywords.has(stateUpper)) {
    return 4;
  }

  // Group 5: Completed keyword states (for tasks with DONE/CANCELED keyword but completed: false)
  if (config.completedKeywords.has(stateUpper)) {
    return 5;
  }

  // Group 3: Unknown/empty states (default)
  return 3;
}

/**
 * Comparator for sorting tasks by keyword group
 *
 * @param a First task
 * @param b Second task
 * @param config Keyword sort configuration
 * @returns Negative if a should come before b, positive if b should come before a
 */
/**
 * Get the position of a keyword within its group for intra-group sorting
 * Returns -1 if keyword not found in the order array
 *
 * @param stateUpper The uppercase state/keyword to find
 * @param group The keyword group (1-5)
 * @param config Keyword sort configuration
 * @returns The index of the keyword in the group's order array, or -1 if not found
 */
function getKeywordPosition(
  stateUpper: string,
  group: KeywordSortGroup,
  config: KeywordSortConfig,
): number {
  switch (group) {
    case 1:
      return config.activeKeywordsOrder.indexOf(stateUpper);
    case 2:
      return config.inactiveKeywordsOrder.indexOf(stateUpper);
    case 3:
      // Group 3 is for unknown/empty states - no specific order
      return -1;
    case 4:
      return config.waitingKeywordsOrder.indexOf(stateUpper);
    case 5:
      return config.completedKeywordsOrder.indexOf(stateUpper);
    default:
      return -1;
  }
}

export function keywordSortComparator(
  a: Task,
  b: Task,
  config: KeywordSortConfig,
): number {
  const groupA = getKeywordGroup(a, config);
  const groupB = getKeywordGroup(b, config);

  // Compare groups - lower group number = higher priority
  if (groupA !== groupB) {
    return groupA - groupB;
  }

  // Same group - compare by keyword position within the group
  const stateA = a.state.toUpperCase();
  const stateB = b.state.toUpperCase();
  const posA = getKeywordPosition(stateA, groupA, config);
  const posB = getKeywordPosition(stateB, groupB, config);

  // If both keywords have defined positions, sort by position
  if (posA !== -1 && posB !== -1 && posA !== posB) {
    return posA - posB;
  }

  // If only one has a position, it comes first
  if (posA !== -1 && posB === -1) {
    return -1;
  }
  if (posA === -1 && posB !== -1) {
    return 1;
  }

  // Same group, same or unknown keyword position - fall back to taskComparator
  return taskComparator(a, b);
}

/**
 * Build keyword sort configuration from KeywordManager
 *
 * @param keywordManager KeywordManager instance containing all keywords
 * @returns Complete KeywordSortConfig object
 */
export function buildKeywordSortConfig(
  keywordManager: KeywordManager,
): KeywordSortConfig {
  // Use KeywordManager effective ordering (includes built-in overrides/removals)
  const activeKeywordsOrder =
    keywordManager.getKeywordsForGroup('activeKeywords');
  const inactiveKeywordsOrder =
    keywordManager.getKeywordsForGroup('inactiveKeywords');
  const waitingKeywordsOrder =
    keywordManager.getKeywordsForGroup('waitingKeywords');
  const completedKeywordsOrder =
    keywordManager.getKeywordsForGroup('completedKeywords');

  return {
    // Sets for fast O(1) lookup
    activeKeywords: new Set(activeKeywordsOrder),
    inactiveKeywords: new Set(inactiveKeywordsOrder),
    waitingKeywords: new Set(waitingKeywordsOrder),
    completedKeywords: new Set(completedKeywordsOrder),
    // Ordered arrays for intra-group sorting
    activeKeywordsOrder,
    inactiveKeywordsOrder,
    waitingKeywordsOrder,
    completedKeywordsOrder,
  };
}

/**
 * Get the earliest date from a task (scheduled or deadline)
 * @param task The task to analyze
 * @returns The earliest date or null if no dates
 */
function getEarliestDate(task: Task): Date | null {
  const dates: Date[] = [];
  if (task.scheduledDate) dates.push(task.scheduledDate);
  if (task.deadlineDate) dates.push(task.deadlineDate);

  if (dates.length === 0) return null;
  return dates.reduce((earliest, current) =>
    current < earliest ? current : earliest,
  );
}

/**
 * Settings subset needed for warning period calculations
 */
export interface WarningPeriodSettings {
  upcomingPeriod: number;
  defaultDeadlineWarningPeriod: number;
  defaultScheduledWarningPeriod: number;
  skipScheduledWarningPeriodIfDeadline: boolean;
  skipDeadlinePrewarningIfScheduled: boolean;
}

/**
 * Get the effective visibility date for a task, accounting for warning periods.
 * For deadlines: effective date = deadline - warning period (appears earlier)
 * For scheduled: effective date = scheduled + delay (appears later)
 *
 * Both -Nd (all occurrences) and --Nd (first-only) affect visibility the same way.
 * The difference is only in recurrence: --Nd is stripped after first occurrence,
 * while -Nd persists across repeats. This function uses whichever is set.
 *
 * @param task The task to analyze
 * @param settings Warning period settings
 * @returns The effective visibility date or null if no dates
 */
export function getEffectiveVisibilityDate(
  task: Task,
  settings: WarningPeriodSettings,
): Date | null {
  let effectiveScheduled: Date | null = null;
  let effectiveDeadline: Date | null = null;

  if (task.scheduledDate) {
    const scheduledWarningInfo = task.scheduledWarningPeriod;
    const scheduledDelay = scheduledWarningInfo
      ? warningPeriodToDays(scheduledWarningInfo)
      : settings.defaultScheduledWarningPeriod;
    if (settings.skipScheduledWarningPeriodIfDeadline && task.deadlineDate) {
      effectiveScheduled = task.scheduledDate;
    } else {
      effectiveScheduled = DateUtils.addDays(
        task.scheduledDate,
        scheduledDelay,
      );
    }
  }

  if (task.deadlineDate) {
    const deadlineWarningInfo = task.deadlineWarningPeriod;
    const warningDays = deadlineWarningInfo
      ? warningPeriodToDays(deadlineWarningInfo)
      : settings.defaultDeadlineWarningPeriod;
    if (settings.skipDeadlinePrewarningIfScheduled && task.scheduledDate) {
      effectiveDeadline = task.deadlineDate;
    } else {
      effectiveDeadline = DateUtils.addDays(task.deadlineDate, -warningDays);
    }
  }

  if (!effectiveScheduled) return effectiveDeadline;
  if (!effectiveDeadline) return effectiveScheduled;
  return effectiveScheduled < effectiveDeadline
    ? effectiveScheduled
    : effectiveDeadline;
}

/**
 * Classify a task into a category based on dates and completion status
 * @param task The task to classify
 * @param now Current date/time
 * @param settings Warning period settings (optional, uses defaults if not provided)
 * @returns Task classification
 */
function classifyTask(
  task: Task,
  now: Date,
  settings?: WarningPeriodSettings,
): TaskClassification {
  // Completed tasks are always in completed category
  if (task.completed) {
    return { category: 'completed', earliestDate: getEarliestDate(task) };
  }

  const effectiveDate = settings
    ? getEffectiveVisibilityDate(task, settings)
    : getEarliestDate(task);

  // Tasks with no dates are current
  if (!effectiveDate) {
    return { category: 'current', earliestDate: null };
  }

  // Normalize to day-level comparison to avoid time-of-day misclassification
  const today = DateUtils.getStartOfDay(now);
  const effectiveDay = DateUtils.getStartOfDay(effectiveDate);

  // Tasks with effective date on or before today are current
  if (effectiveDay <= today) {
    return { category: 'current', earliestDate: effectiveDate };
  }

  // Tasks with effective date within upcoming period are upcoming
  const upcomingDays = settings?.upcomingPeriod ?? 7;
  const upcomingBoundary = DateUtils.addDays(today, upcomingDays);

  if (effectiveDay <= upcomingBoundary) {
    return { category: 'upcoming', earliestDate: effectiveDate };
  }

  // Tasks with dates beyond upcoming period are future
  return { category: 'future', earliestDate: effectiveDate };
}

/**
 * Get sort function based on sort method
 * @param sortMethod The sort method to use
 * @param keywordConfig Optional keyword sort configuration for sortByKeyword
 * @returns Sort function
 */
function getSortFunction(
  sortMethod: SortMethod,
  keywordConfig?: KeywordSortConfig,
): (a: Task, b: Task) => number {
  switch (sortMethod) {
    case 'sortByScheduled':
      return (a, b) => {
        if (!a.scheduledDate && !b.scheduledDate) {
          if (keywordConfig) {
            return keywordSortComparator(a, b, keywordConfig);
          }
          return taskComparator(a, b);
        }
        if (!a.scheduledDate) return 1;
        if (!b.scheduledDate) return -1;

        const dateDiff = a.scheduledDate.getTime() - b.scheduledDate.getTime();
        if (dateDiff !== 0) {
          return dateDiff;
        }

        // If scheduled dates are equal, use keyword sort as secondary
        if (keywordConfig) {
          return keywordSortComparator(a, b, keywordConfig);
        }
        return taskComparator(a, b);
      };

    case 'sortByDeadline':
      return (a, b) => {
        if (!a.deadlineDate && !b.deadlineDate) {
          if (keywordConfig) {
            return keywordSortComparator(a, b, keywordConfig);
          }
          return taskComparator(a, b);
        }
        if (!a.deadlineDate) return 1;
        if (!b.deadlineDate) return -1;

        const dateDiff = a.deadlineDate.getTime() - b.deadlineDate.getTime();
        if (dateDiff !== 0) {
          return dateDiff;
        }

        // If deadline dates are equal, use keyword sort as secondary
        if (keywordConfig) {
          return keywordSortComparator(a, b, keywordConfig);
        }
        return taskComparator(a, b);
      };

    case 'sortByClosedDate':
      return (a, b) => {
        // Tasks without closed dates go to the end
        if (!a.closedDate && !b.closedDate) {
          if (keywordConfig) {
            return keywordSortComparator(a, b, keywordConfig);
          }
          return taskComparator(a, b);
        }
        if (!a.closedDate) return 1;
        if (!b.closedDate) return -1;

        // Compare closed dates (earlier first)
        const dateDiff = a.closedDate.getTime() - b.closedDate.getTime();
        if (dateDiff !== 0) {
          return dateDiff;
        }

        // If closed dates are equal, use keyword sort as secondary
        if (keywordConfig) {
          return keywordSortComparator(a, b, keywordConfig);
        }
        return taskComparator(a, b);
      };

    case 'sortByPriority':
      return (a, b) => {
        const priorityOrder = { high: 3, med: 2, low: 1, null: 0 };
        const aPriority = a.priority ? priorityOrder[a.priority] : 0;
        const bPriority = b.priority ? priorityOrder[b.priority] : 0;

        if (aPriority !== bPriority) {
          return bPriority - aPriority; // Higher priority first
        }

        // If priorities are equal, use keyword sort as secondary
        if (keywordConfig) {
          return keywordSortComparator(a, b, keywordConfig);
        }
        return taskComparator(a, b);
      };

    case 'sortByUrgency':
      return (a, b) => {
        // Handle null urgency values - sort to end
        if (a.urgency === null && b.urgency === null) {
          return taskComparator(a, b);
        }
        if (a.urgency === null) return 1;
        if (b.urgency === null) return -1;

        // Sort by urgency descending (higher urgency first)
        if (a.urgency !== b.urgency) {
          return b.urgency - a.urgency;
        }

        // If urgencies are equal, use keyword sort as secondary
        if (keywordConfig) {
          return keywordSortComparator(a, b, keywordConfig);
        }
        return taskComparator(a, b);
      };

    case 'sortByKeyword':
      if (keywordConfig) {
        return (a, b) => keywordSortComparator(a, b, keywordConfig);
      }
      // Fallback to default if no config provided
      return taskComparator;

    case 'default':
    default:
      return taskComparator;
  }
}

/**
 * Apply three-block task sorting according to PRD
 *
 * Block Order:
 * 1. Main Block - Always present
 * 2. Future Block - Only when Future tasks "Sort to end" option is selected
 * 3. Completed Block - Only when Completed tasks "Sort to end" option is selected
 *
 * @param tasks All tasks to sort
 * @param now Current date/time
 * @param futureSetting Future task display setting
 * @param completedSetting Completed task display setting
 * @param sortMethod User-selected sort method
 * @returns Array of task blocks in order
 */
export function sortTasksInBlocks(
  tasks: Task[],
  now: Date,
  futureSetting: FutureTaskSetting,
  completedSetting: CompletedTaskSetting,
  sortMethod: SortMethod = 'default',
  keywordConfig?: KeywordSortConfig,
  warningPeriodSettings?: WarningPeriodSettings,
): TaskBlock[] {
  // Classify all tasks - don't sort yet
  const classified: Record<TaskCategory, Task[]> = {
    current: [],
    upcoming: [],
    future: [],
    completed: [],
  };

  for (const task of tasks) {
    const { category } = classifyTask(task, now, warningPeriodSettings);
    classified[category].push(task);
  }

  // Get the sort function once
  const sortFunction = getSortFunction(sortMethod, keywordConfig);

  const blocks: TaskBlock[] = [];

  // Build Main Block - combine categories first, then sort ONCE
  const mainBlockTasks: Task[] = [];

  switch (futureSetting) {
    case 'showAll':
      // All non-completed tasks in one block
      mainBlockTasks.push(
        ...classified.current,
        ...classified.upcoming,
        ...classified.future,
      );
      // Handle completed tasks based on setting
      if (completedSetting === 'showAll') {
        mainBlockTasks.push(...classified.completed);
      }
      // Sort only once
      mainBlockTasks.sort(sortFunction);
      break;

    case 'showUpcoming':
      // Current + Upcoming tasks only
      mainBlockTasks.push(...classified.current, ...classified.upcoming);
      // Handle completed tasks in main block
      if (completedSetting === 'showAll') {
        mainBlockTasks.push(...classified.completed);
      }
      // Sort only once
      mainBlockTasks.sort(sortFunction);
      break;

    case 'sortToEnd':
      // Current tasks only (future goes to separate block)
      mainBlockTasks.push(...classified.current);
      // Handle completed tasks in main block
      if (completedSetting === 'showAll') {
        mainBlockTasks.push(...classified.completed);
      }
      // Sort only once
      mainBlockTasks.sort(sortFunction);
      break;

    case 'hideFuture':
      // Current tasks only
      mainBlockTasks.push(...classified.current);
      // Handle completed tasks in main block
      if (completedSetting === 'showAll') {
        mainBlockTasks.push(...classified.completed);
      }
      // Sort only once
      mainBlockTasks.sort(sortFunction);
      break;
  }

  // Add Main Block if it has tasks
  if (mainBlockTasks.length > 0) {
    blocks.push({ type: 'main', tasks: mainBlockTasks });
  }

  // Add Future Block if needed - sort once
  if (futureSetting === 'sortToEnd') {
    const futureTasks = [...classified.upcoming, ...classified.future];
    if (futureTasks.length > 0) {
      futureTasks.sort(sortFunction);
      blocks.push({ type: 'future', tasks: futureTasks });
    }
  }

  // Add Completed Block if needed - sort once
  if (completedSetting === 'sortToEnd') {
    if (classified.completed.length > 0) {
      classified.completed.sort(sortFunction);
      blocks.push({ type: 'completed', tasks: classified.completed });
    }
  }

  return blocks;
}

/**
 * Flatten blocks back into a single array (for backward compatibility)
 * @param blocks Array of task blocks
 * @returns Flattened task array
 */
export function flattenBlocks(blocks: TaskBlock[]): Task[] {
  return blocks.flatMap((block) => block.tasks);
}

/**
 * Combined function that returns flattened tasks directly
 * Useful for existing code that expects a single array
 */
export function sortTasksWithThreeBlockSystem(
  tasks: Task[],
  now: Date,
  futureSetting: FutureTaskSetting,
  completedSetting: CompletedTaskSetting,
  sortMethod: SortMethod = 'default',
  keywordConfig?: KeywordSortConfig,
  warningPeriodSettings?: WarningPeriodSettings,
): Task[] {
  const blocks = sortTasksInBlocks(
    tasks,
    now,
    futureSetting,
    completedSetting,
    sortMethod,
    keywordConfig,
    warningPeriodSettings,
  );
  return flattenBlocks(blocks);
}
