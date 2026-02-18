import { Task } from '../types/task';
import { DateUtils } from './date-utils';

/**
 * Task Classification Types
 */
export type TaskCategory = 'current' | 'upcoming' | 'future' | 'completed';
export type BlockType = 'main' | 'future' | 'completed';

/**
 * Keyword Group type for keyword-based sorting
 * Groups are sorted in priority order: 1 (highest) to 5 (lowest)
 */
export type KeywordGroup = 1 | 2 | 3 | 4 | 5;

/**
 * Configuration for keyword-based sorting
 * Each group has both a Set for fast lookup and an ordered array for intra-group sorting
 */
export interface KeywordSortConfig {
  activeStates: Set<string>; // Group 1 - highest priority (fast lookup)
  activeStatesOrder: string[]; // Group 1 - ordered: NOW, DOING, IN-PROGRESS
  pendingStates: Set<string>; // Group 2 - inactive/pending (fast lookup)
  pendingStatesOrder: string[]; // Group 2 - ordered: TODO, LATER
  customKeywords: string[]; // Group 3 - user-defined keywords (already ordered)
  waitingStates: Set<string>; // Group 4 - waiting states (fast lookup)
  waitingStatesOrder: string[]; // Group 4 - ordered: WAIT, WAITING
  completedStates: Set<string>; // Group 5 - lowest priority (fast lookup)
  completedStatesOrder: string[]; // Group 5 - ordered: DONE, CANCELED, CANCELLED
}

/**
 * Sorting method types
 */
export type SortMethod =
  | 'default'
  | 'sortByScheduled'
  | 'sortByDeadline'
  | 'sortByPriority'
  | 'sortByUrgency'
  | 'sortByKeyword';

/**
 * Future task display options
 */
export type FutureTaskSetting =
  | 'showAll'
  | 'showUpcoming'
  | 'sortToEnd'
  | 'hideFuture';

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
 * - Group 1: Active states (NOW, DOING, IN-PROGRESS)
 * - Group 2: Inactive/Pending states (TODO, LATER)
 * - Group 3: Custom keywords or unknown/empty states
 * - Group 4: Waiting states (WAIT, WAITING)
 * - Group 5: Completed states (DONE, CANCELED, CANCELLED)
 *
 * @param task The task to classify
 * @param config Keyword sort configuration
 * @returns The keyword group (1-5)
 */
