import { Vault } from 'obsidian';
import { Task } from '../types/task';
import { TodoTrackerSettings } from '../settings/settings';
import { TaskListViewMode } from '../view/task-list/task-list-view';
import { TAG_PATTERN } from '../utils/patterns';

/**
 * Utility class for collecting and filtering search suggestions
 * Provides data for the prefix filter autocomplete dropdown
 */
export class SearchSuggestions {
  /**
   * Filter tasks based on view mode
   * @param tasks Array of tasks to filter
   * @param mode Current view mode
   * @returns Filtered tasks array
   */
  private static filterTasksByViewMode(
    tasks: Task[],
    mode: TaskListViewMode,
  ): Task[] {
    if (mode === 'hideCompleted') {
      return tasks.filter((t) => !t.completed);
    }
    return tasks.slice(); // Return copy for other modes
  }

  /**
   * Get files that have at least one non-completed task
   * @param tasks Array of tasks to analyze
   * @param mode Current view mode
   * @returns Set of file paths that have non-completed tasks
   */
  private static getFilesWithNonCompletedTasks(
    tasks: Task[],
    mode: TaskListViewMode,
  ): Set<string> {
    if (mode !== 'hideCompleted') {
      // For other modes, include all files
      const allFiles = new Set<string>();
      tasks.forEach((task) => allFiles.add(task.path));
      return allFiles;
    }

    // For hideCompleted mode, only include files with non-completed tasks
    const filesWithNonCompleted = new Set<string>();
    const filteredTasks = this.filterTasksByViewMode(tasks, mode);
    filteredTasks.forEach((task) => filesWithNonCompleted.add(task.path));
    return filesWithNonCompleted;
  }

  /**
   * Get all unique paths from tasks
   * @param tasks Array of tasks to analyze
   * @param mode Current view mode (optional)
   * @returns Array of unique paths, sorted alphabetically
   */
  static getAllPathsFromTasks(
    tasks: Task[],
    mode?: TaskListViewMode,
  ): string[] {
    const pathsSet = new Set<string>();

    // Get files that should be included based on view mode
    const filesToInclude = mode
      ? this.getFilesWithNonCompletedTasks(tasks, mode)
      : new Set(tasks.map((t) => t.path));

    tasks.forEach((task) => {
      // Only process tasks from files that should be included
      if (mode && !filesToInclude.has(task.path)) {
        return;
      }

      const path = task.path;
      // Extract parent directories
      const parts = path.split('/');
      if (parts.length > 1) {
        // Add full path segments (without trailing slashes for display)
        for (let i = 1; i < parts.length; i++) {
          const segment = parts.slice(0, i).join('/');
          if (!pathsSet.has(segment)) {
            pathsSet.add(segment);
          }
        }
      }
    });

    // Convert to array and sort alphabetically
    const paths = Array.from(pathsSet);
    paths.sort((a, b) => a.localeCompare(b));
    return paths;
  }

  /**
        const pathsSet = new Set<string>();
         
        tasks.forEach(task => {
            const path = task.path;
            // Extract parent directories
            const parts = path.split('/');
            if (parts.length > 1) {
                // Add full path segments (without trailing slashes for display)
                for (let i = 1; i < parts.length; i++) {
                    const segment = parts.slice(0, i).join('/');
                    pathsSet.add(segment);
                }
            }
        });
         
        // Convert to array and sort alphabetically
        const paths = Array.from(pathsSet);
        paths.sort((a, b) => a.localeCompare(b));
        return paths;
    }
     
    /**
     * Get all unique paths in the vault (fallback method)
     * @param vault Obsidian vault instance
     * @returns Array of unique paths, sorted alphabetically
     */
  static async getAllPaths(vault: Vault): Promise<string[]> {
    const paths: string[] = [];
    const files = vault.getMarkdownFiles();

    files.forEach((file) => {
      const path = file.path;
      // Extract parent directories
      const parts = path.split('/');
      if (parts.length > 1) {
        // Add full path segments (without trailing slashes for display)
        for (let i = 1; i < parts.length; i++) {
          const segment = parts.slice(0, i).join('/');
          if (!paths.includes(segment)) {
            paths.push(segment);
          }
        }
      }
    });

    // Sort alphabetically
    paths.sort((a, b) => a.localeCompare(b));

    return paths;
  }

  /**
   * Get all unique filenames from tasks
   * @param tasks Array of tasks to analyze
   * @param mode Current view mode (optional)
   * @returns Array of unique filenames, sorted alphabetically
   */
  static getAllFilesFromTasks(
    tasks: Task[],
    mode?: TaskListViewMode,
  ): string[] {
    const filesSet = new Set<string>();

    // Get files that should be included based on view mode
    const filesToInclude = mode
      ? this.getFilesWithNonCompletedTasks(tasks, mode)
      : new Set(tasks.map((t) => t.path));

    tasks.forEach((task) => {
      // Only process tasks from files that should be included
      if (mode && !filesToInclude.has(task.path)) {
        return;
      }

      // Extract filename from path
      const parts = task.path.split('/');
      const filename = parts[parts.length - 1];
      filesSet.add(filename);
    });

    // Convert to array and sort alphabetically
    const files = Array.from(filesSet);
    files.sort((a, b) => a.localeCompare(b));
    return files;
  }

