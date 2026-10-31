import {
  sortTasksWithThreeBlockSystem,
  buildKeywordSortConfig,
  KeywordSortConfig,
  CompletedTaskSetting,
  WarningPeriodSettings,
  classifyAll,
  classifyTask,
  TaskClassification,
} from '../../utils/task-sort';
import { Task } from '../../types/task';
import TodoTracker from '../../main';
import { KeywordManager } from '../../utils/keyword-manager';

export type TaskListViewMode =
  'showAll' | 'sortCompletedLast' | 'hideCompleted';
export type SortMethod =
  | 'default'
  | 'sortByScheduled'
  | 'sortByDeadline'
  | 'sortByClosedDate'
  | 'sortByStarted'
  | 'sortByPriority'
  | 'sortByUrgency'
  | 'sortByKeyword';

/** How many tasks the current view-mode + future-dating filters are hiding. */
export interface HiddenTaskCounts {
  /** Tasks hidden because they are future- or upcoming-dated. */
  future: number;
  /** Tasks hidden because they are completed. */
  completed: number;
}

export class TaskListFilter {
  private plugin: TodoTracker;
  private keywordManager: KeywordManager;
  private cachedKeywordConfig: KeywordSortConfig | null = null;
  private cachedKeywords: string | null = null;

  constructor(plugin: TodoTracker, keywordManager: KeywordManager) {
    this.plugin = plugin;
    this.keywordManager = keywordManager;
  }

  getViewMode(contentEl: HTMLElement): TaskListViewMode {
    const attr = contentEl.getAttr('data-view-mode');
    if (typeof attr === 'string') {
      if (attr === 'default') return 'showAll';
      if (attr === 'sortCompletedLast') return 'sortCompletedLast';
      if (attr === 'hideCompleted') return 'hideCompleted';
      if (
        attr === 'showAll' ||
        attr === 'sortCompletedLast' ||
        attr === 'hideCompleted'
      )
        return attr;
    }
    return 'showAll';
  }

  setViewMode(contentEl: HTMLElement, mode: TaskListViewMode): void {
    contentEl.setAttr('data-view-mode', mode);
  }

  getSortMethod(
    contentEl: HTMLElement,
    defaultSortMethod: SortMethod,
  ): SortMethod {
    const attr = contentEl.getAttr('data-sort-method');
    if (typeof attr === 'string') {
      if (
        attr === 'default' ||
        attr === 'sortByScheduled' ||
        attr === 'sortByDeadline' ||
        attr === 'sortByPriority' ||
        attr === 'sortByUrgency' ||
        attr === 'sortByKeyword' ||
        attr === 'sortByClosedDate' ||
        attr === 'sortByStarted'
      )
        return attr;
    }
    if (
      defaultSortMethod === 'default' ||
      defaultSortMethod === 'sortByScheduled' ||
      defaultSortMethod === 'sortByDeadline' ||
      defaultSortMethod === 'sortByPriority' ||
      defaultSortMethod === 'sortByUrgency' ||
      defaultSortMethod === 'sortByKeyword' ||
      defaultSortMethod === 'sortByClosedDate' ||
      defaultSortMethod === 'sortByStarted'
    ) {
      return defaultSortMethod;
    }
    return 'default';
  }

  setSortMethod(contentEl: HTMLElement, method: SortMethod): void {
    contentEl.setAttr('data-sort-method', method);
  }

  filterTasksByViewMode(tasks: Task[], mode: TaskListViewMode): Task[] {
    if (mode === 'hideCompleted') {
      return tasks.filter((t) => !t.completed);
    }
    return tasks.slice();
  }

  /** mode -> CompletedTaskSetting, shared by transformForView and counting */
  private getCompletedSetting(mode: TaskListViewMode): CompletedTaskSetting {
    switch (mode) {
      case 'hideCompleted':
        return 'hide';
      case 'sortCompletedLast':
        return 'sortToEnd';
      case 'showAll':
      default:
        return 'showAll';
    }
  }

