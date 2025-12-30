import { PluginSettingTab, App, Setting, ToggleComponent, Notice } from 'obsidian';
import TodoTracker from '../main';
import { TodoView } from '../view/task-view';
import { LanguageCommentSupportSettings } from "../parser/language-registry";
import { TaskParser } from "../parser/task-parser";

export interface TodoTrackerSettings {
  refreshInterval: number; // refresh interval in seconds
  additionalTaskKeywords: string[]; // capitalised keywords treated as NOT COMPLETED (e.g., FIXME, HACK)
  includeCodeBlocks: boolean; // when false, tasks inside fenced code blocks are ignored
  includeCalloutBlocks: boolean; // when true, tasks inside callout blocks are included
  includeCommentBlocks: boolean; // when true, tasks inside multiline comment blocks ($$) are included
  taskViewMode: 'showAll' | 'sortCompletedLast' | 'hideCompleted'; // controls view transformation in the task view
  languageCommentSupport: LanguageCommentSupportSettings; // language-specific comment support settings
  weekStartsOn: 'Monday' | 'Sunday'; // controls which day the week starts on for date filtering
}

export const DefaultSettings: TodoTrackerSettings = {
  refreshInterval: 60,
  // No additional keywords by default; built-in defaults live in task.ts
  additionalTaskKeywords: [],
  includeCodeBlocks: false,
  includeCalloutBlocks: true, // Enabled by default
  includeCommentBlocks: false, // Disabled by default
  taskViewMode: 'showAll',
  languageCommentSupport: {
    enabled: true,
  },
  weekStartsOn: 'Monday', // Default to Monday as requested
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

            // Create error display element
            const settingContainer = text.inputEl.closest('.setting-item');
            if (!settingContainer) {
              console.error('Could not find setting container');
              return;
            }

            const settingInfo = settingContainer.querySelector('.setting-item-info');
            if (!settingInfo) {
              console.error('Could not find setting info container');
              return;
            }
            // Remove any existing error display
            const existingError = settingContainer.querySelector('.todoseq-setting-item-error');
            if (existingError) {
              existingError.remove();
              text.inputEl.classList.remove('todoseq-invalid-input');
            }
            
            // Filter out invalid keywords and collect errors
            const validKeywords: string[] = [];
            const invalidKeywords: string[] = [];
            const errorMessages: string[] = [];
            
            for (const keyword of parsed) {
              try {
                // Test if this single keyword is valid by trying to create a parser with just this keyword
                const testSettings = {
                  additionalTaskKeywords: [keyword],
                  includeCalloutBlocks: this.plugin.settings.includeCalloutBlocks,
                  includeCodeBlocks: this.plugin.settings.includeCodeBlocks,
                  languageCommentSupport: this.plugin.settings.languageCommentSupport
                };
                // This will throw if the keyword is invalid
                TaskParser.validateKeywords([keyword]);
                validKeywords.push(keyword);
              } catch (error) {
                invalidKeywords.push(keyword);
                errorMessages.push(`"${keyword}": ${error.message}`);
              }
            }
            
            if (invalidKeywords.length > 0) {
              // Show error under the field
              const errorDiv = document.createElement('div');
              errorDiv.className = 'todoseq-setting-item-error';
              errorDiv.textContent = `Invalid keyword ${invalidKeywords.join(', ')} will be ignored.`;
              text.inputEl.classList.add('todoseq-invalid-input');

              // Insert error after the setting description
              settingInfo.appendChild(errorDiv);
              
              // Continue with valid keywords only for parsing, but keep original input for editing
              this.plugin.settings.additionalTaskKeywords = validKeywords;
              await this.plugin.saveSettings();
              
              // Always recreate parser and rescan with valid keywords
              try {
                this.plugin.recreateParser();
                await this.plugin.scanVault();
                await this.refreshAllTaskViews();
              } catch (parseError) {
                console.error('Failed to recreate parser with valid keywords:', parseError);
              }
            } else {            
              // All keywords are valid, proceed normally
              this.plugin.settings.additionalTaskKeywords = parsed;
              await this.plugin.saveSettings();
              // Recreate parser according to new settings and rescan
              this.plugin.recreateParser();
              await this.plugin.scanVault();
              await this.refreshAllTaskViews();
            }
          });
      });


    // Include tasks inside code blocks (parent setting)
    let languageToggleComponent: ToggleComponent | null = null;
    
    new Setting(containerEl)
      .setName('Include tasks inside code blocks')
      .setDesc('When enabled, tasks inside fenced code blocks (``` or ~~~) will be included.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeCodeBlocks)
        .onChange(async (value) => {
          this.plugin.settings.includeCodeBlocks = value;
          // If disabling code blocks, also disable language comment support
          if (!value) {
            this.plugin.settings.languageCommentSupport.enabled = false;
          }
          await this.plugin.saveSettings();
          // Update language toggle visual state by recreating it
          if (languageToggleComponent) {
            languageToggleComponent.setValue(this.plugin.settings.languageCommentSupport.enabled);
          }
          languageSetting.setDisabled(!value);
          // Recreate parser to reflect includeCodeBlocks change and rescan
          this.plugin.recreateParser();
          await this.plugin.scanVault();
          await this.refreshAllTaskViews();
        }));

    // Language comment support settings (dependent on includeCodeBlocks)
    const languageSettingContainer = containerEl.createDiv();
    const languageSetting = new Setting(languageSettingContainer)
      .setName('Enable language comment support')
      .setDesc('When enabled, tasks inside code blocks will be detected using language-specific comment patterns e.g. `// TODO`')
      .addToggle(toggle => {
        languageToggleComponent = toggle;
        return toggle
          .setValue(this.plugin.settings.languageCommentSupport.enabled)
          .onChange(async (value) => {
            this.plugin.settings.languageCommentSupport.enabled = value;
            await this.plugin.saveSettings();
            this.plugin.recreateParser();
            await this.plugin.scanVault();
            await this.refreshAllTaskViews();
          });
      });

    // Set initial disabled state based on includeCodeBlocks setting
    languageSetting.setDisabled(!this.plugin.settings.includeCodeBlocks);

    // Update language toggle when includeCodeBlocks changes
    const updateLanguageToggle = (enabled: boolean) => {
      const languageToggle = languageSetting.settingEl.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (languageToggle) {
        languageToggle.checked = enabled;
      }
      languageSetting.setDisabled(!enabled);
    };

    // Listen for includeCodeBlocks changes and update language toggle accordingly
    updateLanguageToggle(this.plugin.settings.includeCodeBlocks);

    // Include tasks inside callout blocks
    new Setting(containerEl)
      .setName('Include tasks inside quote and callout blocks')
      .setDesc('When enabled, include tasks inside quote and callout blocks (>, >[!info], >[!todo], etc.)')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeCalloutBlocks)
        .onChange(async (value) => {
          this.plugin.settings.includeCalloutBlocks = value;
          await this.plugin.saveSettings();
          // Recreate parser to reflect includeCalloutBlocks change and rescan
          this.plugin.recreateParser();
          await this.plugin.scanVault();
          await this.refreshAllTaskViews();
        }));

    // Include tasks inside comment blocks
    new Setting(containerEl)
      .setName('Include tasks inside comment blocks')
      .setDesc('When enabled, include tasks inside multiline comment blocks ($$).')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeCommentBlocks)
        .onChange(async (value) => {
          this.plugin.settings.includeCommentBlocks = value;
          await this.plugin.saveSettings();
          // Recreate parser to reflect includeCommentBlocks change and rescan
          this.plugin.recreateParser();
          await this.plugin.scanVault();
          await this.refreshAllTaskViews();
        }));

    new Setting(containerEl)
      .setName('Task View mode')
      .setDesc('Choose how completed items are shown in the task view.')
      .addDropdown(drop => {
        drop.addOption('showAll', 'Show all tasks');
        drop.addOption('sortCompletedLast', 'Sort completed to end');
        drop.addOption('hideCompleted', 'Hide completed');
        drop.setValue(this.plugin.settings.taskViewMode);
        drop.onChange(async (value: string) => {
          const mode = (value as 'showAll' | 'sortCompletedLast' | 'hideCompleted');
          this.plugin.settings.taskViewMode = mode;
          await this.plugin.saveSettings();
          await this.refreshAllTaskViews();
              });
            });
      
          new Setting(containerEl)
            .setName('Week starts on')
            .setDesc('Choose which day the week starts on for date filtering.')
            .addDropdown(drop => {
              drop.addOption('Monday', 'Monday');
              drop.addOption('Sunday', 'Sunday');
              drop.setValue(this.plugin.settings.weekStartsOn);
              drop.onChange(async (value: string) => {
                const weekStart = (value as 'Monday' | 'Sunday');
                this.plugin.settings.weekStartsOn = weekStart;
                await this.plugin.saveSettings();
                await this.refreshAllTaskViews();
              });
            });
        }
      }

