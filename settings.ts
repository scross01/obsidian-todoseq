import { PluginSettingTab, App, Setting } from 'obsidian';
import TodoTracker from './main';
import { TodoView } from './task-view';
import { TaskViewMode } from "./task-view";

export interface TodoTrackerSettings {
  refreshInterval: number; // refresh interval in seconds
  taskKeywords: string[]; // supported task state keywords, used to limit or expand the default set
  includeCodeBlocks: boolean; // when false, tasks inside fenced code blocks are ignored
  taskViewMode: TaskViewMode; // controls view transformation in the task view
}
// Shared constants so modules don’t re-declare different sources of truth

export const DefaultSettings: TodoTrackerSettings = {
  refreshInterval: 60,
  taskKeywords: ['TODO', 'DOING', 'DONE', 'NOW', 'LATER', 'WAIT', 'WAITING', 'IN-PROGRESS', 'CANCELED', 'CANCELLED'],
  includeCodeBlocks: false,
  taskViewMode: 'default',
};

export class TodoTrackerSettingTab extends PluginSettingTab {
  plugin: TodoTracker;

  constructor(app: App, plugin: TodoTracker) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private refreshAllTaskViews = async () => {
    const leaves = this.app.workspace.getLeavesOfType(TodoView.viewType);
    for (const leaf of leaves) {
      const view = leaf.view as TodoView;
      view.tasks = this.plugin.tasks;
      // Sync each view's mode from settings before render
      const mode = this.plugin.settings.taskViewMode;
      (view as any).setViewMode?.(mode);
      await view.onOpen();
    }
  };

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Refresh Interval')
      .setDesc('How often to rescan the vault for TODOs (in seconds)')
      .addSlider(slider => slider
        .setLimits(10, 300, 10)
        .setValue(this.plugin.settings.refreshInterval)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.refreshInterval = value;
          await this.plugin.saveSettings();
          this.plugin.setupPeriodicRefresh();
          await this.refreshAllTaskViews();
        }));

    new Setting(containerEl)
      .setName('Task Keywords')
      .setDesc('Keywords to scan for (e.g. TODO, FIXME). Leave empty to use defaults.')
      .addText(text => {
        const effective = (this.plugin.settings.taskKeywords && this.plugin.settings.taskKeywords.length > 0)
          ? this.plugin.settings.taskKeywords
          : DefaultSettings.taskKeywords;
        text
          .setValue(effective.join(', '))
          .onChange(async (value) => {
            const parsed = value
              .split(',')
              .map(k => k.trim())
              .filter(k => k.length > 0);
            // Save exactly what the user typed (possibly empty)
            this.plugin.settings.taskKeywords = parsed;
            await this.plugin.saveSettings();
            // Recreate parser according to new settings and rescan
            this.plugin.recreateParser();
            await this.plugin.scanVault();
            await this.refreshAllTaskViews();
          });
      });

    new Setting(containerEl)
      .setName('Include tasks inside code blocks')
      .setDesc('When enabled, tasks inside fenced code blocks (``` or ~~~) will be included.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeCodeBlocks)
        .onChange(async (value) => {
          this.plugin.settings.includeCodeBlocks = value;
          await this.plugin.saveSettings();
          // Recreate parser to reflect includeCodeBlocks change and rescan
          this.plugin.recreateParser();
          await this.plugin.scanVault();
          await this.refreshAllTaskViews();
        }));

    new Setting(containerEl)
      .setName('Task view mode')
      .setDesc('Choose how completed items are shown in the task view.')
      .addDropdown(drop => {
        drop.addOption('default', 'Default');
        drop.addOption('sortCompletedLast', 'Sort completed to end');
        drop.addOption('hideCompleted', 'Hide completed');
        drop.setValue(this.plugin.settings.taskViewMode);
        drop.onChange(async (value: string) => {
          const mode = (value as TaskViewMode);
          this.plugin.settings.taskViewMode = mode;
          await this.plugin.saveSettings();
          await this.refreshAllTaskViews();
        });
      });
  }
}

