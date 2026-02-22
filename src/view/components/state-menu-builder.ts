import { Menu } from 'obsidian';
import TodoTracker from '../../main';
import {
  BUILTIN_ACTIVE_KEYWORDS,
  BUILTIN_INACTIVE_KEYWORDS,
  BUILTIN_WAITING_KEYWORDS,
  BUILTIN_COMPLETED_KEYWORDS,
  BUILTIN_ARCHIVED_KEYWORDS,
} from '../../utils/constants';

/**
 * Keyword group definition for the state menu
 */
interface KeywordGroup {
  name: string;
  builtin: readonly string[];
  custom: string[];
}

/**
 * Centralized state menu builder for task keyword selection.
 *
 * This class provides a single source of truth for building state selection
 * menus across all views (Editor, Task List, Reader View, Embedded Task Lists).
 *
 * It always reads from the plugin's current settings, ensuring custom keywords
 * are always up-to-date even after settings changes.
 */
export class StateMenuBuilder {
  constructor(private plugin: TodoTracker) {}

  /**
   * Get the list of selectable states for the context menu, organized by group
   * Each group shows built-in keywords first, then custom keywords
   */
  public getSelectableStatesForMenu(
    current: string,
  ): { group: string; states: string[] }[] {
    const groups = this.getKeywordGroups();
    const result: { group: string; states: string[] }[] = [];

    for (const group of groups) {
      // Combine built-in and custom keywords (built-in first, then custom)
      const allKeywords = [...group.builtin, ...group.custom];

      // Deduplicate while preserving order
      const uniqueKeywords = Array.from(new Set(allKeywords));

      // Filter out empty strings and the current state
      const filteredStates = uniqueKeywords.filter((s) => s && s !== current);

      // Only add the group if it has states
      if (filteredStates.length > 0) {
        result.push({
          group: group.name,
          states: filteredStates,
        });
      }
    }

    return result;
  }

  /**
   * Get keyword groups with built-in and custom keywords
   * Returns groups in order: Active, Inactive, Waiting, Completed, Archived
   */
  private getKeywordGroups(): KeywordGroup[] {
    // Get custom keywords from plugin's current settings (always fresh)
    const settings = this.plugin.settings;
    const customActive = settings?.additionalActiveKeywords ?? [];
    const customInactive = settings?.additionalTaskKeywords ?? [];
    const customWaiting = settings?.additionalWaitingKeywords ?? [];
    const customCompleted = settings?.additionalCompletedKeywords ?? [];
    const customArchived = settings?.additionalArchivedKeywords ?? [];

    return [
      {
        name: 'Active',
        builtin: BUILTIN_ACTIVE_KEYWORDS,
        custom: customActive,
      },
      {
        name: 'Inactive',
        builtin: BUILTIN_INACTIVE_KEYWORDS,
        custom: customInactive,
      },
      {
        name: 'Waiting',
        builtin: BUILTIN_WAITING_KEYWORDS,
        custom: customWaiting,
      },
      {
        name: 'Completed',
        builtin: BUILTIN_COMPLETED_KEYWORDS,
        custom: customCompleted,
      },
      {
        name: 'Archived',
        builtin: BUILTIN_ARCHIVED_KEYWORDS,
        custom: customArchived,
      },
    ];
  }

  /**
   * Build a state menu and return it
   */
  public buildStateMenu(
    currentState: string,
    onStateSelected: (state: string) => void,
  ): Menu {
    const menu = new Menu();
    const groups = this.getSelectableStatesForMenu(currentState);

    for (const g of groups) {
      // Section header (disabled item)
      menu.addItem((item) => {
        item.setTitle(g.group);
        item.setDisabled(true);
      });

      for (const state of g.states) {
        menu.addItem((item) => {
          item.setTitle(state);
          item.onClick(() => {
            onStateSelected(state);
          });
        });
      }

      // Divider between groups
      menu.addSeparator();
    }

    return menu;
  }
}
