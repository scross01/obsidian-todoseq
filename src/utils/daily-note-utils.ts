import { App, TFile } from 'obsidian';
import { getDateFromFile } from 'obsidian-daily-notes-interface';

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
