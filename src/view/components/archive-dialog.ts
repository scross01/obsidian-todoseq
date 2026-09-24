import { App, Notice } from 'obsidian';
import {
  ArchiveStateMapping,
  TodoTrackerSettings,
} from '../../settings/settings-types';
import { KeywordManager } from '../../utils/keyword-manager';
import { DateUtils } from '../../utils/date-utils';
import { Task } from '../../types/task';
import {
  ApplyArchiveDeps,
  ArchiveCandidate,
  ArchiveMatch,
  ArchiveRunConfig,
  ArchiveRunResult,
} from '../../services/archive-service';

// TODOseq plugin type (structural; avoids importing main.ts which does not import views).
interface ArchiveDialogPlugin {
  settings: TodoTrackerSettings;
  taskStateManager: {
    getTasks(): Task[];
    findTaskByPathAndLine(
      path: string,
      line: number,
      cellIndex?: number,
    ): Task | null;
  };
  taskUpdateCoordinator: {
    updateTaskState(
      task: Task,
      newState: string,
      source?: string,
    ): Promise<void>;
  };
  archiveService: {
    evaluateArchiveCriteria(
      tasks: readonly ArchiveCandidate[],
      config?: ArchiveRunConfig,
      referenceDate?: Date,
    ): ArchiveMatch[];
    applyArchives(
      matches: readonly ArchiveMatch[],
      deps: ApplyArchiveDeps,
    ): Promise<ArchiveRunResult>;
    hasUndoableRun(): boolean;
  };
  keywordManager: KeywordManager;
  vaultScanner: { getKeywordManager(): KeywordManager } | null;
  saveSettings(): Promise<void>;
  scanVault(): Promise<void>;
  app: App;
}

/**
 * One settings/mapping row for the Auto-Archive dialog and settings section.
 * Derived from the user's completed-keyword set plus any stored mappings, so
 * it stays valid by construction: only real keywords appear as sources, and
 * only real archived-group keywords are offered as targets.
 */
export interface ArchiveMappingRow {
  /** Completed-state keyword this row configures (e.g. DONE, CANCELLED). */
  source: string;
  /** Whether this mapping participates in archive runs. */
  enabled: boolean;
  /** Target archived-group keyword (e.g. ARCHIVED, ABANDONED). */
  target: string;
  /** True when the stored target is no longer a valid archived keyword. */
  targetInvalid: boolean;
  /** Valid target options for this row's dropdown (archived keywords, order preserved). */
  validTargets: string[];
}

/**
 * Build one mapping row per completed keyword. Stored mappings carry over
 * `enabled`/`target`; unmapped sources default to disabled with the default
 * target. First stored mapping wins when duplicates exist. Targets that are
 * no longer valid archived keywords are flagged (targetInvalid) but left
 * untouched until the user changes them.
 */
export function buildArchiveMappingRows(
  completedKeywords: string[],
  archivedKeywords: string[],
  stored: ArchiveStateMapping[],
  defaultTarget: string,
): ArchiveMappingRow[] {
  const storedBySource = new Map<string, ArchiveStateMapping>();
  for (const mapping of stored) {
    if (!storedBySource.has(mapping.source)) {
      storedBySource.set(mapping.source, mapping);
    }
  }

  return completedKeywords.map((source) => {
    const mapping = storedBySource.get(source);
    const target = mapping ? mapping.target : defaultTarget;
    return {
      source,
      enabled: mapping ? mapping.enabled : false,
      target,
      targetInvalid:
        mapping !== undefined && !archivedKeywords.includes(mapping.target),
      validTargets: archivedKeywords,
    };
  });
}

/**
 * Inverse of buildArchiveMappingRows for persistence: rows → stored
 * mappings. Keeps disabled rows and invalid targets so user configuration
 * survives keyword-set changes (invalid targets are simply unusable at run
 * time — the evaluator validates them).
 */
export function toStateMappings(
  rows: ArchiveMappingRow[],
): ArchiveStateMapping[] {
  return rows.map((row) => ({
    source: row.source,
    enabled: row.enabled,
    target: row.target,
  }));
}

/** Render cap for the preview list — beyond this, show a muted "N more" footer. */
const PREVIEW_RENDER_LIMIT = 200;

const DAYS_PRESETS = [30, 90, 180, 365];

export class ArchiveDialog {
  private modalEl: HTMLElement | null = null;
  private backdropEl: HTMLElement | null = null;
  private rows: ArchiveMappingRow[] = [];
  private includedPaths = new Set<string>();
  private applyBtn: HTMLButtonElement | null = null;
  private applyLabel = '';
  private previewCountEl: HTMLElement | null = null;
  private previewListEl: HTMLElement | null = null;
  private mappingWarningEl: HTMLElement | null = null;