  /**
   * Get all unique filenames in the vault (fallback method)
   * @param vault Obsidian vault instance
   * @returns Array of unique filenames, sorted alphabetically
   */
  static async getAllFiles(vault: Vault): Promise<string[]> {
    const files: string[] = [];
    const markdownFiles = vault.getMarkdownFiles();

    markdownFiles.forEach((file) => {
      const filename = file.name;
      if (!files.includes(filename)) {
        files.push(filename);
      }
    });

    // Sort alphabetically
    files.sort((a, b) => a.localeCompare(b));

    return files;
  }

  /**
   * Extract all unique tags from tasks
   * @param tasks Array of tasks to analyze
   * @param mode Current view mode (optional)
   * @returns Array of unique tags, sorted alphabetically
   */
  static getAllTags(tasks: Task[], mode?: TaskListViewMode): string[] {
    const tagsSet = new Set<string>();

    // Filter tasks based on view mode
    const filteredTasks = mode
      ? this.filterTasksByViewMode(tasks, mode)
      : tasks;

    filteredTasks.forEach((task) => {
      if (task.rawText) {
        // Reset regex for each task to avoid global state issues
        TAG_PATTERN.lastIndex = 0;
        let matches;
        while ((matches = TAG_PATTERN.exec(task.rawText)) !== null) {
          const tag = matches[1]; // Get the captured group
          tagsSet.add(tag);
        }
      }
    });

    // Convert to array and sort alphabetically
    const tags = Array.from(tagsSet);

    // Filter out special priority tags #A, #B, #C
    const filteredTags = tags.filter((tag) => !['A', 'B', 'C'].includes(tag));

    filteredTags.sort((a, b) => a.localeCompare(b));
    return filteredTags;
  }

  /**
   * Get all configured task states
   * @param settings Plugin settings containing additional task keywords
   * @returns Array of task states, sorted alphabetically
   */
  static getAllStates(settings?: TodoTrackerSettings): string[] {
    // Default states plus any additional configured states
    const defaultStates = [
      'TODO',
      'DOING',
      'DONE',
      'NOW',
      'LATER',
      'WAIT',
      'WAITING',
      'IN-PROGRESS',
      'CANCELED',
      'CANCELLED',
    ];

    // Add custom keywords from settings if provided
    const customStates = settings?.additionalTaskKeywords || [];

    // Combine and deduplicate states
    const allStates = Array.from(new Set([...defaultStates, ...customStates]));

    return allStates.sort((a, b) => a.localeCompare(b));
  }

  /**
   * Get priority options
   * @returns Array of priority options
   */
  static getPriorityOptions(): string[] {
    return ['A', 'B', 'C', 'high', 'medium', 'low', 'none'];
  }

  /**
   * Get date suggestion options for scheduled and deadline filters
   * @returns Array of date suggestion options
   */
  static getDateSuggestions(): string[] {
    return [
      'overdue',
      'due',
      'today',
      'tomorrow',
      'this week',
      'next week',
      'this month',
      'next month',
      'next 7 days',
      'none',
    ];
  }

  /**
   * Extract all unique scheduled dates from tasks
   * @param tasks Array of tasks to analyze
   * @param mode Current view mode (optional)
   * @returns Array of unique scheduled dates in YYYY-MM-DD format, sorted chronologically
   */
  static getScheduledDateSuggestions(
    tasks: Task[],
    mode?: TaskListViewMode,
  ): string[] {
    const datesSet = new Set<string>();

    // Filter tasks based on view mode
    const filteredTasks = mode
      ? this.filterTasksByViewMode(tasks, mode)
      : tasks;

    filteredTasks.forEach((task) => {
      if (task.scheduledDate) {
        const dateStr = task.scheduledDate.toISOString().split('T')[0];
        datesSet.add(dateStr);
      }
    });

    // Convert to array and sort chronologically
    const dates = Array.from(datesSet);
    dates.sort((a, b) => a.localeCompare(b));
    return dates;
  }

  /**
   * Extract all unique deadline dates from tasks
   * @param tasks Array of tasks to analyze
   * @param mode Current view mode (optional)
   * @returns Array of unique deadline dates in YYYY-MM-DD format, sorted chronologically
   */
  static getDeadlineDateSuggestions(
    tasks: Task[],
    mode?: TaskListViewMode,
  ): string[] {
    const datesSet = new Set<string>();

    // Filter tasks based on view mode
    const filteredTasks = mode
      ? this.filterTasksByViewMode(tasks, mode)
      : tasks;

    filteredTasks.forEach((task) => {
      if (task.deadlineDate) {
        const dateStr = task.deadlineDate.toISOString().split('T')[0];
        datesSet.add(dateStr);
      }
    });

    // Convert to array and sort chronologically
    const dates = Array.from(datesSet);
    dates.sort((a, b) => a.localeCompare(b));
    return dates;
  }

  /**
   * Filter suggestions based on user input
   * @param query User input text
   * @param suggestions Array of suggestions to filter
   * @returns Filtered suggestions
   */
  static filterSuggestions(query: string, suggestions: string[]): string[] {
    if (!query) return suggestions;

    const searchText = query.toLowerCase();
    return suggestions.filter((suggestion) =>
      suggestion.toLowerCase().includes(searchText),
    );
  }

  /**
   * Clear cached data (useful when vault changes)
   */
  static clearCache(): void {
    // Cache has been removed, this method is now a no-op for backward compatibility
  }
}