export function getKeywordGroup(
  task: Task,
  config: KeywordSortConfig,
): KeywordGroup {
  // Completed flag takes precedence - always group 5
  if (task.completed) {
    return 5;
  }

  const stateUpper = task.state.toUpperCase();

  // Group 1: Active states
  if (config.activeStates.has(stateUpper)) {
    return 1;
  }

  // Group 2: Pending/Inactive states
  if (config.pendingStates.has(stateUpper)) {
    return 2;
  }

  // Group 4: Waiting states (check before custom to prioritize)
  if (config.waitingStates.has(stateUpper)) {
    return 4;
  }

  // Group 5: Completed keyword states (for tasks with DONE/CANCELED keyword but completed: false)
  if (config.completedStates.has(stateUpper)) {
    return 5;
  }

  // Group 3: Custom keywords or unknown/empty states (default)
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
  group: KeywordGroup,
  config: KeywordSortConfig,
): number {
  switch (group) {
    case 1:
      return config.activeStatesOrder.indexOf(stateUpper);
    case 2:
      return config.pendingStatesOrder.indexOf(stateUpper);
    case 3:
      // For custom keywords, use the customKeywords array directly
      return config.customKeywords.indexOf(stateUpper);
    case 4:
      return config.waitingStatesOrder.indexOf(stateUpper);
    case 5:
      return config.completedStatesOrder.indexOf(stateUpper);
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
 * Build keyword sort configuration from settings
 *
 * @param additionalKeywords Custom keywords from user settings (order is preserved)
 * @returns Complete KeywordSortConfig object
 */
export function buildKeywordSortConfig(
  additionalKeywords: string[],
): KeywordSortConfig {
  // Define ordered keyword arrays for each group
  // These arrays define both the keywords in the group AND their sort order
  const activeStatesOrder = ['NOW', 'DOING', 'IN-PROGRESS'];
  const pendingStatesOrder = ['TODO', 'LATER'];
  const waitingStatesOrder = ['WAIT', 'WAITING'];
  const completedStatesOrder = ['DONE', 'CANCELED', 'CANCELLED'];

  // Normalize custom keywords to uppercase, preserving order from settings
  const customKeywords = (additionalKeywords ?? []).map((k) => k.toUpperCase());

  return {
    // Sets for fast O(1) lookup
    activeStates: new Set(activeStatesOrder),
    pendingStates: new Set(pendingStatesOrder),
    waitingStates: new Set(waitingStatesOrder),
    completedStates: new Set(completedStatesOrder),
    // Ordered arrays for intra-group sorting
    activeStatesOrder,
    pendingStatesOrder,
    customKeywords,
    waitingStatesOrder,
    completedStatesOrder,
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
 * Classify a task into a category based on dates and completion status
 * @param task The task to classify
 * @param now Current date/time
 * @returns Task classification
 */
function classifyTask(task: Task, now: Date): TaskClassification {
  // Completed tasks are always in completed category
  if (task.completed) {
    return { category: 'completed', earliestDate: getEarliestDate(task) };
  }

  const earliestDate = getEarliestDate(task);

  // Tasks with no dates are current
  if (!earliestDate) {
    return { category: 'current', earliestDate: null };
  }

  // Tasks with dates on or before today are current
  if (earliestDate <= now) {
    return { category: 'current', earliestDate };
  }

  // Tasks with dates within 7 days (excluding today) are upcoming
  const sevenDaysFromNow = DateUtils.addDays(now, 7);

  if (earliestDate <= sevenDaysFromNow) {
    return { category: 'upcoming', earliestDate };
  }

  // Tasks with dates beyond 7 days are future
  return { category: 'future', earliestDate };
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
        if (!a.scheduledDate && !b.scheduledDate) return taskComparator(a, b);
        if (!a.scheduledDate) return 1;
        if (!b.scheduledDate) return -1;
        return a.scheduledDate.getTime() - b.scheduledDate.getTime();
      };

    case 'sortByDeadline':
      return (a, b) => {
        if (!a.deadlineDate && !b.deadlineDate) return taskComparator(a, b);
        if (!a.deadlineDate) return 1;
        if (!b.deadlineDate) return -1;
        return a.deadlineDate.getTime() - b.deadlineDate.getTime();
      };

    case 'sortByPriority':
      return (a, b) => {
        const priorityOrder = { high: 3, med: 2, low: 1, null: 0 };
        const aPriority = a.priority ? priorityOrder[a.priority] : 0;
        const bPriority = b.priority ? priorityOrder[b.priority] : 0;

        if (aPriority !== bPriority) {
          return bPriority - aPriority; // Higher priority first
        }

        // If priorities are equal, fall back to default sorting
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

        // If urgencies are equal, fall back to default sorting
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
 * Sort tasks within a single category
 * @param tasks Tasks to sort
 * @param sortMethod Sort method to apply
 * @param keywordConfig Optional keyword sort configuration
 * @returns Sorted tasks
 */

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
): TaskBlock[] {
  // Classify all tasks - don't sort yet
  const classified: Record<TaskCategory, Task[]> = {
    current: [],
    upcoming: [],
    future: [],
    completed: [],
  };

  for (const task of tasks) {
    const { category } = classifyTask(task, now);
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
): Task[] {
  const blocks = sortTasksInBlocks(
    tasks,
    now,
    futureSetting,
    completedSetting,
    sortMethod,
    keywordConfig,
  );
  return flattenBlocks(blocks);
}