  constructor(
    private plugin: ArchiveDialogPlugin,
    private keywordManager: KeywordManager,
  ) {}

  open(): void {
    const backdrop = activeDocument.body.createDiv({
      cls: 'todoseq-archive-backdrop',
    });
    backdrop.addEventListener('click', () => this.close());
    this.backdropEl = backdrop;

    const modal = activeDocument.body.createDiv({
      cls: 'todoseq-archive-modal',
    });
    modal.addEventListener('click', (e) => e.stopPropagation());
    modal.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.close();
    });
    this.modalEl = modal;

    this.buildHeader();
    this.buildCriteriaSection();
    this.buildMappingSection();
    this.buildPreviewSection();
    this.buildFooter();

    this.refreshPreview();
  }

  close(): void {
    if (this.modalEl) {
      this.modalEl.remove();
      this.modalEl = null;
    }
    if (this.backdropEl) {
      this.backdropEl.remove();
      this.backdropEl = null;
    }
  }

  private buildHeader(): void {
    if (!this.modalEl) return;
    const titleEl = this.modalEl.createDiv({ cls: 'todoseq-archive-title' });
    titleEl.createSpan({ text: 'Archive completed tasks' });
    const closeBtn = titleEl.createDiv({
      cls: 'todoseq-archive-close clickable-icon',
    });
    closeBtn.createSpan({ text: '\u00D7' });
    closeBtn.addEventListener('click', () => this.close());
  }

  // ── Criteria ────────────────────────────────────────────────────────────

  private buildCriteriaSection(): void {
    if (!this.modalEl) return;
    const archive = this.plugin.settings.taskArchive;

    const section = this.modalEl.createDiv({
      cls: 'todoseq-archive-section',
    });
    section.createEl('label', { text: 'Archive criterion' });

    const criteriaRow = section.createDiv({ cls: 'todoseq-archive-criteria' });

    const modeSelect = criteriaRow.createEl('select');
    modeSelect.createEl('option', {
      attr: { value: 'days' },
      text: 'Closed more than',
    });
    modeSelect.createEl('option', {
      attr: { value: 'date' },
      text: 'Closed before',
    });
    modeSelect.value = archive.criterionMode;
    modeSelect.addEventListener('change', async () => {
      archive.criterionMode = modeSelect.value as 'days' | 'date';
      await this.plugin.saveSettings();
      this.renderCriteriaInputs(criteriaRow);
      this.refreshPreview();
    });

    this.renderCriteriaInputs(criteriaRow);

    if (archive.criterionMode === 'date') {
      this.buildDateModeNote(section);
    }
  }

  private renderCriteriaInputs(container: HTMLElement): void {
    container
      .querySelectorAll('.todoseq-archive-criteria-input')
      .forEach((el) => el.remove());
    const archive = this.plugin.settings.taskArchive;

    if (archive.criterionMode === 'days') {
      const daysInput = container.createEl('input', {
        cls: 'todoseq-archive-criteria-input',
        attr: { type: 'number', min: '1', max: '3650' },
      });
      daysInput.value = String(archive.criterionDays);
      daysInput.addEventListener('change', async () => {
        const parsed = Number.parseInt(daysInput.value, 10);
        if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 3650) {
          archive.criterionDays = parsed;
          await this.plugin.saveSettings();
          this.refreshPreview();
        }
      });
      container.createSpan({
        cls: 'todoseq-archive-criteria-input',
        text: 'days ago',
      });

      for (const preset of DAYS_PRESETS) {
        const presetBtn = container.createEl('button', {
          cls: 'todoseq-archive-preset todoseq-archive-criteria-input',
          text: String(preset),
        });
        presetBtn.addEventListener('click', async () => {
          archive.criterionDays = preset;
          await this.plugin.saveSettings();
          daysInput.value = String(preset);
          this.refreshPreview();
        });
      }
    } else {
      const dateInput = container.createEl('input', {
        cls: 'todoseq-archive-criteria-input',
        attr: { type: 'date' },
      });
      dateInput.value = archive.criterionDate;
      dateInput.addEventListener('change', async () => {
        archive.criterionDate = dateInput.value;
        await this.plugin.saveSettings();
        this.refreshPreview();
      });
    }
  }

  private buildDateModeNote(container: HTMLElement): void {
    container
      .createDiv({ cls: 'todoseq-archive-note' })
      .setText(
        'Specific-date mode is available for manual runs only. Automatic archiving (if enabled in settings) always uses the days threshold.',
      );
  }

  // ── Mapping rows ────────────────────────────────────────────────────────

  private buildMappingSection(): void {
    if (!this.modalEl) return;
    const archive = this.plugin.settings.taskArchive;
    const completed =
      this.keywordManager.getKeywordsForGroup('completedKeywords');
    const archived =
      this.keywordManager.getKeywordsForGroup('archivedKeywords');
    const defaultTarget = archived[0] ?? 'ARCHIVED';

    this.rows = buildArchiveMappingRows(
      completed,
      archived,
      archive.stateMappings,
      defaultTarget,
    );

    const section = this.modalEl.createDiv({
      cls: 'todoseq-archive-section',
    });
    section.createEl('label', { text: 'State mappings' });

    for (const row of this.rows) {
      const rowEl = section.createDiv({ cls: 'todoseq-archive-mapping' });

      const toggle = rowEl.createEl('input', {
        attr: { type: 'checkbox' },
      });
      toggle.checked = row.enabled;
      toggle.addEventListener('change', async () => {
        row.enabled = toggle.checked;
        await this.persistMappings();
      });

      rowEl.createSpan({
        cls: 'todoseq-archive-source',
        text: row.source,
      });
      rowEl.createSpan({ cls: 'todoseq-archive-arrow', text: '\u2192' });

      const targetSelect = rowEl.createEl('select');
      for (const target of row.validTargets) {
        targetSelect.createEl('option', {
          attr: { value: target },
          text: target,
        });
      }
      // An invalid stored target is shown as an extra (flagged) option so the
      // user sees what was configured instead of a silent swap.
      if (row.targetInvalid) {
        targetSelect.createEl('option', {
          attr: { value: row.target },
          text: `${row.target} (invalid)`,
        });
        targetSelect.addClass('todoseq-archive-target-invalid');
      }
      targetSelect.value = row.target;
      targetSelect.addEventListener('change', async () => {
        row.target = targetSelect.value;
        targetSelect.removeClass('todoseq-archive-target-invalid');
        row.targetInvalid = !row.validTargets.includes(row.target);
        await this.persistMappings();
      });
    }

    this.mappingWarningEl = section.createDiv({
      cls: 'todoseq-archive-note todoseq-archive-mapping-warning',
    });
  }

  private async persistMappings(): Promise<void> {
    this.plugin.settings.taskArchive.stateMappings = toStateMappings(this.rows);
    await this.plugin.saveSettings();
    this.refreshPreview();
  }

  // ── Preview ─────────────────────────────────────────────────────────────

  private buildPreviewSection(): void {
    if (!this.modalEl) return;
    const section = this.modalEl.createDiv({
      cls: 'todoseq-archive-section todoseq-archive-preview-section',
    });
    this.previewCountEl = section.createDiv({
      cls: 'todoseq-archive-preview-count',
    });
    this.previewListEl = section.createDiv({
      cls: 'todoseq-archive-preview',
    });
  }

  private refreshPreview(): void {
    if (!this.previewCountEl || !this.previewListEl) return;

    const matches = this.evaluateMatches();
    const included = matches.filter((m) =>
      this.includedPaths.has(`${m.path}:${m.line}`),
    );

    this.previewCountEl.setText(
      matches.length === 1 ? '1 task matches' : `${matches.length} tasks match`,
    );
    this.previewListEl.empty();

    if (matches.length === 0) {
      this.previewListEl
        .createDiv({ cls: 'todoseq-archive-empty' })
        .setText('No tasks match the current criteria.');
    } else {
      const visible = matches.slice(0, PREVIEW_RENDER_LIMIT);
      for (const match of visible) {
        this.buildPreviewRow(match);
      }
      if (matches.length > PREVIEW_RENDER_LIMIT) {
        this.previewListEl
          .createDiv({ cls: 'todoseq-archive-more' })
          .setText(`+${matches.length - PREVIEW_RENDER_LIMIT} more not shown`);
      }
    }

    this.updateMappingWarning();
    this.updateApplyButton(included.length, matches);
  }

  private buildPreviewRow(match: ArchiveMatch): void {
    if (!this.previewListEl) return;
    const key = `${match.path}:${match.line}`;
    const rowEl = this.previewListEl.createDiv({
      cls: 'todoseq-archive-row',
    });

    const checkbox = rowEl.createEl('input', { attr: { type: 'checkbox' } });
    checkbox.checked = this.includedPaths.has(key);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        this.includedPaths.add(key);
      } else {
        this.includedPaths.delete(key);
      }
      const included = this.currentMatches.filter((m) =>
        this.includedPaths.has(`${m.path}:${m.line}`),
      );
      this.updateApplyButton(included.length, this.currentMatches);
    });

    const textWrap = rowEl.createDiv({ cls: 'todoseq-archive-row-text' });
    textWrap.createSpan({
      cls: 'todoseq-archive-task-text',
      text: match.rawText.replace(/^\s*-\s*\[.?\]\s*/, '').trim(),
    });
    const meta = textWrap.createDiv({ cls: 'todoseq-archive-row-meta' });
    meta.createSpan({
      cls: 'todoseq-archive-path',
      text: match.path,
    });
    if (match.closedDate) {
      meta.createSpan({
        cls: 'todoseq-archive-closed',
        text: DateUtils.formatDateForDisplay(match.closedDate, false),
      });
    }
    rowEl.createSpan({
      cls: 'todoseq-archive-chip',
      text: `${match.state} \u2192 ${match.target}`,
    });
  }

  // Snapshot of the most recent evaluation, for checkbox toggles.
  private currentMatches: ArchiveMatch[] = [];

  private evaluateMatches(): ArchiveMatch[] {
    const archive = this.plugin.settings.taskArchive;
    const tasks = this.plugin.taskStateManager.getTasks();
    this.currentMatches = this.plugin.archiveService.evaluateArchiveCriteria(
      tasks,
      {
        criterionMode: archive.criterionMode,
        criterionDays: archive.criterionDays,
        criterionDate: archive.criterionDate,
        stateMappings: archive.stateMappings,
        includeNoClosedDate: false,
      },
      new Date(),
    );
    return this.currentMatches;
  }

  private updateMappingWarning(): void {
    if (!this.mappingWarningEl) return;
    const invalidEnabled = this.rows.some((r) => r.enabled && r.targetInvalid);
    this.mappingWarningEl.setText(
      invalidEnabled
        ? 'An enabled mapping has an invalid target. Add it under Archived keywords in settings or pick another target.'
        : '',
    );
    this.mappingWarningEl.toggleClass('todoseq-hidden', !invalidEnabled);
  }

  private updateApplyButton(
    includedCount: number,
    matches: ArchiveMatch[],
  ): void {
    if (!this.applyBtn) return;
    const invalidEnabled = this.rows.some((r) => r.enabled && r.targetInvalid);
    this.applyLabel =
      includedCount === matches.length
        ? `Archive ${includedCount} task${includedCount === 1 ? '' : 's'}`
        : `Archive ${includedCount} of ${matches.length} tasks`;
    this.applyBtn.textContent = this.applyLabel;
    this.applyBtn.disabled = includedCount === 0 || invalidEnabled;
  }

  // ── Footer + apply ──────────────────────────────────────────────────────

  private buildFooter(): void {
    if (!this.modalEl) return;
    const footer = this.modalEl.createDiv({ cls: 'todoseq-archive-footer' });

    footer
      .createDiv({ cls: 'todoseq-archive-undo-note' })
      .setText(
        'You can undo this run until Obsidian restarts (command: "Undo last archive run").',
      );

    const buttons = footer.createDiv({ cls: 'todoseq-archive-buttons' });
    const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());

    this.applyBtn = buttons.createEl('button', {
      cls: 'mod-cta',
    }) as HTMLButtonElement;
    this.applyBtn.addEventListener('click', () => void this.apply());
  }

  private async apply(): Promise<void> {
    if (!this.applyBtn || this.applyBtn.disabled) return;
    const matches = this.evaluateMatches();
    const toApply = matches.filter((m) =>
      this.includedPaths.has(`${m.path}:${m.line}`),
    );
    if (toApply.length === 0) return;

    this.applyBtn.disabled = true;
    this.applyBtn.textContent = 'Archiving\u2026';

    try {
      const result = await this.plugin.archiveService.applyArchives(toApply, {
        getTask: (path, line) =>
          this.plugin.taskStateManager.findTaskByPathAndLine(path, line),
        apply: (task, target) =>
          this.plugin.taskUpdateCoordinator.updateTaskState(
            task,
            target,
            'task-list',
          ),
      });

      const archivedCount = result.archived.length;
      const skippedCount = result.skipped.length;
      this.close();
      new Notice(
        `Archived ${archivedCount} tasks` +
          (skippedCount > 0
            ? `, skipped ${skippedCount} (changed since preview)`
            : ''),
      );
      await this.plugin.scanVault();
    } catch (error) {
      console.debug('TODOseq: archive run failed:', error);
      this.applyBtn.disabled = false;
      this.applyBtn.textContent = this.applyLabel;
      new Notice('Archive run failed. See console for details.');
    }
  }
}
