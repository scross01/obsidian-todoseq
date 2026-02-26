import { Menu } from 'obsidian';
import TodoTracker from '../../main';
import { KeywordManager } from '../../utils/keyword-manager';

/**
 * Keyword group definition for the state menu
 */
interface KeywordGroupDefinition {
  name: string;
  states: string[];
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
      // Deduplicate while preserving effective keyword order
      const uniqueKeywords = Array.from(new Set(group.states));

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
  private getKeywordGroups(): KeywordGroupDefinition[] {
    const keywordManager = new KeywordManager(this.plugin.settings ?? {});

    return [
      {
        name: 'Active',
        states: keywordManager.getKeywordsForGroup('activeKeywords'),
      },
      {
        name: 'Inactive',
        states: keywordManager.getKeywordsForGroup('inactiveKeywords'),
      },
      {
        name: 'Waiting',
        states: keywordManager.getKeywordsForGroup('waitingKeywords'),
      },
      {
        name: 'Completed',
        states: keywordManager.getKeywordsForGroup('completedKeywords'),
      },
      {
        name: 'Archived',
        states: keywordManager.getKeywordsForGroup('archivedKeywords'),
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
      // menu.addItem((item) => {
      //   item.setTitle(g.group);
      //   item.setDisabled(true);
      // });

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
