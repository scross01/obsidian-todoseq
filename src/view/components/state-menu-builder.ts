import { Menu } from 'obsidian';
import {
  DEFAULT_PENDING_STATES,
  DEFAULT_ACTIVE_STATES,
  DEFAULT_COMPLETED_STATES,
} from '../../types/task';
import { TodoTrackerSettings } from '../../settings/settings';
import { App } from 'obsidian';
import { getPluginSettings } from '../../utils/settings-utils';

export class StateMenuBuilder {
  constructor(
    private app: App,
    private settings: TodoTrackerSettings,
  ) {}

  /**
   * Get the list of selectable states for the context menu, excluding the current state
   */
  public getSelectableStatesForMenu(
    current: string,
  ): { group: string; states: string[] }[] {
    const { pendingActive, completed, additional } = this.getKeywordSets();

    const dedupe = (arr: string[]) => Array.from(new Set(arr));
    const nonCompleted = dedupe([...pendingActive, ...additional]);
    const completedOnly = dedupe(completed);

    // Present two groups: Non-completed and Completed
    const groups: { group: string; states: string[] }[] = [
      {
        group: 'Not completed',
        states: nonCompleted.filter((s) => s && s !== current),
      },
      {
        group: 'Completed',
        states: completedOnly.filter((s) => s && s !== current),
      },
    ];
    return groups.filter((g) => g.states.length > 0);
  }

  /**
   * Return default keyword sets (non-completed and completed) and additional keywords
   */
  private getKeywordSets(): {
    pendingActive: string[];
    completed: string[];
    additional: string[];
  } {
    const pendingActiveDefaults = [
      ...Array.from(DEFAULT_PENDING_STATES),
      ...Array.from(DEFAULT_ACTIVE_STATES),
    ];
    const completedDefaults = Array.from(DEFAULT_COMPLETED_STATES);

    const settings = getPluginSettings(this.app);
    const configured = settings?.additionalTaskKeywords;
    const additional = Array.isArray(configured)
      ? configured.filter(
          (v): v is string => typeof v === 'string' && v.length > 0,
        )
      : [];

    return {
      pendingActive: pendingActiveDefaults,
      completed: completedDefaults,
      additional,
    };
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

      // Divider between groups when both exist
      menu.addSeparator();
    }

    return menu;
  }
}