  /** Warning-period inputs that decide current/upcoming/future classification */
  private getWarningPeriodSettings(): WarningPeriodSettings {
    return {
      upcomingPeriod: this.plugin.settings.upcomingPeriod,
      defaultDeadlineWarningPeriod:
        this.plugin.settings.defaultDeadlineWarningPeriod,
      defaultScheduledWarningPeriod:
        this.plugin.settings.defaultScheduledWarningPeriod,
      skipScheduledWarningPeriodIfDeadline:
        this.plugin.settings.skipScheduledWarningPeriodIfDeadline,
      skipDeadlinePrewarningIfScheduled:
        this.plugin.settings.skipDeadlinePrewarningIfScheduled,
    };
  }

  transformForView(
    tasks: Task[],
    mode: TaskListViewMode,
    sortMethod: SortMethod,
    outClassifications?: Map<Task, TaskClassification>,
  ): Task[] {
    const now = new Date();

    const completedSetting = this.getCompletedSetting(mode);
    const futureSetting = this.plugin.settings.futureTaskSorting;

    let keywordConfig: KeywordSortConfig | undefined;
    if (
      sortMethod === 'sortByKeyword' ||
      sortMethod === 'sortByUrgency' ||
      sortMethod === 'sortByPriority' ||
      sortMethod === 'sortByScheduled' ||
      sortMethod === 'sortByDeadline' ||
      sortMethod === 'sortByClosedDate' ||
      sortMethod === 'sortByStarted'
    ) {
      keywordConfig = this.getKeywordSortConfig();
    }

    const warningSettings = this.getWarningPeriodSettings();
    // Optional shared classifications: when the caller will also run the
    // hidden-count pass (empty-state branch of a refresh), it passes a map
    // so both passes classify the task set exactly once.
    if (outClassifications) {
      classifyAll(tasks, now, warningSettings, outClassifications);
    }

    const sortedTasks = sortTasksWithThreeBlockSystem(
      tasks,
      now,
      futureSetting,
      completedSetting,
      sortMethod,
      keywordConfig,
      warningSettings,
      outClassifications,
    );

    return sortedTasks;
  }

  /**
   * Count tasks the current view mode and future-dating setting exclude from
   * the list. Uses the same classifier and settings as transformForView, so the
   * invariant holds: transformForView(...).length + future + completed === tasks.length
   *
   * Only call this when the list is empty — it is a full extra pass.
   *
   * When `classifications` (the map filled by `transformForView` for the
   * same task set) is provided, no classification work happens here — the
   * shared map already covers every task, so the pair runs one pass total.
   */
  countHiddenByFilters(
    tasks: Task[],
    mode: TaskListViewMode,
    classifications?: Map<Task, TaskClassification>,
  ): HiddenTaskCounts {
    const now = new Date();
    const completedSetting = this.getCompletedSetting(mode);
    const futureSetting = this.plugin.settings.futureTaskSorting;
    const warningSettings = this.getWarningPeriodSettings();

    let future = 0;
    let completed = 0;

    for (const task of tasks) {
      const classification = classifications?.get(task);
      const { category } =
        classification ?? classifyTask(task, now, warningSettings);
      if (category === 'completed') {
        if (completedSetting === 'hide') completed++;
      } else if (futureSetting === 'hideFuture') {
        if (category === 'upcoming' || category === 'future') future++;
      } else if (futureSetting === 'showUpcoming' && category === 'future') {
        future++;
      }
      // 'showAll' and 'sortToEnd' hide nothing: sortToEnd renders the future
      // tasks in a trailing block.
    }

    return { future, completed };
  }

  getKeywordSortConfig(): KeywordSortConfig {
    const keywords = this.keywordManager.getAllKeywords().join(',');
    if (!this.cachedKeywordConfig || this.cachedKeywords !== keywords) {
      this.cachedKeywords = keywords;
      this.cachedKeywordConfig = buildKeywordSortConfig(this.keywordManager);
    }

    return this.cachedKeywordConfig;
  }
}
