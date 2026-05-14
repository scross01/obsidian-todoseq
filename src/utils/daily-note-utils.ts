import { App, TFile } from 'obsidian';
import {
  appHasDailyNotesPluginLoaded,
  createDailyNote,
  getAllDailyNotes,
  getDailyNote,
  getDateFromFile,
} from 'obsidian-daily-notes-interface';
import { moment } from 'obsidian';
import { Task } from '../types/task';

// Cache for daily notes plugin status to avoid repeated file reads
let dailyNotesPluginEnabledCache: boolean | null = null;

/**
 * Determines if a file is a daily note and extracts its date
 * @param app The Obsidian app instance
 * @param file The file to check
 * @returns An object with isDailyNote flag and the daily note date (or null if not a daily note)
 */
export function getDailyNoteInfo(
  app: App,
  file: TFile,
): {
  isDailyNote: boolean;
  dailyNoteDate: Date | null;
} {
  try {
    // Use obsidian-daily-notes-interface to check if this is a daily note
    // getDateFromFile returns a Moment object if the file matches daily note format
    // or null if it's not a daily note
    const momentDate = getDateFromFile(file, 'day');

    if (momentDate) {
      // Convert Moment to standard JavaScript Date
      return {
        isDailyNote: true,
        dailyNoteDate: momentDate.toDate(),
      };
    }

    // Not a daily note
    return {
      isDailyNote: false,
      dailyNoteDate: null,
    };
  } catch (error) {
    // If there's any error (e.g., daily notes plugin not available),
    // fall back to not being a daily note
    console.warn('Daily note detection failed:', error);
    return {
      isDailyNote: false,
      dailyNoteDate: null,
    };
  }
}

/**
 * Check if Daily Notes core plugin is enabled (synchronous version for command palette)
 * @param app The Obsidian app instance
 * @returns true if Daily Notes plugin is enabled
 */
export function isDailyNotesPluginEnabledSync(app: App): boolean {
  // Return cached value if available
  if (dailyNotesPluginEnabledCache !== null) {
    return dailyNotesPluginEnabledCache;
  }

  // Check via obsidian-daily-notes-interface (synchronous, no file reading)
  try {
    const settings = appHasDailyNotesPluginLoaded();
    const isEnabled = settings !== undefined;
    dailyNotesPluginEnabledCache = isEnabled;
    return isEnabled;
  } catch {
    // Fallback: if there's any error, assume plugin is not available
    return false;
  }
}

/**
 * Check if Daily Notes core plugin is enabled
 * @param app The Obsidian app instance
 * @param forceRefresh Force a refresh of plugin status cache
 * @returns true if Daily Notes plugin is enabled
 */
export function isDailyNotesPluginEnabled(
  app: App,
  forceRefresh = false,
): Promise<boolean> {
  // If we have a cached value and not forcing refresh, return it
  if (dailyNotesPluginEnabledCache !== null && !forceRefresh) {
    return Promise.resolve(dailyNotesPluginEnabledCache);
  }

  try {
    // Check .obsidian/core-plugins.json file to determine plugin status
    const adapter = app.vault.adapter;
    const corePluginsPath = `${app.vault.configDir}/core-plugins.json`;

    // Read core plugins file
    return adapter
      .read(corePluginsPath)
      .then((data) => {
        try {
          const plugins = JSON.parse(data) as Record<string, boolean>;
          const isEnabled = plugins['daily-notes'] === true;

          // Cache the result
          dailyNotesPluginEnabledCache = isEnabled;
          return isEnabled;
        } catch (error) {
          console.warn('Failed to parse core-plugins.json:', error);
          dailyNotesPluginEnabledCache = false;
          return false;
        }
      })
      .catch((error) => {
        console.warn('Failed to read core-plugins.json:', error);
        dailyNotesPluginEnabledCache = false;
        return false;
      });
  } catch (error) {
    // Fallback to checking via obsidian-daily-notes-interface
    console.warn(
      'Error checking daily notes plugin status, using fallback:',
      error,
    );
    try {
      const settings = appHasDailyNotesPluginLoaded();
      const isEnabled = settings !== undefined;
      dailyNotesPluginEnabledCache = isEnabled;
      return Promise.resolve(isEnabled);
    } catch {
      dailyNotesPluginEnabledCache = false;
      return Promise.resolve(false);
    }
  }
}

/**
 * Refresh daily notes plugin status cache
 * Call this when plugin settings change to ensure cache is updated
 */
export function refreshDailyNotesPluginStatus(): void {
  dailyNotesPluginEnabledCache = null;
}

/**
 * Get today's daily note, creating it if it doesn't exist
 * @param app The Obsidian app instance
 * @returns The today daily note file
 * @throws Error if daily notes plugin is not enabled or note creation fails
 */
export async function getTodayDailyNote(app: App): Promise<TFile> {
  try {
    if (!(await isDailyNotesPluginEnabled(app))) {
      throw new Error('Daily notes plugin is not enabled');
    }

    const today: moment.Moment = window.moment();
    const allDailyNotes = getAllDailyNotes();

    // Try to get existing daily note
    const existingNote = getDailyNote(today, allDailyNotes);
    if (existingNote) {
      return existingNote;
    }

    // Create new daily note if it doesn't exist
    const note = await createDailyNote(today);
    if (!note) {
      throw new Error('Failed to create daily note');
    }
    return note;
  } catch (error) {
    console.warn('Failed to get or create today daily note:', error);
    throw error;
  }
}

/**
 * Check if a task is on today's daily note
 * @param task The task to check
 * @param todayNote The today daily note file
 * @returns true if the task is on today's daily note
 */
export function isTaskOnTodayDailyNote(task: Task, todayNote: TFile): boolean {
  return task.path === todayNote.path;
}
