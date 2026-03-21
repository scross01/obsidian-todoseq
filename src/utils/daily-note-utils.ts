import { App, TFile } from 'obsidian';
import {
  appHasDailyNotesPluginLoaded,
  createDailyNote,
  getAllDailyNotes,
  getDailyNote,
  getDateFromFile,
} from 'obsidian-daily-notes-interface';
import moment from 'moment';
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
    const corePluginsPath = '.obsidian/core-plugins.json';

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
 * @returns The today daily note file, or null if daily notes plugin is not enabled
 */
export async function getTodayDailyNote(app: App): Promise<TFile | null> {
  try {
    if (!isDailyNotesPluginEnabled(app)) {
      return null;
    }

    const today = moment();
    const allDailyNotes = getAllDailyNotes();

    // Try to get existing daily note
    const existingNote = getDailyNote(today, allDailyNotes);
    if (existingNote) {
      return existingNote;
    }

    // Create new daily note if it doesn't exist
    return await createDailyNote(today);
  } catch (error) {
    console.warn('Failed to get or create today daily note:', error);
    return null;
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

/**
 * Format a task for copying/moving to daily note (Org mode style, no indentation/bullets/checkbox)
 * @param task The task to format
 * @returns Array of lines representing the task
 */
export function formatTaskForDailyNote(task: Task): string[] {
  const lines: string[] = [];

  // Build the main task line: KEYWORD [#priority] text
  let taskLine = task.state;
  if (task.priority) {
    const priorityMap: Record<string, string> = {
      high: 'A',
      med: 'B',
      low: 'C',
    };
    taskLine += ` [#${priorityMap[task.priority]}]`;
  }
  taskLine += ` ${task.text}`;
  lines.push(taskLine);

  // Add scheduled date if present
  if (task.scheduledDate) {
    const scheduledStr = formatDateForDailyNote(task.scheduledDate);
    lines.push(`SCHEDULED: ${scheduledStr}`);
  }

  // Add deadline date if present
  if (task.deadlineDate) {
    const deadlineStr = formatDateForDailyNote(task.deadlineDate);
    lines.push(`DEADLINE: ${deadlineStr}`);
  }

  return lines;
}

/**
 * Format date for daily note in Org mode format: <2026-03-07 Sat>
 * @param date The date to format
 * @returns Formatted date string
 */
function formatDateForDailyNote(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = weekdays[date.getDay()];
  return `<${year}-${month}-${day} ${weekday}>`;
}
