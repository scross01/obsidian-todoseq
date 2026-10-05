export interface HiddenTaskSummary {
  future: number;
  completed: number;
}

export interface EmptyStateCopy {
  title: string;
  subtitle: string;
}

/** "3 future-dated and 2 completed tasks" - the counts the view is hiding. */
function buildHiddenPhrase(hidden: HiddenTaskSummary): string {
  const parts: string[] = [];
  if (hidden.future > 0) parts.push(`${hidden.future} future-dated`);
  if (hidden.completed > 0) parts.push(`${hidden.completed} completed`);
  const total = hidden.future + hidden.completed;
  return `${parts.join(' and ')} ${total === 1 ? 'task' : 'tasks'}`;
}

/** Agrees with the total count of the phrase it follows. */
function buildVerb(total: number): string {
  return total === 1 ? 'is' : 'are';
}

/**
 * Build the title and subtitle for an empty Task List.
 *
 * The point is to name the filter responsible rather than tell the user to
 * clear a search they may not have typed. `hidden` comes from
 * TaskListFilter.countHiddenByFilters, so the numbers match the tasks the list
 * actually dropped.
 */
export function buildEmptyStateCopy({
  hasAnyTasks,
  hasSearchQuery,
  hidden,
}: {
  hasAnyTasks: boolean;
  hasSearchQuery: boolean;
  hidden: HiddenTaskSummary;
}): EmptyStateCopy {
  if (!hasAnyTasks) {
    return {
      title: 'No tasks found',
      subtitle:
        // workaround aggressive obsidianmd/ui/sentence-case -- correct case for test.
        'Create tasks in your notes using "' +
        'TODO' +
        ' your task". They will appear here automatically.',
    };
  }

  const total = hidden.future + hidden.completed;
  const hasHidden = total > 0;
  const phrase = hasHidden ? buildHiddenPhrase(hidden) : '';
  const verb = hasHidden ? buildVerb(total) : '';

  if (hasSearchQuery) {
    if (!hasHidden) {
      return {
        title: 'No matching tasks',
        subtitle: 'Try clearing the search or switching view modes.',
      };
    }
    return {
      title: 'No matching tasks',
      subtitle: `Try clearing the search. ${phrase} ${verb} hidden by the current filters.`,
    };
  }

  if (hidden.future > 0 && hidden.completed > 0) {
    return {
      title: 'All tasks are hidden by filters',
      subtitle: `${phrase}. Set "Future dated tasks" and "Completed tasks" to Show to see them.`,
    };
  }

  if (hidden.future > 0) {
    return {
      title: 'All tasks are future-dated',
      subtitle: `${phrase}. Set "Future dated tasks" to Show to see them.`,
    };
  }

  if (hidden.completed > 0) {
    return {
      title: 'All tasks are completed',
      subtitle: `${phrase}. Set "Completed tasks" to Show to see them.`,
    };
  }

  return {
    title: 'No matching tasks',
    subtitle: 'Try clearing the search or switching view modes.',
  };
}
