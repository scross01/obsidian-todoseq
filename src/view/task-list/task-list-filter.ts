import {
  sortTasksWithThreeBlockSystem,
  SortMethod as TaskSortMethod,
  buildKeywordSortConfig,
  KeywordSortConfig,
} from '../../utils/task-sort';
import { Task } from '../../types/task';
import TodoTracker from '../../main';

export type TaskListViewMode =
  | 'showAll'
  | 'sortCompletedLast'
  | 'hideCompleted';
export type SortMethod =
  | 'default'
  | 'sortByScheduled'
  | 'sortByDeadline'
  | 'sortByPriority'
  | 'sortByUrgency'
  | 'sortByKeyword';

export class TaskListFilter {
  private plugin: TodoTracker;
  private cachedKeywordConfig: KeywordSortConfig | null = null;
  private cachedKeywords: string | null = null;

  constructor(plugin: TodoTracker) {
    this.plugin = plugin;
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
        attr === 'sortByKeyword'
      )
        return attr;
    }
    if (
      defaultSortMethod === 'default' ||
      defaultSortMethod === 'sortByScheduled' ||
      defaultSortMethod === 'sortByDeadline' ||
      defaultSortMethod === 'sortByPriority' ||
      defaultSortMethod === 'sortByUrgency' ||
      defaultSortMethod === 'sortByKeyword'
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

  transformForView(
    tasks: Task[],
    mode: TaskListViewMode,
    sortMethod: SortMethod,
  ): Task[] {
    const now = new Date();

    let completedSetting: 'showAll' | 'sortToEnd' | 'hide';
    switch (mode) {
      case 'hideCompleted':
        completedSetting = 'hide';
        break;
      case 'sortCompletedLast':
        completedSetting = 'sortToEnd';
        break;
      case 'showAll':
      default:
        completedSetting = 'showAll';
        break;
    }

    const futureSetting = this.plugin.settings.futureTaskSorting;

    let keywordConfig: KeywordSortConfig | undefined;
    if (sortMethod === 'sortByKeyword') {
      keywordConfig = this.getKeywordSortConfig();
    }

    const sortedTasks = sortTasksWithThreeBlockSystem(
      tasks,
      now,
      futureSetting,
      completedSetting,
      sortMethod as TaskSortMethod,
      keywordConfig,
    );

    return sortedTasks;
  }

  getKeywordSortConfig(): KeywordSortConfig {
    const keywordGroups = {
      activeKeywords: this.plugin.settings?.additionalActiveKeywords ?? [],
      inactiveKeywords: this.plugin.settings?.additionalTaskKeywords ?? [],
      waitingKeywords: this.plugin.settings?.additionalWaitingKeywords ?? [],
      completedKeywords:
        this.plugin.settings?.additionalCompletedKeywords ?? [],
      archivedKeywords: this.plugin.settings?.additionalArchivedKeywords ?? [],
    };

    const keywords = Object.values(keywordGroups).flat().join(',');
    if (!this.cachedKeywordConfig || this.cachedKeywords !== keywords) {
      this.cachedKeywords = keywords;
      this.cachedKeywordConfig = buildKeywordSortConfig(keywordGroups);
    }

    return this.cachedKeywordConfig;
  }
}
