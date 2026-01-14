import { Task } from '../task';

/**
 * Task Classification Types
 */
export type TaskCategory = 'current' | 'upcoming' | 'future' | 'completed';
export type BlockType = 'main' | 'future' | 'completed';

/**
 * Sorting method types
 */
export type SortMethod =
  | 'default'
  | 'sortByScheduled'
  | 'sortByDeadline'
  | 'sortByPriority';

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
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(now.getDate() + 7);

  if (earliestDate <= sevenDaysFromNow) {
    return { category: 'upcoming', earliestDate };
  }

  // Tasks with dates beyond 7 days are future
  return { category: 'future', earliestDate };
}

/**
 * Get sort function based on sort method
 * @param sortMethod The sort method to use
 * @returns Sort function
 */
function getSortFunction(sortMethod: SortMethod): (a: Task, b: Task) => number {
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

    case 'default':
    default:
      return taskComparator;
  }
}

/**
 * Sort tasks within a single category
 * @param tasks Tasks to sort
 * @param sortMethod Sort method to apply
 * @returns Sorted tasks
 */
function sortCategory(tasks: Task[], sortMethod: SortMethod): Task[] {
  const sortFunction = getSortFunction(sortMethod);
  return [...tasks].sort(sortFunction);
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
): TaskBlock[] {
  // Classify all tasks
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

  // Sort each category
  const sorted: Record<TaskCategory, Task[]> = {
    current: sortCategory(classified.current, sortMethod),
    upcoming: sortCategory(classified.upcoming, sortMethod),
    future: sortCategory(classified.future, sortMethod),
    completed: sortCategory(classified.completed, sortMethod),
  };

  const blocks: TaskBlock[] = [];

  // Build Main Block
  const mainBlockTasks: Task[] = [];

  switch (futureSetting) {
    case 'showAll':
      // All non-completed tasks in one block
      mainBlockTasks.push(
        ...sorted.current,
        ...sorted.upcoming,
        ...sorted.future,
      );
      // Handle completed tasks based on setting
      if (completedSetting === 'showAll') {
        mainBlockTasks.push(...sorted.completed);
      }
      // Sort all tasks together using the selected method
      {
        const sortFunction = getSortFunction(sortMethod);
        mainBlockTasks.sort(sortFunction);
      }
      break;

    case 'showUpcoming':
      // Current + Upcoming tasks only
      mainBlockTasks.push(...sorted.current, ...sorted.upcoming);
      // Handle completed tasks in main block
      if (completedSetting === 'showAll') {
        mainBlockTasks.push(...sorted.completed);
      }
      // Sort the main block using the selected method
      {
        const sortFunction2 = getSortFunction(sortMethod);
        mainBlockTasks.sort(sortFunction2);
      }
      break;

    case 'sortToEnd':
      // Current tasks only (future goes to separate block)
      mainBlockTasks.push(...sorted.current);
      // Handle completed tasks in main block
      if (completedSetting === 'showAll') {
        mainBlockTasks.push(...sorted.completed);
      }
      // Sort the main block using the selected method
      {
        const sortFunction3 = getSortFunction(sortMethod);
        mainBlockTasks.sort(sortFunction3);
      }
      break;

    case 'hideFuture':
      // Current tasks only
      mainBlockTasks.push(...sorted.current);
      // Handle completed tasks in main block
      if (completedSetting === 'showAll') {
        mainBlockTasks.push(...sorted.completed);
      }
      // Sort the main block using the selected method
      {
        const sortFunction4 = getSortFunction(sortMethod);
        mainBlockTasks.sort(sortFunction4);
      }
      break;
  }

  // Add Main Block if it has tasks
  if (mainBlockTasks.length > 0) {
    blocks.push({ type: 'main', tasks: mainBlockTasks });
  }

  // Add Future Block if needed
  if (futureSetting === 'sortToEnd') {
    // Future block contains all future tasks (upcoming + future)
    // Main block has: current only
    const futureTasks = [...sorted.upcoming, ...sorted.future];
    if (futureTasks.length > 0) {
      // Sort future tasks using the selected method
      const sortFunction = getSortFunction(sortMethod);
      futureTasks.sort(sortFunction);
      blocks.push({ type: 'future', tasks: futureTasks });
    }
  }

  // Add Completed Block if needed
  if (completedSetting === 'sortToEnd') {
    if (sorted.completed.length > 0) {
      // Sort completed tasks using the selected method
      const sortFunction = getSortFunction(sortMethod);
      sorted.completed.sort(sortFunction);
      blocks.push({ type: 'completed', tasks: sorted.completed });
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
): Task[] {
  const blocks = sortTasksInBlocks(
    tasks,
    now,
    futureSetting,
    completedSetting,
    sortMethod,
  );
  return flattenBlocks(blocks);
}
