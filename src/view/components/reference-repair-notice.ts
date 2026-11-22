import { Notice } from 'obsidian';
import type { TaskWriter } from '../../services/task-writer';

/**
 * In-session retry surface for transfer reference repairs. The command
 * palette remains available, but a user who just transferred a task should
 * not have to find it: this notice keeps the exact failed count and a retry
 * button until dismissed.
 */
export function showReferenceRepairNotice(
  writer: TaskWriter | null,
  failed: number,
): void {
  const notice = new Notice('', 0);
  const row = notice.messageEl.createDiv({
    cls: 'todoseq-notice-actions',
  });
  row.createSpan({
    cls: 'todoseq-notice-message',
    text: `${failed} reference link(s) could not be updated.`,
  });
  if (!writer) return;

  const button = row.createEl('button', {
    cls: 'todoseq-notice-action-btn',
    text: 'Retry',
    attr: { type: 'button' },
  });
  button.addEventListener('click', () => {
    notice.hide();
    void (async () => {
      const reports = await writer.retryPendingReferenceRepairs();
      const remaining = reports.reduce(
        (total, report) => total + report.failed.length,
        0,
      );
      if (remaining === 0) {
        new Notice('Task reference links repaired');
      } else {
        showReferenceRepairNotice(writer, remaining);
      }
    })();
  });
}
