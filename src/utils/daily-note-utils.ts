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
export function isDailyNotesPluginEnabledSync(_app: App): boolean {
  // The interface returns the real boolean: true when the core Daily Notes
  // plugin is enabled, otherwise the Periodic Notes daily.enabled flag. It
  // reads live in-memory plugin state, so no cache or file read is needed.
  try {
    return appHasDailyNotesPluginLoaded() === true;
  } catch {
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
  _forceRefresh = false,
): Promise<boolean> {
  // Same boolean contract as the sync wrapper, so command availability and
  // actual note resolution cannot disagree. No disk read and no cache: the
  // interface reflects current in-memory provider state.
  return Promise.resolve(isDailyNotesPluginEnabledSync(app));
}

/**
 * Refresh daily notes plugin status cache
 * Call this when plugin settings change to ensure cache is updated
 */
export function refreshDailyNotesPluginStatus(): void {
  // Kept for callers: availability is read live, so there is nothing to reset.
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
