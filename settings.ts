import { PluginSettingTab, App, Setting } from 'obsidian';
import TodoTracker from './main';
import { TodoView } from './task-view';
import { TaskViewMode } from "./task-view";
import { LanguageRegistry, LanguageCommentSupportSettings, LanguageDefinition } from "./code-block-tasks";

export interface TodoTrackerSettings {
  refreshInterval: number; // refresh interval in seconds
  additionalTaskKeywords: string[]; // capitalised keywords treated as NOT COMPLETED (e.g., FIXME, HACK)
  includeCodeBlocks: boolean; // when false, tasks inside fenced code blocks are ignored
  taskViewMode: TaskViewMode; // controls view transformation in the task view
  languageCommentSupport: LanguageCommentSupportSettings; // language-specific comment support settings
}

export const DefaultSettings: TodoTrackerSettings = {
  refreshInterval: 60,
  // No additional keywords by default; built-in defaults live in task.ts
  additionalTaskKeywords: [],
  includeCodeBlocks: false,
  taskViewMode: 'default',
  languageCommentSupport: {
    enabled: true,
    languages: ["c", "cpp", "csharp", "dockerfile", "go", "ini", "java", "javascript", "kotlin", "powershell", "python", "r", "ruby", "rust", "shell", "sql", "swift", "toml", "typescript", "yaml"],
  },
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
      if (leaf.view instanceof TodoView) {
        leaf.view.tasks = this.plugin.tasks;
        // Sync each view's mode from settings before render
        const mode = this.plugin.settings.taskViewMode;
        leaf.view.setViewMode(mode);
        await leaf.view.onOpen();
      }
    }
  };

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Refresh interval')
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
      .setName('Additional task Keywords')
      .setDesc('Capitalised list of keywords for treat as tasks (e.g. FIXME, HACK). Leave empty for none.')
      .addText(text => {
        const current = this.plugin.settings.additionalTaskKeywords ?? [];
        text
          .setValue(current.join(', '))
          .onChange(async (value) => {
            // Force uppercase in the UI field immediately
            const forced = value.toUpperCase();
            if (forced !== value) {
              // Update the input control to reflect forced uppercase
              try {
                // Obsidian's TextComponent exposes a setValue method via the same reference.
                text.setValue(forced);
              } catch {
                // no-op if API surface changes
              }
            }

            // Parse CSV, trim, filter non-empty (already uppercased)
            const parsed = forced
              .split(',')
              .map(k => k.trim())
              .filter(k => k.length > 0);

            this.plugin.settings.additionalTaskKeywords = parsed;
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

    // Language comment support settings
    const languageSettingContainer = containerEl.createDiv();
    const languageSetting = new Setting(languageSettingContainer)
      .setName('Enable language comment support')
      .setDesc('When enabled, tasks inside code blocks will be detected using language-specific comment patterns.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.languageCommentSupport.enabled)
        .onChange(async (value) => {
          this.plugin.settings.languageCommentSupport.enabled = value;
          await this.plugin.saveSettings();
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

