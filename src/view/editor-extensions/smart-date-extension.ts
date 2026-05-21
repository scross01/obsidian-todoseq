/**
 * CodeMirror extension for smart date recognition
 * Monitors editor changes and cursor movements to trigger date conversion
 */

import { ViewPlugin, ViewUpdate, EditorView } from '@codemirror/view';
import { SmartDateProcessor } from '../../services/smart-date-processor';
import { TodoTrackerSettings } from '../../settings/settings-types';

export const smartDatePlugin = (
  smartDateProcessor: SmartDateProcessor,
  settings: TodoTrackerSettings,
) => {
  return ViewPlugin.fromClass(
    class {
      private lastCursorLine: number = -1;

      constructor(view: EditorView) {
        this.lastCursorLine = this.getCursorLine(view);
      }

      private getCursorLine(view: EditorView): number {
        const cursorPos = view.state.selection.main.head;
        return view.state.doc.lineAt(cursorPos).number;
      }

      update(update: ViewUpdate) {
        if (!settings.enableSmartDateRecognition) return;

        const currentCursorLine = this.getCursorLine(update.view);
        const cursorChanged =
          currentCursorLine !== this.lastCursorLine && this.lastCursorLine >= 1;

        if (update.docChanged) {
          // Editor content changed — trigger cursor-leave for the line just
          // vacated (if the cursor moved) before updating handleEditorUpdate.
          // This prevents the "docChanged suppresses cursor-leave" problem
          // where an Obsidian-managed content update (e.g. vault-scan side-effect)
          // arrives together with a cursor move and silently skips extraction.
          if (cursorChanged) {
            smartDateProcessor.handleCursorLeave(
              update.view,
              this.lastCursorLine,
            );
          }
          this.lastCursorLine = currentCursorLine;
          smartDateProcessor.handleEditorUpdate(update.view, update);
        } else if (cursorChanged) {
          // Content is unchanged — pure cursor movement.
          smartDateProcessor.handleCursorLeave(
            update.view,
            this.lastCursorLine,
          );
          this.lastCursorLine = currentCursorLine;
        }
      }

      destroy() {
        // This extension owns no timers itself; the underlying SmartDateProcessor
        // owns an isProcessing guard + debounceTimers that are scoped by file.
        // Do NOT call smartDateProcessor.destroy() here — that would clear timers
        // for every open editor tab, not just the one being torn down.
        // Global lifecycle cleanup is handled by PluginLifecycleManager.onunload().
      }
    },
  );
};
