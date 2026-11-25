import { App, TFile, MarkdownView, EditorPosition, Editor } from 'obsidian';
import {
  Task,
  DateRepeatInfo,
  WarningPeriodInfo,
  TaskPropertyKey,
} from '../types/task';
import { CHECKBOX_DETECTION_REGEX } from '../utils/patterns';
import {
  appendBlockAnchor,
  splitTrailingBlockAnchor,
} from '../utils/block-anchor';
import {
  findTaskBlockAnchor,
  findTaskBlockEndLine,
  relocateBlockAnchorInEditor as relocateAnchorInEditor,
} from '../utils/task-block-anchor';
import { KeywordManager } from '../utils/keyword-manager';
import { DateUtils } from '../utils/date-utils';
import { buildWarningPeriodString } from '../utils/date-repeater';
import {
  findDateLine,
  findDescriptionLine,
  isTaskLine,
  parseTableCells,
  getTaskIndent,
  getDateLineIndent,
  getIndentLength,
  supportsTaskMetadata,
  replaceTableCellContent,
  findOrgPlanningToken,
  replaceOrgPlanningToken,
} from '../utils/task-line-utils';
import { DateParser } from '../parser/date-parser';
import type { EditorView } from '@codemirror/view';
import TodoTracker from '../main';
import { getStateTransitionManager } from './task-update-coordinator';
import {
  classifyTaskMetadataLine,
  getTaskRemovalRange,
  modifyLinesForMigration,
  readTaskBlockFromLines,
} from '../utils/task-sub-bullets';
import {
  extractTaskProperties,
  isPropertiesDrawerStart,
  parseDependencyValue,
  readTaskPropertiesDrawer,
  type ParsedTaskProperties,
  type TaskPropertiesDrawer,
} from '../utils/task-properties';
import { buildWikiLink, findWikiLinks } from '../utils/task-link';
import {
  TaskReferenceEdit,
  TaskReferenceRepairReport,
  TaskReferenceScanResult,
  TaskReferenceService,
} from './task-reference-service';

/** A SCHEDULED/DEADLINE/CLOSED/STARTED date line kind. */
type DateLineType = 'SCHEDULED' | 'DEADLINE' | 'CLOSED' | 'STARTED';

export type TaskTransferStatus =
  | 'success'
  | 'already-there'
  | 'stale-source'
  | 'destination-failed'
  | 'partial'
  | 'partial-references';

export interface TaskTransferResult {
  status: TaskTransferStatus;
  reason?: string;
  /** Per-note outcome when references were repaired after the transfer. */
  referenceRepairs?: TaskReferenceRepairReport[];
  /** Notes discovery could not read; no edit exists for these paths yet. */
  unreadablePaths?: string[];
  /** Reference discovery failed as a whole, so no edit retry exists. */
  referenceDiscoveryFailed?: boolean;
}

export interface DateLineUpdateResult {
  task: Task;
  lineDelta: number;
}

export type TaskPropertyWriteStatus =
  'success' | 'unsupported' | 'ambiguous' | 'failed';

export interface TaskPropertyWriteResult {
  status: TaskPropertyWriteStatus;
  task: Task | null;
  lineDelta: number;
  reason?: string;
}

export interface TaskPropertyUpdate {
  key: TaskPropertyKey;
  value: string | null;
}

export interface TaskIdentityWriteResult extends TaskPropertyWriteResult {
  identity?: string;
  link?: string;
}

/** A fully formatted metadata line produced by smart-date recognition. */
export interface SmartDateLine {
  type: DateLineType;
  dateText: string;
}

/**
 * One synchronous smart-date edit, computed against the current editor
 * document. `replaceLineNumber` is 1-based; null inserts new date lines
 * directly below the task line.
 */
export interface SmartDateEditRequest {
  filePath: string;
  lineNumber: number;
  expectedTaskText: string;
  updatedTaskText: string;
  dateLines: SmartDateLine[];
  replaceLineNumber: number | null;
  triggerSource: 'debounce' | 'cursorLeave';
}

/**
 * Handles writing task state changes to files.
 */
export class TaskWriter {
  /**
   * Prefer Editor API for the active file to preserve cursor/selection/folds and UX.
   * Prefer Vault.process for background edits to perform atomic writes.
   */
  /** Failed repairs kept session-only so the user can retry just those. */
  private pendingReferenceEdits: TaskReferenceEdit[] = [];

  constructor(
    private readonly plugin: TodoTracker,
    private keywordManager: KeywordManager,
  ) {}

  private get referenceService(): TaskReferenceService {
    return new TaskReferenceService(this.app);
  }

  /**
   * Apply a smart-date conversion as one editor transaction.
   *
   * The task-line replacement and the date-line write are disjoint changes
   * against the same original document, so every other metadata line between
   * them (SCHEDULED, DEADLINE, STARTED, CLOSED, DESCRIPTION) is preserved
   * byte-for-byte. Synchronous by design: smart-date recognition runs inside a
   * requestAnimationFrame callback and must not await the file queue.
   */
  applySmartDateEdit(
    request: SmartDateEditRequest,
    task: Task,
    view: EditorView,
  ): boolean {
    const mdView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (mdView?.file?.path !== request.filePath) return false;

    const state = view.state;
    if (request.lineNumber < 1 || request.lineNumber > state.doc.lines) {
      return false;
    }
    const taskLine = state.doc.line(request.lineNumber);
    if (taskLine.text !== request.expectedTaskText) return false;
    if (request.dateLines.length === 0) return false;

    const indent = getDateLineIndent(task);
    const block = request.dateLines
      .map((line) => `${indent}${line.type}: ${line.dateText}`)
      .join('\n');
    const existingAnchor = splitTrailingBlockAnchor(taskLine.text).anchor;

    const changes: { from: number; to: number; insert: string }[] = [
      { from: taskLine.from, to: taskLine.to, insert: request.updatedTaskText },
    ];

    if (request.replaceLineNumber !== null) {
      const lineNumber = request.replaceLineNumber;
      if (lineNumber < 1 || lineNumber > state.doc.lines) return false;
      const existing = state.doc.line(lineNumber);
      if (existing.number === taskLine.number) return false;
      changes.push({ from: existing.from, to: existing.to, insert: block });
    } else {
      changes.push({
        from: taskLine.to,
        to: taskLine.to,
        insert: `\n${block}`,
      });
    }

    if (request.triggerSource === 'debounce') {
      // Cursor to the end of the last written date line. Resolve it against
      // the post-change document so the earlier task-line edit is accounted
      // for.
      const mapped = state.update({ changes });
      const dateLineNumber =
        request.replaceLineNumber ??
        request.lineNumber + request.dateLines.length;
      const anchor = mapped.state.doc.line(dateLineNumber).to;
      view.dispatch({ changes, selection: { anchor, head: anchor } });
    } else {
      view.dispatch({ changes });
    }

    // Date insertion moves the block end, so a captured anchor is re-homed
    // after the transaction instead of being stranded above the new line.
    if (existingAnchor && mdView.editor) {
      this.relocateBlockAnchorInEditor(
        mdView.editor,
        { ...task, line: request.lineNumber - 1 },
        existingAnchor,
      );
    }

    return true;
  }

  /**
   * Update the KeywordManager instance when settings change.
   */
  public updateKeywordManager(keywordManager: KeywordManager): void {
    this.keywordManager = keywordManager;
  }

  private get app(): App {
    return this.plugin.app;
  }

  private get settings() {
    return this.plugin.settings;
  }

  /**
   * Read a file through the live editor buffer when it is open, so unsaved
   * edits are part of the transfer and never overwritten by a stale read.
   */
  private getTransferEditor(file: TFile): Editor | null {
    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (md?.file?.path !== file.path) return null;
    return md.editor ?? null;
  }

  private async readFileText(file: TFile): Promise<string> {
    const editor = this.getTransferEditor(file);
    if (!editor) return this.app.vault.read(file);
    const lines: string[] = [];
    for (let i = 0; i < editor.lineCount(); i++) lines.push(editor.getLine(i));
    return lines.join('\n');
  }

  /** True when the line still holds the task's state keyword and text. */
  private lineMatchesTask(line: string | undefined, task: Task): boolean {
    if (typeof line !== 'string') return false;
    if (task.isTableTask && task.tableCell) {
      const cell = parseTableCells(line)[task.tableCell.cellIndex];
      if (!cell) return false;
      return (
        cell.content.includes(task.state) && cell.content.includes(task.text)
      );
    }
    return line.includes(task.state) && line.includes(task.text);
  }

  /**
   * Recurrence mutation precondition: the verified row must still be the row
   * the request identified. Exact task content avoids accepting a longer title
   * that merely contains the original one; table rows compare only the target
   * cell so unrelated cells may be edited concurrently.
   */
  private lineMatchesRecurrenceTarget(
    line: string | undefined,
    task: Task,
  ): boolean {
    if (typeof line !== 'string') return false;
    const expected = task.rawText.trim();
    if (task.isTableTask && task.tableCell) {
      const cell = parseTableCells(line)[task.tableCell.cellIndex];
      if (!cell) return false;
      const taskPart = cell.content.split(/<br\s*\/?>/i)[0]?.trim() ?? '';
      // A table state write stores the whole cell in rawText, including the
      // <br> date metadata, so compare task segments on both sides: an anchor
      // at the end of the cell's task part is not at the end of the cell.
      const expectedPart = expected.split(/<br\s*\/?>/i)[0]?.trim() ?? '';
      if (taskPart === expectedPart) return true;
      const body = taskPart
        .replace(/^[\s>]*(?:[-*+]\s+)?(?:\[[ xX]\]\s+)?/, '')
        .replace(/^\[#(?:A|B|C)\]\s+/, '');
      if (body !== `${task.state} ${task.text}`.trim()) return false;
      // The parser strips a trailing block anchor out of `task.text`, so the
      // normalized form also matches a replacement row that dropped the
      // anchor. The anchor is the block's identity: prefer the verified
      // task's own anchor (embedReference survives a full-cell snapshot).
      const expectedAnchor =
        task.embedReference?.replace(/^\^/, '').trim() ||
        splitTrailingBlockAnchor(expectedPart).anchor;
      return splitTrailingBlockAnchor(taskPart).anchor === expectedAnchor;
    }
    return line.trim() === expected;
  }

  /**
   * A queued rollover may only mutate the block that carried the request's
   * authored identity. Headline text and planning values can be identical in
   * two blocks; the drawer ID and block-end anchor distinguish them.
   */
  private blockIdentityMatches(lines: string[], task: Task): boolean {
    if (task.isTableTask) return true;

    // Compare both presence and value. A replacement block that introduces
    // an anchor where the verified target had none is just as much a
    // different block as one whose anchor changed.
    if (task.sourceFormat !== 'org' && task.sourceFormat !== 'code-comment') {
      const expectedAnchor =
        task.embedReference?.replace(/^\^/, '').trim() || null;
      const actualAnchor =
        findTaskBlockAnchor(lines, task.line, getTaskIndent(task))?.anchor ??
        null;
      if (actualAnchor !== expectedAnchor) return false;
    }

    const drawer = this.findOwnedPropertiesDrawer(lines, task);
    const ids =
      drawer?.entries.filter((entry) => entry.canonicalKey === 'ID') ?? [];
    if (!task.id) return ids.length === 0;
    if (ids.length !== 1) return false;
    return (
      extractTaskProperties(drawer!, this.propertyFormat(task)).id === task.id
    );
  }

  /** Recurrence-specific planning values carried from the queued request. */
  private recurrencePlanningMatches(
    lines: string[],
    task: Task,
    expected:
      | {
          scheduledDate?: Date | null;
          scheduledDateRepeat?: DateRepeatInfo | null;
          scheduledWarningPeriod?: WarningPeriodInfo | null;
          deadlineDate?: Date | null;
          deadlineDateRepeat?: DateRepeatInfo | null;
          deadlineWarningPeriod?: WarningPeriodInfo | null;
        }
      | undefined,
  ): boolean {
    if (!expected) return true;
    return (
      (expected.scheduledDate === undefined ||
        this.planningValueMatches(
          lines,
          task,
          'SCHEDULED',
          expected.scheduledDate,
          expected.scheduledDateRepeat ?? null,
          expected.scheduledWarningPeriod,
        )) &&
      (expected.deadlineDate === undefined ||
        this.planningValueMatches(
          lines,
          task,
          'DEADLINE',
          expected.deadlineDate,
          expected.deadlineDateRepeat ?? null,
          expected.deadlineWarningPeriod,
        ))
    );
  }

  private planningValueMatches(
    lines: string[],
    task: Task,
    dateType: 'SCHEDULED' | 'DEADLINE',
    expectedDate: Date | null,
    expectedRepeat: DateRepeatInfo | null,
    expectedWarning: WarningPeriodInfo | null | undefined,
  ): boolean {
    let dateText: string | null = null;

    if (task.sourceFormat === 'org') {
      dateText =
        findOrgPlanningToken(lines, task.line + 1, dateType)?.dateText ?? null;
    } else {
      const lineIndex = findDateLine(
        lines,
        task.line + 1,
        dateType,
        getTaskIndent(task),
        this.keywordManager,
      );
      const line = lineIndex >= 0 ? lines[lineIndex] : undefined;
      dateText =
        line?.match(
          new RegExp(`\\b${dateType}:\\s*(<[^>]+>|\\[[^\\]]+\\])`, 'i'),
        )?.[1] ?? null;
    }

    if (!dateText) {
      return (
        expectedDate === null &&
        expectedRepeat === null &&
        (expectedWarning === undefined || expectedWarning === null)
      );
    }
    const parsed = DateParser.parseDateWithRepeater(dateText);
    return (
      this.sameDate(parsed.date, expectedDate) &&
      this.sameRepeat(parsed.repeat, expectedRepeat) &&
      (expectedWarning === undefined ||
        this.sameWarningPeriod(parsed.warningPeriod, expectedWarning ?? null))
    );
  }

  private sameDate(a: Date | null, b: Date | null): boolean {
    if (a === null || b === null) return a === b;
    return a.getTime() === b.getTime();
  }

  private sameRepeat(
    a: DateRepeatInfo | null,
    b: DateRepeatInfo | null,
  ): boolean {
    if (a === null || b === null) return a === b;
    return a.type === b.type && a.unit === b.unit && a.value === b.value;
  }

  private sameWarningPeriod(
    a: WarningPeriodInfo | null,
    b: WarningPeriodInfo | null,
  ): boolean {
    if (a === null || b === null) return a === b;
    return (
      a.value === b.value &&
      a.unit === b.unit &&
      a.isFirstOnly === b.isFirstOnly
    );
  }

  private tableCellPlanningMatches(
    cellContent: string,
    expected:
      | {
          scheduledDate?: Date | null;
          scheduledDateRepeat?: DateRepeatInfo | null;
          scheduledWarningPeriod?: WarningPeriodInfo | null;
          deadlineDate?: Date | null;
          deadlineDateRepeat?: DateRepeatInfo | null;
          deadlineWarningPeriod?: WarningPeriodInfo | null;
        }
      | undefined,
  ): boolean {
    if (!expected) return true;
    const matches = (
      dateType: 'SCHEDULED' | 'DEADLINE',
      expectedDate: Date | null | undefined,
      expectedRepeat: DateRepeatInfo | null | undefined,
      expectedWarning: WarningPeriodInfo | null | undefined,
    ): boolean => {
      if (expectedDate === undefined) return true;
      const dateText =
        cellContent.match(
          new RegExp(
            `<br\\s*/?>\\s*${dateType}:\\s*(<[^>]+>|\\[[^\\]]+\\])`,
            'i',
          ),
        )?.[1] ?? null;
      if (!dateText) {
        return (
          expectedDate === null &&
          !expectedRepeat &&
          (expectedWarning === undefined || expectedWarning === null)
        );
      }
      const parsed = DateParser.parseDateWithRepeater(dateText);
      return (
        this.sameDate(parsed.date, expectedDate) &&
        this.sameRepeat(parsed.repeat, expectedRepeat ?? null) &&
        (expectedWarning === undefined ||
          this.sameWarningPeriod(parsed.warningPeriod, expectedWarning ?? null))
      );
    };

    return (
      matches(
        'SCHEDULED',
        expected.scheduledDate,
        expected.scheduledDateRepeat,
        expected.scheduledWarningPeriod,
      ) &&
      matches(
        'DEADLINE',
        expected.deadlineDate,
        expected.deadlineDateRepeat,
        expected.deadlineWarningPeriod,
      )
    );
  }

  /**
   * The anchor only when the task snapshot genuinely ends with it. A
   * block-end anchor is owned by another line, so a task-line rewrite must
   * not append it there.
   */
  private static taskLineAnchor(task: Task): string | undefined {
    const reference = task.embedReference;
    if (!reference) return undefined;
    // A table state write leaves the <br> date metadata in rawText, so the
    // task segment — not the full cell — is where its anchor can end.
    let text = task.isTableTask
      ? (task.rawText.split(/<br\s*\/?>/i)[0]?.trimEnd() ?? '')
      : task.rawText.trimEnd();
    const footnote = task.footnoteReference;
    if (footnote && text.endsWith(footnote)) {
      text = text.slice(0, -footnote.length);
    }
    return splitTrailingBlockAnchor(text).anchor ===
      reference.replace(/^\^/, '')
      ? reference
      : undefined;
  }

  /** The live block anchor owned by a Markdown task, if any. */
  private blockAnchorOf(lines: string[], task: Task): string | null {
    if (
      task.isTableTask ||
      task.sourceFormat === 'org' ||
      task.sourceFormat === 'code-comment'
    ) {
      return null;
    }
    return (
      findTaskBlockAnchor(lines, task.line, getTaskIndent(task))?.anchor ?? null
    );
  }

  /**
   * Move a captured anchor to the resulting block end after a metadata
   * mutation. The suffix is identity: never duplicated, never dropped.
   */
  private relocateBlockAnchor(
    lines: string[],
    taskLine: number,
    taskIndent: string,
    anchor: string | null,
  ): void {
    if (!anchor) return;
    const end = findTaskBlockEndLine(lines, taskLine, taskIndent);
    for (let i = taskLine; i <= end && i < lines.length; i++) {
      const split = splitTrailingBlockAnchor(lines[i] ?? '');
      if (split.anchor === anchor) {
        lines[i] = split.text;
        break;
      }
    }
    const newEnd = findTaskBlockEndLine(lines, taskLine, taskIndent);
    lines[newEnd] = appendBlockAnchor(lines[newEnd] ?? '', anchor);
  }

  /** Read the live editor buffer as lines. */
  private editorLines(editor: Editor): string[] {
    return Array.from({ length: editor.lineCount() }, (_, i) =>
      editor.getLine(i),
    );
  }

  private editorBlockAnchor(editor: Editor, task: Task): string | null {
    if (
      task.isTableTask ||
      task.sourceFormat === 'org' ||
      task.sourceFormat === 'code-comment'
    ) {
      return null;
    }
    return (
      findTaskBlockAnchor(
        this.editorLines(editor),
        task.line,
        getTaskIndent(task),
      )?.anchor ?? null
    );
  }

  /**
   * Insert or update a date line from the live editor, returning the actual
   * date row so the caller can place the cursor without re-deriving layout.
   */
  insertDateLineFromEditor(
    editor: Editor,
    task: Task,
    dateType: 'SCHEDULED' | 'DEADLINE',
    dateStr: string,
  ): { line: number; lineDelta: number } {
    const taskIndent = getTaskIndent(task);
    const lineDelta = this.updateDateLineInEditor(
      editor,
      task,
      dateType,
      dateStr,
      taskIndent,
    );
    const line = findDateLine(
      this.editorLines(editor),
      task.line + 1,
      dateType,
      taskIndent,
      this.keywordManager,
    );
    return { line: line >= 0 ? line : task.line + 1, lineDelta };
  }

  /** Editor variant of relocateBlockAnchor; rewrites only the touched lines. */
  relocateBlockAnchorInEditor(
    editor: Editor,
    task: Task,
    anchor: string | null,
  ): void {
    relocateAnchorInEditor(editor, task.line, getTaskIndent(task), anchor);
  }

  private async readSourceBlock(
    task: Task,
  ): Promise<{ lines: string[]; text: string } | null> {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) return null;
    const text = await this.readFileText(file);
    const lines = text.split('\n');
    if (!this.lineMatchesTask(lines[task.line], task)) return null;
    return { lines, text };
  }

  /** The task as standalone lines: a table cell becomes a plain task line. */
  private buildTransferBlock(lines: string[], task: Task): string[] {
    if (task.isTableTask && task.tableCell) {
      const cell = parseTableCells(lines[task.line] ?? '')[
        task.tableCell.cellIndex
      ];
      if (!cell) return [];
      const taskLine = cell.content.split(/<br\s*\/?>/i)[0]?.trim();
      return taskLine ? [taskLine] : [];
    }
    return readTaskBlockFromLines(lines, task);
  }

  private async appendToFile(
    file: TFile,
    lines: string[],
    insertAt?: { line: number; ch: number },
  ): Promise<boolean> {
    const editor = this.getTransferEditor(file);
    if (editor && insertAt) {
      const currentLine = editor.getLine(insertAt.line) ?? '';
      const prefix = currentLine === '' ? '' : '\n';
      editor.replaceRange(prefix + lines.join('\n'), {
        line: insertAt.line,
        ch: Math.min(insertAt.ch, currentLine.length),
      });
      return true;
    }
    if (editor) {
      const last = editor.lineCount() - 1;
      const lastLine = editor.getLine(last) ?? '';
      const separator = editor.getValue().trim() === '' ? '' : '\n\n';
      editor.replaceRange(separator + lines.join('\n') + '\n', {
        line: last,
        ch: lastLine.length,
      });
      return true;
    }
    // vault.process is an atomic read-modify-write, so concurrent appends to
    // the same destination cannot overwrite each other.
    await this.app.vault.process(file, (data) => {
      const base = data.trimEnd();
      return (base ? base + '\n\n' : '') + lines.join('\n') + '\n';
    });
    return true;
  }

  private removeFromLines(lines: string[], task: Task): string[] {
    if (task.isTableTask && task.tableCell) {
      const updated = replaceTableCellContent(
        lines[task.line] ?? '',
        task.tableCell.cellIndex,
        '',
      );
      if (updated === null) return lines;
      const out = [...lines];
      if (parseTableCells(updated).every((cell) => cell.content === '')) {
        out.splice(task.line, 1);
      } else {
        out[task.line] = updated;
      }
      return out;
    }
    const { start, end } = getTaskRemovalRange(lines, task);
    return [...lines.slice(0, start), ...lines.slice(end + 1)];
  }

  private migrateInLines(
    lines: string[],
    task: Task,
    migrateState: string,
  ): string[] {
    const keyword = task.state || 'TODO';
    if (task.isTableTask && task.tableCell) {
      const cell = parseTableCells(lines[task.line] ?? '')[
        task.tableCell.cellIndex
      ];
      if (!cell) return lines;
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const migrated =
        migrateState === ''
          ? cell.content.replace(new RegExp(`^\\s*${escaped}\\s*`, 'i'), '')
          : cell.content.replace(
              new RegExp(`\\b${escaped}\\b`, 'i'),
              migrateState,
            );
      const updated = replaceTableCellContent(
        lines[task.line],
        task.tableCell.cellIndex,
        migrated,
      );
      if (updated === null) return lines;
      const out = [...lines];
      out[task.line] = updated;
      return out;
    }
    return modifyLinesForMigration(lines, task.line, keyword, migrateState);
  }

  private propertyFormat(task: Task): 'markdown' | 'org' {
    return task.sourceFormat === 'org' ? 'org' : 'markdown';
  }

  /** Find the task's own bounded drawer without walking into a child task. */
  private findPropertiesDrawer(
    lines: string[],
    task: Task,
  ): TaskPropertiesDrawer | null {
    const format = this.propertyFormat(task);
    const max = Math.min(lines.length, task.line + 60);
    for (let i = task.line + 1; i < max; i++) {
      const line = lines[i];
      if (isPropertiesDrawerStart(line, format)) {
        return readTaskPropertiesDrawer(lines, i, format, {
          allowAnyIndent: true,
        });
      }
      if (line.trim() === '') continue;
      if (format === 'org' && /^\*/.test(line)) break;
      if (
        /^\s*(?:>\s*)*(SCHEDULED|DEADLINE|CLOSED|STARTED|DESCRIPTION):/.test(
          line,
        )
      ) {
        continue;
      }
      break;
    }
    return null;
  }

  /**
   * True when a Markdown line is planning metadata the parser scans past.
   *
   * Mirror TaskParser.getDateLineType and getDescriptionText individually:
   * date lines only count when quoted in column 0 or indented to the task's
   * indent, while a description strips every quote prefix and ignores its
   * indentation. Treating descriptions as date lines ends a valid block early
   * (`> > DESCRIPTION:` or an unindented `DESCRIPTION:` under an indented
   * task), so the recurrence guard rejects a rollover the parser owns.
   */
  private isMarkdownPlanningMetadataLine(
    line: string,
    taskIndent: string,
  ): boolean {
    const dateLine = /^(SCHEDULED|DEADLINE|CLOSED|STARTED):/;
    if (line.startsWith('>')) {
      // A quoted date line is owned at any indent: the parser trims the line
      // and removes exactly one quote marker before matching.
      if (dateLine.test(line.trim().substring(1).trim())) return true;
    } else {
      const trimmed = line.trimStart();
      if (dateLine.test(trimmed)) {
        const lineIndent = line.slice(0, line.length - trimmed.length);
        const isHeadingIndent = /^#{1,6}\s+$/.test(taskIndent);
        const taskIndentLength = isHeadingIndent
          ? 0
          : getIndentLength(taskIndent);
        return getIndentLength(lineIndent) >= taskIndentLength;
      }
    }

    // getDescriptionText strips every leading quote marker and ignores
    // indentation, so both an indented `> DESCRIPTION:` and an unindented
    // description under an indented task still belong to the block.
    const quotePrefix = line.startsWith('>')
      ? (line.match(/^(>\s*)+/)?.[0] ?? '')
      : '';
    return line
      .slice(quotePrefix.length)
      .trimStart()
      .startsWith('DESCRIPTION:');
  }

  /**
   * Find the drawer the parser would attach to this task. An unrelated quoted
   * or differently indented drawer belongs to another block and must not
   * become the recurrence guard's expected identity. Blank lines and planning
   * metadata do not end a block, so this scan follows the parser rather than
   * a separate fixed-distance limit; prose or a heading stops it.
   */
  private findOwnedPropertiesDrawer(
    lines: string[],
    task: Task,
  ): TaskPropertiesDrawer | null {
    const format = this.propertyFormat(task);
    const taskIndent = format === 'markdown' ? getTaskIndent(task) : undefined;
    for (let i = task.line + 1; i < lines.length; i++) {
      const line = lines[i];
      if (isPropertiesDrawerStart(line, format, taskIndent)) {
        return readTaskPropertiesDrawer(lines, i, format, {
          taskIndent,
          isBoundary: (boundary) =>
            isTaskLine(boundary, this.keywordManager) ||
            /^#{1,6}\s+/.test(boundary) ||
            CHECKBOX_DETECTION_REGEX.test(boundary),
        });
      }
      if (line.trim() === '') continue;
      if (format === 'org' && /^\*/.test(line)) break;
      // Org has no DESCRIPTION line. The Org parser treats any non-planning
      // line as body text, and a drawer after body text is not attached as
      // entry properties, so it must not supply (or block) the identity here.
      // Mirror its classification: a first SCHEDULED/DEADLINE timestamp keeps
      // the line planning even inside a note, while CLOSED/STARTED only count
      // at the start of a line.
      const orgPlanning =
        /(?:^|\s)(?:SCHEDULED|DEADLINE):\s*(?:<[^>]+>|\[[^\]]+\])/.test(line) ||
        /^\s*(?:CLOSED|STARTED):/.test(line);
      const planningMetadata =
        format === 'org'
          ? orgPlanning
          : this.isMarkdownPlanningMetadataLine(line, taskIndent ?? '');
      if (planningMetadata) continue;
      break;
    }
    return null;
  }

  private drawerLinePrefix(
    lines: string[],
    drawer: TaskPropertiesDrawer,
  ): string {
    const start = lines[drawer.startLine] ?? '';
    const end = start.length - start.trimStart().length;
    return start.slice(0, end);
  }

  private drawerPropertyLine(
    prefix: string,
    update: TaskPropertyUpdate,
  ): string {
    return update.value === null || update.value === ''
      ? `${prefix}:${update.key}:`
      : `${prefix}:${update.key}: ${update.value}`;
  }

  private applyDrawerUpdates(
    lines: string[],
    task: Task,
    updates: readonly TaskPropertyUpdate[],
  ): string[] {
    const anchor = this.blockAnchorOf(lines, task);
    const drawer = this.findPropertiesDrawer(lines, task);

    if (!drawer) {
      const values = updates.filter(
        (update) => update.value !== null && update.value !== '',
      );
      if (values.length === 0) return lines;
      const prefix = getDateLineIndent(task);
      const index = this.calcDrawerInsertIndex(lines, task);
      const block = [
        `${prefix}:PROPERTIES:`,
        ...values.map((update) => this.drawerPropertyLine(prefix, update)),
        `${prefix}:END:`,
      ];
      const out = [...lines];
      out.splice(index, 0, ...block);
      this.relocateBlockAnchor(out, task.line, getTaskIndent(task), anchor);
      return out;
    }

    const remove = new Set<number>();
    const replace = new Map<number, string>();
    const inserts: string[] = [];
    const prefix = this.drawerLinePrefix(lines, drawer);

    for (const update of updates) {
      const entries = drawer.entries.filter(
        (entry) => entry.canonicalKey === update.key,
      );
      if (entries.length === 0) {
        if (update.value !== null && update.value !== '') {
          const line = this.drawerPropertyLine(prefix, update);
          if (!inserts.includes(line)) inserts.push(line);
        }
        continue;
      }

      if (update.value === null || update.value === '') {
        for (const entry of entries) remove.add(entry.line);
      } else {
        const first = entries[0];
        const original = lines[first.line] ?? '';
        replace.set(
          first.line,
          `${original.slice(0, first.valueStart)}${update.value}`,
        );
        for (const entry of entries.slice(1)) remove.add(entry.line);
      }
    }

    const removedEntries = drawer.entries.filter((entry) =>
      remove.has(entry.line),
    ).length;
    const remainingEntries =
      drawer.entries.length - removedEntries + inserts.length;
    if (remainingEntries === 0) {
      const out = [
        ...lines.slice(0, drawer.startLine),
        ...lines.slice(drawer.endLine + 1),
      ];
      this.relocateBlockAnchor(out, task.line, getTaskIndent(task), anchor);
      return out;
    }

    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (i === drawer.endLine) out.push(...inserts);
      if (remove.has(i)) continue;
      out.push(replace.get(i) ?? lines[i]);
    }
    if (drawer.endLine >= lines.length) out.push(...inserts);
    this.relocateBlockAnchor(out, task.line, getTaskIndent(task), anchor);
    return out;
  }

  private calcDrawerInsertIndex(lines: string[], task: Task): number {
    let lastDate = task.line;
    let description = -1;
    const taskIndent = task.indent;
    for (let i = task.line + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === '') break;
      if (this.propertyFormat(task) === 'org' && /^\*/.test(line)) break;
      const trimmed = line.trimStart();
      if (/^(SCHEDULED|DEADLINE|CLOSED|STARTED):/.test(trimmed)) {
        lastDate = i;
        continue;
      }
      if (trimmed.startsWith('DESCRIPTION:')) {
        description = i;
        continue;
      }
      if (classifyTaskMetadataLine(line, taskIndent)) {
        lastDate = i;
        continue;
      }
      break;
    }
    return lastDate > task.line
      ? lastDate + 1
      : description >= 0
        ? description
        : task.line + 1;
  }

  private parsedProperties(
    lines: string[],
    task: Task,
  ): ParsedTaskProperties | null {
    const drawer = this.findPropertiesDrawer(lines, task);
    return drawer
      ? extractTaskProperties(drawer, this.propertyFormat(task))
      : null;
  }

  private applyPropertySnapshot(
    task: Task,
    parsed: ParsedTaskProperties | null,
  ): Task {
    const updated: Task = { ...task };
    delete updated.properties;
    delete updated.id;
    delete updated.blockedBy;
    delete updated.archivedBlockers;
    delete updated.ordered;
    delete updated.noblocking;
    delete updated.propertyIssues;
    if (parsed?.properties) updated.properties = parsed.properties;
    if (parsed?.id !== undefined) updated.id = parsed.id;
    if (parsed?.blockedBy !== undefined) updated.blockedBy = parsed.blockedBy;
    if (parsed?.archivedBlockers !== undefined) {
      updated.archivedBlockers = parsed.archivedBlockers;
    }
    if (parsed?.ordered !== undefined) updated.ordered = parsed.ordered;
    if (parsed?.noblocking !== undefined)
      updated.noblocking = parsed.noblocking;
    if (parsed?.propertyIssues?.length) {
      updated.propertyIssues = parsed.propertyIssues;
    }
    return updated;
  }

  private async writeDrawerMutation(
    task: Task,
    mutate: (lines: string[]) => string[],
  ): Promise<TaskPropertyWriteResult> {
    if (!supportsTaskMetadata(task) || task.isTableTask) {
      return {
        status: 'unsupported',
        task: null,
        lineDelta: 0,
        reason: 'Task properties are not supported for this task source.',
      };
    }

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) {
      return {
        status: 'failed',
        task: null,
        lineDelta: 0,
        reason: 'The task file could not be found.',
      };
    }

    const editor = this.getTransferEditor(file);
    let before: string[] = [];
    let after: string[] = [];
    let changed = false;

    if (editor) {
      before = Array.from({ length: editor.lineCount() }, (_, i) =>
        editor.getLine(i),
      );
      if (!this.lineMatchesTask(before[task.line], task)) {
        return { status: 'failed', task: null, lineDelta: 0 };
      }
      after = mutate(before);
      changed = after.join('\n') !== before.join('\n');
      if (changed) {
        const last = editor.lineCount() - 1;
        editor.replaceRange(
          after.join('\n'),
          { line: 0, ch: 0 },
          {
            line: last,
            ch: (editor.getLine(last) ?? '').length,
          },
        );
      }
    } else {
      await this.app.vault.process(file, (data) => {
        before = data.split('\n');
        if (!this.lineMatchesTask(before[task.line], task)) return data;
        after = mutate(before);
        changed = after.join('\n') !== data;
        return changed ? after.join('\n') : data;
      });
    }

    if (!changed) {
      return {
        status: 'success',
        task: this.applyPropertySnapshot(
          task,
          this.parsedProperties(before, task),
        ),
        lineDelta: 0,
      };
    }

    return {
      status: 'success',
      task: this.applyPropertySnapshot(
        task,
        this.parsedProperties(after, task),
      ),
      lineDelta: after.length - before.length,
    };
  }

  /** Copy ID action: reuse an authored ID, otherwise persist one UUID. */
  async ensureTaskId(task: Task): Promise<TaskIdentityWriteResult> {
    if (task.id) {
      return {
        status: 'success',
        task,
        lineDelta: 0,
        identity: task.id,
      };
    }
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file instanceof TFile) {
      const lines = (await this.readFileText(file)).split('\n');
      const drawer = this.findPropertiesDrawer(lines, task);
      const persisted = drawer
        ? extractTaskProperties(drawer, this.propertyFormat(task)).id
        : undefined;
      if (persisted) {
        return {
          status: 'success',
          task: this.applyPropertySnapshot(
            task,
            this.parsedProperties(lines, task),
          ),
          lineDelta: 0,
          identity: persisted,
        };
      }
    }
    const identity = this.generateUuid();
    const result = await this.updateOrInsertPropertiesDrawer(task, [
      { key: 'ID', value: identity },
    ]);
    return {
      ...result,
      identity: result.status === 'success' ? identity : undefined,
    };
  }

  /** Copy anchor action: reuse or persist a Markdown block anchor. */
  async ensureBlockAnchor(task: Task): Promise<TaskIdentityWriteResult> {
    if (
      task.isTableTask ||
      task.path.toLowerCase().endsWith('.org') ||
      task.sourceFormat === 'org' ||
      task.sourceFormat === 'code-comment'
    ) {
      return {
        status: 'unsupported',
        task: null,
        lineDelta: 0,
        reason: 'Block anchors are available for Markdown task lines only.',
      };
    }

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) {
      return { status: 'failed', task: null, lineDelta: 0 };
    }

    // Live lines are the authority: a stale snapshot must not mint a second
    // anchor, and only the final line of the recognised block may carry it.
    const indent = getTaskIndent(task);
    const before = (await this.readFileText(file)).split('\n');
    if (!this.lineMatchesTask(before[task.line], task)) {
      return { status: 'failed', task: null, lineDelta: 0 };
    }

    const existing = findTaskBlockAnchor(before, task.line, indent);
    const endLine = findTaskBlockEndLine(before, task.line, indent);
    const anchor = existing?.anchor ?? `todoseq-${this.randomHex(8)}`;
    const link = this.buildBlockLink(task.path, anchor);

    // Already terminal (including a lone task-line anchor with no metadata):
    // repeated Copy anchor is idempotent and writes nothing.
    if (existing && existing.line === endLine) {
      return {
        status: 'success',
        task: { ...task, embedReference: `^${anchor}` },
        lineDelta: 0,
        identity: anchor,
        link,
      };
    }

    const after = [...before];
    if (existing) {
      after[existing.line] = splitTrailingBlockAnchor(
        after[existing.line],
      ).text;
    }
    after[endLine] = appendBlockAnchor(after[endLine] ?? '', anchor);

    const editor = this.getTransferEditor(file);
    if (editor) {
      const last = editor.lineCount() - 1;
      editor.replaceRange(
        after.join('\n'),
        { line: 0, ch: 0 },
        { line: last, ch: (editor.getLine(last) ?? '').length },
      );
    } else {
      await this.app.vault.process(file, (data) => {
        const live = data.split('\n');
        if (!this.lineMatchesTask(live[task.line], task)) return data;
        return after.join('\n');
      });
    }

    if (!after.length) return { status: 'failed', task: null, lineDelta: 0 };
    return {
      status: 'success',
      task: {
        ...task,
        rawText: after[task.line],
        embedReference: `^${anchor}`,
      },
      lineDelta: after.length - before.length,
      identity: anchor,
      link,
    };
  }

  private buildBlockLink(path: string, anchor: string): string {
    const withoutExtension = path.replace(/\.md$/i, '').replace(/^\/+/, '');
    return `[[${withoutExtension}#^${anchor}]]`;
  }

  private generateUuid(): string {
    const cryptoApi = window.crypto as Crypto | undefined;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
      return cryptoApi.randomUUID();
    }
    const hex = this.randomHex(32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }

  private randomHex(length: number): string {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    const cryptoApi = window.crypto as Crypto | undefined;
    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
      cryptoApi.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, length);
  }

  /** Set the active BLOCKER list, preserving unknown drawer entries. */
  async setTaskDependency(
    task: Task,
    reference: string,
    add: boolean,
  ): Promise<TaskPropertyWriteResult> {
    const format = this.propertyFormat(task);
    const ref = reference.trim();
    if (!ref) {
      return {
        status: 'failed',
        task: null,
        lineDelta: 0,
        reason: 'A dependency reference is required.',
      };
    }
    const parsedRef = parseDependencyValue(ref, format);
    if (parsedRef.references.length !== 1 || parsedRef.issues.length > 0) {
      return {
        status: 'failed',
        task: null,
        lineDelta: 0,
        reason: 'The dependency reference is not valid.',
      };
    }
    const normalized = parsedRef.references[0];

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) {
      return { status: 'failed', task: null, lineDelta: 0 };
    }
    const lines = await this.readFileText(file).then((text) =>
      text.split('\n'),
    );
    const drawer = this.findPropertiesDrawer(lines, task);
    if (drawer?.issues.some((issue) => issue.code === 'malformed-drawer')) {
      return {
        status: 'ambiguous',
        task: null,
        lineDelta: 0,
        reason: 'Fix the malformed properties drawer before editing it.',
      };
    }
    const current = drawer
      ? (extractTaskProperties(drawer, format).blockedBy ?? [])
      : [];
    const next = add
      ? current.includes(normalized)
        ? current
        : [...current, normalized]
      : current.filter((item) => item !== normalized);
    if (
      next.length === current.length &&
      next.every((item, i) => item === current[i])
    ) {
      return {
        status: 'success',
        task: this.applyPropertySnapshot(
          task,
          this.parsedProperties(lines, task),
        ),
        lineDelta: 0,
      };
    }

    return this.writeDrawerMutation(task, (sourceLines) =>
      this.applyDrawerUpdates(sourceLines, task, [
        { key: 'BLOCKER', value: next.length ? next.join(' ') : null },
      ]),
    );
  }

  /**
   * Move references between the active `BLOCKER` list and `ARCHIVED_BLOCKER`
   * history, preserving every other drawer entry and append syntax. Idempotent
   * per reference so a retried archive or promotion cannot duplicate or lose
   * one. Used by archive migration and the restored-target promotion pass.
   */
  async migrateBlockerHistory(
    task: Task,
    direction: 'to-history' | 'to-active',
    references: readonly string[],
  ): Promise<TaskPropertyWriteResult> {
    if (references.length === 0) {
      return { status: 'success', task, lineDelta: 0 };
    }
    if (!supportsTaskMetadata(task) || task.isTableTask) {
      return {
        status: 'unsupported',
        task: null,
        lineDelta: 0,
        reason: 'Task properties are not supported for this task source.',
      };
    }
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) {
      return { status: 'failed', task: null, lineDelta: 0 };
    }
    const lines = (await this.readFileText(file)).split('\n');
    const drawer = this.findPropertiesDrawer(lines, task);
    if (drawer?.issues.some((issue) => issue.code === 'malformed-drawer')) {
      return {
        status: 'ambiguous',
        task: null,
        lineDelta: 0,
        reason:
          'Fix the malformed properties drawer before changing dependencies.',
      };
    }

    const format = this.propertyFormat(task);
    const parsed = drawer ? extractTaskProperties(drawer, format) : {};
    const active = [...(parsed.blockedBy ?? [])];
    const history = [...(parsed.archivedBlockers ?? [])];
    const remove = (list: string[], reference: string): void => {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i] === reference) list.splice(i, 1);
      }
    };

    for (const reference of references) {
      if (direction === 'to-history') {
        // The live drawer is authoritative: if the user already removed the
        // token, do not recreate it in history from a stale inventory.
        if (!active.includes(reference)) continue;
        remove(active, reference);
        if (!history.includes(reference)) history.push(reference);
      } else {
        if (!history.includes(reference)) continue;
        remove(history, reference);
        if (!active.includes(reference)) active.push(reference);
      }
    }

    const unchanged = (next: string[], current: readonly string[]): boolean =>
      next.length === current.length &&
      next.every((value, index) => value === current[index]);
    if (
      unchanged(active, parsed.blockedBy ?? []) &&
      unchanged(history, parsed.archivedBlockers ?? [])
    ) {
      return {
        status: 'success',
        task: this.applyPropertySnapshot(task, parsed),
        lineDelta: 0,
      };
    }

    return this.writeDrawerMutation(task, (sourceLines) =>
      this.applyDrawerUpdates(sourceLines, task, [
        { key: 'BLOCKER', value: active.length ? active.join(' ') : null },
        {
          key: 'ARCHIVED_BLOCKER',
          value: history.length ? history.join(' ') : null,
        },
      ]),
    );
  }

  /** Insert or replace supported drawer keys as one serialized write. */
  async updateOrInsertPropertiesDrawer(
    task: Task,
    entries: readonly TaskPropertyUpdate[],
  ): Promise<TaskPropertyWriteResult> {
    return this.writeDrawerMutation(task, (lines) =>
      this.applyDrawerUpdates(lines, task, entries),
    );
  }

  /** Remove a whole drawer or only the named supported keys. */
  async removePropertiesDrawer(
    task: Task,
    keys?: readonly TaskPropertyKey[],
  ): Promise<TaskPropertyWriteResult> {
    if (!keys) {
      const file = this.app.vault.getAbstractFileByPath(task.path);
      if (!(file instanceof TFile)) {
        return { status: 'failed', task: null, lineDelta: 0 };
      }
      const lines = await this.readFileText(file).then((text) =>
        text.split('\n'),
      );
      const drawer = this.findPropertiesDrawer(lines, task);
      if (!drawer) {
        return { status: 'success', task, lineDelta: 0 };
      }
      return this.writeDrawerMutation(task, (sourceLines) => [
        ...sourceLines.slice(0, drawer.startLine),
        ...sourceLines.slice(drawer.endLine + 1),
      ]);
    }
    return this.writeDrawerMutation(task, (lines) =>
      this.applyDrawerUpdates(
        lines,
        task,
        keys.map((key) => ({ key, value: null })),
      ),
    );
  }

  /** Revalidate the source and rewrite it, or report that nothing changed. */
  private async rewriteSource(
    task: Task,
    mutate: (lines: string[]) => string[],
  ): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) return false;

    const editor = this.getTransferEditor(file);
    if (editor) {
      const lines: string[] = [];
      for (let i = 0; i < editor.lineCount(); i++)
        lines.push(editor.getLine(i));
      if (!this.lineMatchesTask(lines[task.line], task)) return false;
      const next = mutate(lines).join('\n');
      const last = editor.lineCount() - 1;
      editor.replaceRange(
        next,
        { line: 0, ch: 0 },
        {
          line: last,
          ch: (editor.getLine(last) ?? '').length,
        },
      );
      return true;
    }

    let changed = false;
    await this.app.vault.process(file, (data) => {
      const lines = data.split('\n');
      if (!this.lineMatchesTask(lines[task.line], task)) return data;
      changed = true;
      return mutate(lines).join('\n');
    });
    return changed;
  }

  /**
   * Copy, move or migrate a task into `destination`, writing through the
   * source-aware seam: the live buffer is the source of truth, destination
   * appends are atomic, and the source is revalidated before it is changed.
   */
  async transferTask(
    task: Task,
    destination: TFile,
    action: 'copy' | 'move' | 'migrate',
    options?: { insertAt?: { line: number; ch: number } },
  ): Promise<TaskTransferResult> {
    if (task.path === destination.path) {
      return { status: 'already-there' };
    }

    const source = await this.readSourceBlock(task);
    if (!source) {
      return {
        status: 'stale-source',
        reason: 'The task is no longer at its recorded location.',
      };
    }
    let block = this.buildTransferBlock(source.lines, task);
    if (block.length === 0) {
      return { status: 'stale-source', reason: 'The task could not be read.' };
    }

    const anchors = action === 'copy' ? [] : this.blockAnchors(block);
    const transferredIds = action === 'copy' ? [] : this.blockIds(block);
    const anchor = this.taskAnchor(task);
    if (action === 'copy') {
      block = await this.prepareCopiedBlock(block, task, destination, anchor);
    }

    let appended = false;
    try {
      appended = await this.appendToFile(destination, block, options?.insertAt);
    } catch {
      appended = false;
    }
    if (!appended) {
      return {
        status: 'destination-failed',
        reason: 'The destination file could not be written.',
      };
    }
    if (action === 'copy') return { status: 'success' };

    const migrateState = this.settings.migrateToTodayState || '';
    const changed = await this.rewriteSource(task, (lines) => {
      if (action === 'move') return this.removeFromLines(lines, task);
      return this.removeRetainedIdentity(
        this.migrateInLines(lines, task, migrateState),
        task,
        anchors,
        transferredIds,
      );
    });
    if (!changed) {
      return {
        status: 'partial',
        reason: 'The destination was updated but the source could not be.',
      };
    }

    if (anchors.length === 0) return { status: 'success' };
    const scan = await this.collectReferenceEdits(
      task.path,
      anchors,
      destination.path,
    );
    if (scan === null) {
      return {
        status: 'partial-references',
        reason:
          'The task was transferred, but its references could not be scanned.',
        referenceDiscoveryFailed: true,
      };
    }
    const outcome = await this.applyReferenceEdits(scan.edits);
    if (scan.unreadable.length === 0) return outcome;
    return {
      status: 'partial-references',
      reason: `${outcome.reason ? outcome.reason + ' ' : ''}References in ${scan.unreadable.join(
        ', ',
      )} could not be scanned.`,
      referenceRepairs: outcome.referenceRepairs,
      unreadablePaths: [...scan.unreadable],
    };
  }

  /** Every block anchor carried by the transferred block, including nested rows. */
  private blockAnchors(block: readonly string[]): string[] {
    const anchors = new Set<string>();
    for (const line of block) {
      const anchor = splitTrailingBlockAnchor(line).anchor;
      if (anchor) anchors.add(anchor);
    }
    return [...anchors];
  }

  /** The destination block keeps identity on move/migrate; copy forks it. */
  private taskAnchor(task: Task): string | null {
    const reference = task.embedReference?.replace(/^\^/, '').trim();
    return reference ? reference : null;
  }

  /**
   * A copied block gets fresh identity where it had any: a new UUID, a new
   * block anchor, and remapped internal references. A task without identity
   * stays without identity — a transfer never mints one on its own.
   */
  private async prepareCopiedBlock(
    block: string[],
    task: Task,
    destination: TFile,
    anchor: string | null,
  ): Promise<string[]> {
    let lines = [...block];
    const idMap = new Map<string, string>();
    for (let i = 0; i < lines.length; i++) {
      const match = /^(\s*:ID:\s*)(.*)$/i.exec(lines[i] ?? '');
      const oldId = match?.[2]?.trim();
      if (!match || !oldId) continue;
      const next = idMap.get(oldId) ?? this.generateUuid();
      idMap.set(oldId, next);
      lines[i] = `${match[1]}${next}`;
    }

    const anchorMap = new Map<string, string>();
    const usedAnchors = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const split = splitTrailingBlockAnchor(lines[i] ?? '');
      const oldAnchor = split.anchor;
      if (!oldAnchor) continue;
      let next = anchorMap.get(oldAnchor);
      if (!next) {
        next = await this.uniqueAnchor(destination, oldAnchor);
        while (usedAnchors.has(next)) {
          next = await this.uniqueAnchor(destination, oldAnchor);
        }
        usedAnchors.add(next);
        anchorMap.set(oldAnchor, next);
      }
      lines[i] = appendBlockAnchor(split.text, next);
    }

    const destinationTarget = destination.path
      .replace(/\.md$/i, '')
      .replace(/^\/+/, '');
    lines = lines.map((line) => {
      if (line.includes('[[')) {
        for (const token of findWikiLinks(line)) {
          if (!token.anchor) continue;
          const next = anchorMap.get(token.anchor.slice(1));
          if (!next || !this.linkTargetsTask(token.target, task.path)) continue;
          line = line.replace(
            token.raw,
            buildWikiLink(
              token.embed,
              destinationTarget,
              `^${next}`,
              token.alias,
            ),
          );
        }
      }
      if (/^\s*:?(BLOCKER|ARCHIVED_BLOCKER)\+?:/i.test(line)) {
        for (const [oldId, newId] of idMap) {
          line = line.replace(
            new RegExp(`(^|[:\\s])${this.escapeRegExp(oldId)}(?=\\s|$)`, 'g'),
            `$1${newId}`,
          );
        }
      }
      return line;
    });

    void anchor;
    return lines;
  }

  private blockId(lines: readonly string[]): string | null {
    for (const line of lines) {
      const match = /^\s*:ID:\s*(.*)$/i.exec(line);
      if (match) {
        const value = match[1].trim();
        return value === '' ? null : value;
      }
    }
    return null;
  }

  private async uniqueAnchor(
    destination: TFile,
    oldAnchor: string,
  ): Promise<string> {
    let existing = '';
    try {
      existing = await this.readFileText(destination);
    } catch {
      existing = '';
    }
    const used = new Set<string>([oldAnchor]);
    for (const match of existing.matchAll(/\^([A-Za-z0-9][\w-]*)/g)) {
      used.add(match[1]);
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = `todoseq-${this.randomHex(8)}`;
      if (!used.has(candidate)) return candidate;
    }
    return `todoseq-${this.randomHex(16)}`;
  }

  private linkTargetsTask(linkTarget: string, taskPath: string): boolean {
    const normalize = (path: string): string =>
      path
        .replace(/\\/g, '/')
        .replace(/^\.?\//, '')
        .replace(/\.md$/i, '');
    const target = normalize(linkTarget);
    const source = normalize(taskPath);
    if (target === source) return true;
    const basename = source.split('/').pop() ?? source;
    return target === basename || source.endsWith(`/${target}`);
  }

  /**
   * Migrate keeps identity at the destination, so the retained source history
   * entry must stop owning the ID and anchor. Other properties stay.
   */
  private removeRetainedIdentity(
    lines: string[],
    task: Task,
    anchors: readonly string[],
    transferredIds: readonly string[],
  ): string[] {
    const out = [...lines];
    // Dates are removed before cleanup, so the original block length can run
    // past the retained block. The task's own bounded range stays valid.
    const end = Math.min(out.length - 1, getTaskRemovalRange(out, task).end);
    const anchorSet = new Set(anchors);
    for (let i = task.line; i <= end && i < out.length; i++) {
      const split = splitTrailingBlockAnchor(out[i] ?? '');
      if (split.anchor && anchorSet.has(split.anchor)) {
        out[i] = split.text;
      }
    }

    // Every transferred ID moved with the block. Match the live drawer through
    // the shared parser (quotes, indent, unknown properties) and remove only
    // identities that actually reached the destination.
    const remove = new Set<number>();
    const movedIds = new Set(transferredIds);
    const format = this.propertyFormat(task);
    for (let i = task.line; i <= end && i < out.length; i++) {
      if (!isPropertiesDrawerStart(out[i] ?? '', format)) continue;
      const drawer = readTaskPropertiesDrawer(out, i, format, {
        allowAnyIndent: true,
      });
      if (!drawer?.closed || drawer.endLine > end) continue;

      const idEntries = drawer.entries.filter(
        (entry) => entry.canonicalKey === 'ID' && movedIds.has(entry.value),
      );
      for (const entry of idEntries) remove.add(entry.line);
      const hasOtherEntries = drawer.entries.some(
        (entry) => entry.canonicalKey !== 'ID',
      );
      if (idEntries.length > 0 && !hasOtherEntries) {
        remove.add(drawer.startLine);
        remove.add(drawer.endLine);
      }
      i = drawer.endLine;
    }
    return out.filter((_, index) => !remove.has(index));
  }

  /** IDs carried by a transferred block, parsed with the drawer grammar. */
  private blockIds(block: readonly string[]): string[] {
    const ids = new Set<string>();
    for (let i = 0; i < block.length; i++) {
      if (!isPropertiesDrawerStart(block[i] ?? '', 'markdown')) continue;
      const drawer = readTaskPropertiesDrawer([...block], i, 'markdown', {
        allowAnyIndent: true,
      });
      if (!drawer?.closed) continue;
      for (const entry of drawer.entries) {
        if (entry.canonicalKey === 'ID' && entry.value) ids.add(entry.value);
      }
      i = drawer.endLine;
    }
    return [...ids];
  }

  private async collectReferenceEdits(
    sourcePath: string,
    anchors: readonly string[],
    destinationPath: string,
  ): Promise<TaskReferenceScanResult | null> {
    try {
      return await this.referenceService.collectAnchorReferences({
        sourcePath,
        anchors,
        destinationPath,
      });
    } catch {
      return null;
    }
  }

  private async applyReferenceEdits(
    edits: TaskReferenceEdit[],
  ): Promise<TaskTransferResult> {
    if (edits.length === 0) return { status: 'success' };

    const { reports, failedEdits } = await this.referenceService.apply(edits);
    if (failedEdits.length === 0) {
      return { status: 'success', referenceRepairs: reports };
    }

    this.rememberReferenceRetries(failedEdits);
    return {
      status: 'partial-references',
      reason: `${failedEdits.length} reference link(s) could not be updated.`,
      referenceRepairs: reports,
    };
  }

  private rememberReferenceRetries(edits: readonly TaskReferenceEdit[]): void {
    const seen = new Set(
      this.pendingReferenceEdits.map(
        (edit) => `${edit.path}\u0000${edit.line}\u0000${edit.reference}`,
      ),
    );
    for (const edit of edits) {
      const key = `${edit.path}\u0000${edit.line}\u0000${edit.reference}`;
      if (seen.has(key)) continue;
      seen.add(key);
      this.pendingReferenceEdits.push(edit);
    }
    if (this.pendingReferenceEdits.length > 200) {
      this.pendingReferenceEdits.splice(
        0,
        this.pendingReferenceEdits.length - 200,
      );
    }
  }

  /** True while a reference repair from this session still has to be retried. */
  hasPendingReferenceRepairs(): boolean {
    return this.pendingReferenceEdits.length > 0;
  }

  getPendingReferenceRepairs(): readonly TaskReferenceEdit[] {
    return [...this.pendingReferenceEdits];
  }

  /** Retry exactly the references that failed, never a fresh vault pass. */
  async retryPendingReferenceRepairs(): Promise<TaskReferenceRepairReport[]> {
    if (this.pendingReferenceEdits.length === 0) return [];
    const edits = this.pendingReferenceEdits;
    this.pendingReferenceEdits = [];
    const { reports, failedEdits } = await this.referenceService.apply(edits);
    this.pendingReferenceEdits = failedEdits;
    return reports;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private static buildDateLineContent(
    date: Date,
    repeat?: DateRepeatInfo | null,
    warningPeriod?: WarningPeriodInfo | null,
  ): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const timeStr =
      date.getHours() === 0 && date.getMinutes() === 0
        ? ''
        : ` ${hours}:${minutes}`;
    const repeatStr = repeat ? ` ${repeat.raw}` : '';
    const warningStr = buildWarningPeriodString(warningPeriod);
    return `<${DateUtils.formatDateContent(date)}${timeStr}${repeatStr}${warningStr}>`;
  }

  // Pure formatter of a task line given a new state and optional priority retention
  static generateTaskLine(
    task: Task,
    newState: string,
    keepPriority = true,
    keywordManager: KeywordManager,
  ): { newLine: string; completed: boolean } {
    const keywordManagerInstance = keywordManager;
    const priToken =
      keepPriority && task.priority
        ? task.priority === 'high'
          ? '[#A]'
          : task.priority === 'med'
            ? '[#B]'
            : '[#C]'
        : null;

    const priorityPart = priToken ? ` ${priToken}` : '';

    // Check if the original task was a markdown checkbox using shared regex
    // For quoted lines, we need to check without the quote prefix
    const rawText = task.rawText;
    const quoteMatch = rawText.match(/^(\s*>\s*)/);
    const quotePrefix = quoteMatch ? quoteMatch[1] : '';
    const textWithoutQuote = quotePrefix
      ? rawText.substring(quotePrefix.length)
      : rawText;
    const checkboxMatch = textWithoutQuote.match(CHECKBOX_DETECTION_REGEX);
    const isCheckbox = checkboxMatch !== null;
    // Extract current list marker character (- or * or +) and checkbox state (x for checked, space for unchecked)
    // This preserves the checkbox state when changing to archived states
    const currentListMarkerChar = checkboxMatch ? checkboxMatch[1] : '-';
    const currentCheckboxState = checkboxMatch ? checkboxMatch[2] : ' ';
    let newLine: string;

    // Get the indent without the quote prefix (task.indent already includes the quote prefix for quoted tasks)
    const indentWithoutQuote = quotePrefix
      ? task.indent.replace(/\s*>\s*$/, '')
      : task.indent;

    if (newState === '') {
      // Handle empty state - remove task keyword entirely
      if (isCheckbox) {
        // For checkboxes, keep the checkbox format but remove the task keyword
        // Use single space between checkbox and text
        const textPart = task.text ? ` ${task.text}` : '';
        newLine = `${indentWithoutQuote}${quotePrefix}${currentListMarkerChar} [ ]${textPart}`;
      } else {
        // For regular tasks, remove the task keyword entirely
        // Handle spacing properly based on whether there's a list marker
        // Note: task.listMarker already includes trailing space if present
        const textPart = task.text ? task.text : '';
        // Same separator rule as the state-compose branch below: keep the
        // keyword-less text off an unwhitespace-terminated prefix (org-mode
        // heading stars) so the line stays a valid headline.
        const separator =
          !task.listMarker &&
          task.indent !== '' &&
          textPart !== '' &&
          !/\s$/.test(task.indent)
            ? ' '
            : '';
        newLine = `${task.indent}${separator}${task.listMarker || ''}${textPart}`;
      }

      // Add trailing comment end characters if they were present in the original task
      if (task.tail) {
        newLine += task.tail;
      }
    } else if (isCheckbox) {
      // Generate markdown checkbox format with proper spacing
      // For archived states, preserve the existing checkbox state
      const isArchived = keywordManagerInstance.isArchived(newState);

      let checkboxStatus: string;
      if (isArchived) {
        // Preserve existing checkbox state for archived tasks
        checkboxStatus = currentCheckboxState;
      } else {
        // Get the checkbox state character for the new state
        checkboxStatus = keywordManagerInstance.getCheckboxState(
          newState,
          keywordManagerInstance.getSettings(),
        );
      }

      const textPart = task.text ? ` ${task.text}` : '';
      newLine = `${indentWithoutQuote}${quotePrefix}${currentListMarkerChar} [${checkboxStatus}] ${newState}${priorityPart}${textPart}`;
    } else {
      // Generate original format, preserving comment prefix if present
      const textPart = task.text ? ` ${task.text}` : ' ';
      // Check if this is a footnote task and include the footnote marker
      const footnoteMarker = task.footnoteMarker || '';
      // Tasks without a list marker (org-mode heading stars, code comments)
      // compose the keyword straight onto the prefix. Keep them separated so
      // native syntax highlighting keeps working (`* TODO x`, not `*TODO x`).
      // No separator when the prefix is empty (column-0 tasks) or already
      // whitespace-terminated — existing output stays byte-identical.
      const prefix = `${task.indent}${footnoteMarker}`;
      const separator =
        !task.listMarker && prefix !== '' && !/\s$/.test(prefix) ? ' ' : '';
      newLine = `${prefix}${separator}${task.listMarker || ''}${newState}${priorityPart}${textPart}`;

      // Add trailing comment end characters if they were present in the original task
      if (task.tail) {
        newLine += task.tail;
      }
    }

    // Add a task-line embed reference only when it genuinely ends this line.
    // A block-end anchor belongs to a metadata line and must not move here.
    const lineAnchor = TaskWriter.taskLineAnchor(task);
    if (lineAnchor) {
      // Extract the original spacing from the raw text
      // Find where the task text (plus any footnote reference) ends and the embed reference begins
      const textToSearch = task.text + (task.footnoteReference || '');
      const textEndIndex =
        task.rawText.indexOf(textToSearch) + textToSearch.length;
      const originalSpacing = task.rawText.substring(
        textEndIndex,
        task.rawText.indexOf(lineAnchor, textEndIndex),
      );
      newLine += originalSpacing + lineAnchor;
    }

    // Add footnote reference if it exists
    if (task.footnoteReference) {
      // Extract the original spacing from the raw text
      // Find where the task text ends and the footnote reference begins
      const taskTextEndIndex =
        task.rawText.indexOf(task.text) + task.text.length;
      const originalSpacing = task.rawText.substring(
        taskTextEndIndex,
        task.rawText.indexOf(task.footnoteReference, taskTextEndIndex),
      );
      newLine += originalSpacing + task.footnoteReference;
    }

    const completed = keywordManagerInstance.isCompleted(newState);
    return { newLine, completed };
  }

  /**
   * Applies the change and returns an updated, immutable snapshot of the Task.
   *
   * File Operation Strategy:
   * - For active files: Uses Editor API (editor.replaceRange) to preserve cursor position, selection, and folds
   * - For inactive files: Uses Vault.process() for atomic background operations that prevent plugin conflicts
   * - If forceVaultApi is true, uses Vault.process() even for active files to prevent focus jump
   */
  async applyLineUpdate(
    task: Task,
    newState: string,
    keepPriority = true,
    forceVaultApi = false,
  ): Promise<Task> {
    // Table tasks use vault.process for cell-level writes
    if (task.isTableTask && task.tableCell) {
      return this.applyTableCellUpdate(task, newState, keepPriority);
    }

    const settings = this.settings;
    const { newLine, completed } = TaskWriter.generateTaskLine(
      task,
      newState,
      keepPriority,
      this.keywordManager,
    );

    // CLOSED date action for this transition (see resolveClosedDateAction).
    // Computed once here: it reads only `task` and `newState`, both immutable
    // inputs, and is consumed by the vault, editor, and accumulator branches.
    const canWriteMetadata = supportsTaskMetadata(task);
    const closedAction = canWriteMetadata
      ? this.resolveClosedDateAction(task, newState)
      : 'keep';

    // STARTED tracking: trigger on entry into an active state.
    // 'first' (default): first-ever start — insert once, never rewrite.
    // 'last': the stamp records the most recent entry into an active state
    // — rewritten in place on fresh (non-active→active) transitions only;
    // active→active switches keep the stamp (the work period never ended).
    const isActiveState = this.keywordManager.isActive(newState);
    const startedMode = settings?.startedDateMode ?? 'first';
    const freshActiveEntry =
      isActiveState && !this.keywordManager.isActive(task.state);
    const shouldStampStarted =
      canWriteMetadata &&
      Boolean(settings?.trackStartedDate) &&
      isActiveState &&
      (startedMode === 'last'
        ? freshActiveEntry || !task.startedDate
        : !task.startedDate);
    const allowStartedOverwrite = startedMode === 'last' && freshActiveEntry;
    const startedStampDate = shouldStampStarted ? new Date() : null;

    // Check if target is the active file in a MarkdownView
    // Using getActiveViewOfType() is safer than accessing workspace.activeLeaf directly
    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    const isActive = md?.file?.path === task.path;
    const editor = md?.editor;

    // Check if we're in source/edit mode (has editor) vs preview/reader mode
    // In preview mode, getViewType() returns 'markdown' but editor is undefined or null
    const isSourceMode =
      isActive &&
      editor &&
      md?.getViewType() === 'markdown' &&
      md?.getMode &&
      md.getMode() === 'source';

    // Mutable accumulators for the vault.process callback below.
    // NOTE: these MUST be declared before the callback runs (the callback
    // assigns to startedInserted); declaring them after the callback body
    // but before .process() would still be a temporal-dead-zone error.
    let lineDelta = 0;
    let updatedClosedDate = task.closedDate;
    let updatedStartedDate = task.startedDate;
    let startedInserted = false;
    let startedOverwrote = false;
    let retainedStartedDate: Date | null = null;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      if (isSourceMode && !forceVaultApi) {
        // Replace only the specific line using Editor API to preserve editor state
        // This maintains cursor position, selection, and code folds for better UX
        const currentLine = editor.getLine(task.line);
        if (typeof currentLine === 'string') {
          // Save current cursor position before the update
          const cursorPosition = editor.getCursor();

          const from: EditorPosition = { line: task.line, ch: 0 };
          const to: EditorPosition = {
            line: task.line,
            ch: currentLine.length,
          };
          editor.replaceRange(newLine, from, to);

          // Special cursor positioning for tasks with empty text
          if (task.text === '') {
            // Position cursor after the space that follows the keyword
            const keywordPosition = newLine.indexOf(newState);
            if (keywordPosition !== -1) {
              const newCursorPosition = keywordPosition + newState.length + 1;
              editor.setCursor({ line: task.line, ch: newCursorPosition });
            }
          } else if (cursorPosition.line === task.line) {
            // If cursor was on the same line, position it after the new keyword
            // Find where the new keyword starts in the new line
            const keywordPosition = newLine.indexOf(newState);
            if (keywordPosition !== -1) {
              const newCursorPosition = keywordPosition + newState.length;
              editor.setCursor({ line: task.line, ch: newCursorPosition });
            }
          }
        }
      } else {
        // Not in source mode (preview/reader mode) or not active or forceVaultApi: use atomic background edit
        // Include CLOSED date handling atomically in the same operation for consistency
        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          if (task.line < lines.length) {
            lines[task.line] = newLine;
          }

          // Handle CLOSED date atomically using the resolved action.
          // 'keep' leaves any existing CLOSED line exactly as the user wrote it
          // (the trackClosedDate setting gates insertion only, never removal).
          if (closedAction === 'add') {
            this.updateOrInsertDateLine(
              lines,
              task.line,
              'CLOSED',
              DateUtils.formatClosedDate(new Date()),
              task,
            );
          } else if (closedAction === 'remove') {
            this.removeDateLine(lines, task.line, 'CLOSED', task);
          }

          // Handle STARTED date atomically (entry into an active state,
          // per the startedDateMode rule). updateOrInsertStartedDateLine
          // never duplicates; it rewrites in place only when the 'last'
          // mode grants the overwrite (fresh re-entry).
          if (shouldStampStarted && startedStampDate) {
            const startedDateStr =
              DateUtils.formatStartedDate(startedStampDate);
            const startedResult = this.updateOrInsertStartedDateLine(
              lines,
              task.line,
              startedDateStr,
              task,
              allowStartedOverwrite,
            );
            startedInserted = startedResult.lineDelta > 0;
            startedOverwrote = startedResult.overwrote;
            retainedStartedDate = startedResult.retainedStartedDate;
          }

          // Stale-snapshot retention for NON-active transitions (e.g. a
          // DOING→DONE issued from a task object that predates the STARTED
          // insert): the insert above is skipped, but the file may already
          // carry a STARTED line. Derive its date so the returned snapshot
          // (and the state manager) never lose the start.
          if (
            settings?.trackStartedDate &&
            !task.startedDate &&
            !startedInserted &&
            retainedStartedDate === null
          ) {
            const existingIdx = findDateLine(
              lines,
              task.line + 1,
              'STARTED',
              getTaskIndent(task),
              this.keywordManager,
            );
            if (existingIdx >= 0) {
              retainedStartedDate = TaskWriter.parseStartedDateFromLine(
                lines[existingIdx],
              );
            }
          }

          return lines.join('\n');
        });
      }
    }

    // For source mode, handle CLOSED date separately via individual Editor API calls
    // The main editor.replaceRange above only replaces a single line, so CLOSED date
    // insertion/removal requires its own editor operations
    // Line delta and date accumulators were declared above (before vault.process)
    if (isSourceMode && !forceVaultApi) {
      if (closedAction === 'add') {
        const closedResult = await this.updateTaskClosedDate(
          task,
          new Date(),
          false,
        );
        lineDelta += closedResult.lineDelta;
        updatedClosedDate = closedResult.task.closedDate;
      } else if (closedAction === 'remove') {
        const closedResult = await this.removeTaskClosedDate(task, false);
        lineDelta += closedResult.lineDelta;
        updatedClosedDate = closedResult.task.closedDate;
      }
      // 'keep': leave the CLOSED line alone; updatedClosedDate keeps
      // task.closedDate — an existing timestamp is never rewritten.

      if (
        settings?.trackStartedDate &&
        (shouldStampStarted || !task.startedDate)
      ) {
        if (shouldStampStarted && startedStampDate) {
          // STARTED: insert via Editor API on entry into an active state
          // (per startedDateMode). updateTaskStartedDate never duplicates;
          // it rewrites in place only when the 'last' mode grants the
          // overwrite (fresh re-entry). Removal is not a concern here —
          // STARTED is removed only by the recurrence rollover.
          const startedResult = await this.updateTaskStartedDate(
            task,
            startedStampDate,
            false,
            allowStartedOverwrite,
          );
          lineDelta += startedResult.lineDelta;
          updatedStartedDate = startedResult.task.startedDate;
        } else if (editor) {
          // Stale-snapshot retention: a NON-active transition skips the
          // insert, but the editor may already carry a STARTED line the task
          // object predates. Derive its date so the snapshot never loses it.
          const editorLines = Array.from(
            { length: editor.lineCount() },
            (_, i) => editor.getLine(i),
          );
          const startedLineIndex = findDateLine(
            editorLines,
            task.line + 1,
            'STARTED',
            getTaskIndent(task),
            this.keywordManager,
          );
          if (startedLineIndex >= 0) {
            updatedStartedDate = TaskWriter.parseStartedDateFromLine(
              editorLines[startedLineIndex],
            );
          }
        }
      }
    } else if (!isSourceMode || forceVaultApi) {
      // For non-source mode, CLOSED date was handled atomically above
      if (closedAction === 'add') {
        lineDelta = 1;
        updatedClosedDate = new Date();
      } else if (closedAction === 'remove') {
        lineDelta = -1;
        updatedClosedDate = null;
      }

      // STARTED was handled atomically above; account for the written line.
      // Keyed on the actual file result — a write (insert or 'last'-mode
      // re-stamp) reports the exact date written; otherwise a stale snapshot
      // racing into a completed state still reports the retained start.
      if (settings?.trackStartedDate) {
        if (startedInserted || startedOverwrote) {
          lineDelta += startedInserted ? 1 : 0;
          // Single clock: the same Date instance written to the file.
          updatedStartedDate = startedStampDate;
        } else if (!task.startedDate) {
          updatedStartedDate = retainedStartedDate ?? null;
        }
      }
    }

    // Return an updated Task snapshot (do not mutate original)
    // Include lineDelta for the coordinator to adjust subsequent task indices
    const result: Task & { lineDelta?: number } = {
      ...task,
      rawText: newLine,
      state: newState,
      completed,
      closedDate: updatedClosedDate,
      startedDate: updatedStartedDate,
    };
    if (lineDelta !== 0) {
      result.lineDelta = lineDelta;
    }
    return result;
  }

  /**
   * Update a table cell task's state via vault.process().
   * Extracts just the keyword+text part from generateTaskLine() output
   * and replaces the cell content in the table row.
   */
  private isTableCellDateUpdate(task: Task): boolean {
    return !!(task.isTableTask && task.tableCell);
  }

  private async modifyTableCell(
    task: Task,
    mutate: (cellContent: string) => string,
    expected?: Task,
    changedMessage = 'Task row changed before recurrence update',
  ): Promise<boolean> {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!(file instanceof TFile)) return false;

    const mutateLine = (line: string): string | null => {
      if (expected && !this.lineMatchesRecurrenceTarget(line, expected)) {
        throw new Error(changedMessage);
      }
      const cell = parseTableCells(line)[task.tableCell!.cellIndex];
      if (!cell) return null;
      return replaceTableCellContent(
        line,
        task.tableCell!.cellIndex,
        mutate(cell.content),
      );
    };

    // If the file is open in the active source-mode editor, update the buffer
    // directly via the Editor API. This mirrors applyLineUpdate's checkbox path
    // and avoids Obsidian's vault.process merge corrupting the table row.
    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    const isActive = md?.file?.path === task.path;
    const editor = md?.editor;
    const isSourceMode =
      isActive &&
      !!editor &&
      md?.getViewType() === 'markdown' &&
      !!md?.getMode &&
      md.getMode() === 'source';

    if (isSourceMode) {
      const line = editor.getLine(task.line);
      if (typeof line !== 'string') return false;
      const newLine = mutateLine(line);
      if (newLine === null) return false;
      editor.replaceRange(
        newLine,
        { line: task.line, ch: 0 },
        { line: task.line, ch: line.length },
      );
      return true;
    }

    let applied = false;
    await this.app.vault.process(file, (data) => {
      const lines = data.split('\n');
      if (task.line >= lines.length) return data;
      const newLine = mutateLine(lines[task.line]);
      if (newLine === null) return data;
      lines[task.line] = newLine;
      applied = true;
      return lines.join('\n');
    });
    return applied;
  }

  private async applyTableCellUpdate(
    task: Task,
    newState: string,
    keepPriority: boolean,
  ): Promise<Task> {
    const { newLine, completed } = TaskWriter.generateTaskLine(
      task,
      newState,
      keepPriority,
      this.keywordManager,
    );

    // Extract just the keyword + text part (strip indent + listMarker)
    let cellContent = newLine;
    if (cellContent.startsWith(task.indent)) {
      cellContent = cellContent.slice(task.indent.length);
    }
    if (cellContent.startsWith(task.listMarker)) {
      cellContent = cellContent.slice(task.listMarker.length);
    }
    cellContent = cellContent.trim();

    // Table cells follow the same CLOSED matrix as list tasks
    // (resolveClosedDateAction). The parser DOES read CLOSED from <br>
    // segments into task.closedDate (TaskParser.parseTasksFromTableCells),
    // so preserve/remove decisions apply to cells exactly as to lines.
    const closedAction = this.resolveClosedDateAction(task, newState);

    let fullCellContent = cellContent;
    const applied = await this.modifyTableCell(
      task,
      (origCell) => {
        const brIdx = origCell.indexOf('<br');
        let dateSuffix = brIdx >= 0 ? origCell.substring(brIdx) : '';

        if (closedAction === 'add') {
          const closedDateStr = DateUtils.formatClosedDate(new Date());
          // Cell CLOSED dates use the same [date] single-bracket format as
          // non-cell CLOSED lines (formatClosedDate output is already
          // bracketed — do NOT wrap again). The pattern tolerates historic
          // bracket depths ([date], [[date]], [[[date]]]) from earlier
          // writers so re-stamping migrates them in place.
          const closedPattern =
            /\s*<br\s*\/?>\s*CLOSED:\s*\[{1,3}[^\]]*\]{1,3}/i;
          const closedTag = `<br>CLOSED: ${closedDateStr}`;
          dateSuffix = closedPattern.test(dateSuffix)
            ? dateSuffix.replace(closedPattern, closedTag)
            : `${dateSuffix}${closedTag}`;
        } else if (closedAction === 'remove') {
          // Tolerate historic bracket depths: [[[date]]] (double-wrapping bug
          // output), [[date]], [date]. Matching {1,3} on both sides removes
          // the whole tag — a {1,2} matcher would orphan trailing ']'s.
          dateSuffix = dateSuffix.replace(
            /\s*<br\s*\/?>\s*CLOSED:\s*\[{1,3}[^\]]*\]{1,3}/i,
            '',
          );
        }
        // closedAction === 'keep': leave any existing CLOSED tag untouched.

        fullCellContent = `${cellContent}${dateSuffix}`;
        return fullCellContent;
      },
      task,
      'Task row changed before state update',
    );
    if (!applied) {
      throw new Error('Task row changed before state update');
    }

    const closedDate =
      closedAction === 'add'
        ? new Date()
        : closedAction === 'remove'
          ? null
          : task.closedDate;

    return {
      ...task,
      rawText: fullCellContent,
      state: newState,
      completed,
      closedDate,
    };
  }

  /**
   * Replace cell content while preserving inline date lines.
   * Used by priority and other non-state updates on table tasks.
   */
  private async applyTableCellContent(
    task: Task,
    cellContent: string,
    extraUpdates: Partial<Task>,
  ): Promise<Task> {
    const applied = await this.modifyTableCell(
      task,
      (origCell) => {
        const brIdx = origCell.indexOf('<br');
        const dateSuffix = brIdx >= 0 ? origCell.substring(brIdx) : '';
        return `${cellContent}${dateSuffix}`;
      },
      task,
      'Task row changed before priority update',
    );
    if (!applied) {
      throw new Error('Task row changed before priority update');
    }

    return { ...task, rawText: cellContent, ...extraUpdates };
  }

  /**
   * Update a SCHEDULED/DEADLINE date inside a table cell.
   * Dates are stored inline as <br>SCHEDULED: <date> within the cell.
   */
  private async applyTableCellDateUpdate(
    task: Task,
    newDate: Date,
    dateType: 'SCHEDULED' | 'DEADLINE',
    repeat?: DateRepeatInfo | null,
    warningPeriod?: WarningPeriodInfo | null,
  ): Promise<Task & { lineDelta?: number }> {
    const dateStr = TaskWriter.buildDateLineContent(
      newDate,
      repeat,
      warningPeriod,
    );

    const applied = await this.modifyTableCell(
      task,
      (cell) => {
        const dateTag = `${dateType}: ${dateStr}`;
        const existing = new RegExp(
          `<br\\s*/?>\\s*${dateType}:\\s*<[^>]+>`,
          'i',
        );
        return existing.test(cell)
          ? cell.replace(existing, `<br>${dateTag}`)
          : `${cell}<br>${dateTag}`;
      },
      task,
      'Task row changed before date update',
    );
    if (!applied) {
      throw new Error('Task row changed before date update');
    }

    const result: Task & { lineDelta?: number } = {
      ...task,
      ...(dateType === 'SCHEDULED'
        ? {
            scheduledDate: newDate,
            scheduledDateRepeat: repeat ?? null,
            scheduledWarningPeriod: warningPeriod ?? null,
          }
        : {
            deadlineDate: newDate,
            deadlineDateRepeat: repeat ?? null,
            deadlineWarningPeriod: warningPeriod ?? null,
          }),
    };
    return result;
  }

  /**
   * Remove a date (SCHEDULED or DEADLINE) from a table cell.
   * Strips the <br>DATE_TYPE: <date> from the cell content.
   */
  private async removeTableCellDate(
    task: Task,
    dateType: 'SCHEDULED' | 'DEADLINE' | 'CLOSED',
  ): Promise<Task & { lineDelta?: number }> {
    const applied = await this.modifyTableCell(
      task,
      (cell) => {
        if (dateType === 'CLOSED') {
          // Tolerate historic bracket depths: [date], [[date]], [[[date]]]
          // (the triple form is output of an earlier double-wrapping bug).
          const datePattern = new RegExp(
            `\\s*<br\\s*/?>\\s*${dateType}:\\s*\\[{1,3}[^\\]]*\\]{1,3}`,
            'i',
          );
          return cell.replace(datePattern, '');
        }
        // SCHEDULED and DEADLINE use <date> format
        const datePattern = new RegExp(
          `\\s*<br\\s*/?>\\s*${dateType}:\\s*<[^>]+>`,
          'i',
        );
        return cell.replace(datePattern, '');
      },
      task,
      'Task row changed before date update',
    );
    if (!applied) {
      throw new Error('Task row changed before date update');
    }

    const result: Task & { lineDelta?: number } = {
      ...task,
      ...(dateType === 'SCHEDULED'
        ? { scheduledDate: null }
        : dateType === 'DEADLINE'
          ? { deadlineDate: null }
          : { closedDate: null }),
    };
    return result;
  }

  /**
   * Atomically apply a recurrence rollover to a table cell task: rewrite
   * the cell's keyword with the rolled state and advance/remove the inline
   * <br>SCHEDULED / <br>DEADLINE segments in place. One modifyTableCell
   * write keeps the row intact — the line-based updateOrInsertDateLine /
   * removeDateLine machinery must never touch a table row (it would rewrite
   * the whole row as a plain task line).
   */
  private async applyTableCellRecurrenceUpdate(
    task: Task,
    options: {
      newScheduledDate?: Date | null;
      newDeadlineDate?: Date | null;
      newScheduledRepeat?: DateRepeatInfo | null;
      newDeadlineRepeat?: DateRepeatInfo | null;
      newScheduledWarningPeriod?: WarningPeriodInfo | null;
      newDeadlineWarningPeriod?: WarningPeriodInfo | null;
      newState?: string;
      expectedRecurrence?: {
        scheduledDate?: Date | null;
        scheduledDateRepeat?: DateRepeatInfo | null;
        scheduledWarningPeriod?: WarningPeriodInfo | null;
        deadlineDate?: Date | null;
        deadlineDateRepeat?: DateRepeatInfo | null;
        deadlineWarningPeriod?: WarningPeriodInfo | null;
      };
    },
    startedReset: { shouldResetStarted: boolean },
  ): Promise<Task & { lineDelta?: number }> {
    let newCellContent = task.rawText;

    const applied = await this.modifyTableCell(
      task,
      (origCell) => {
        if (
          !this.tableCellPlanningMatches(origCell, options.expectedRecurrence)
        ) {
          throw new Error('Task row changed before recurrence update');
        }
        const brIdx = origCell.indexOf('<br');
        let textPart = (
          brIdx >= 0 ? origCell.substring(0, brIdx) : origCell
        ).trim();
        let dateSuffix = brIdx >= 0 ? origCell.substring(brIdx) : '';

        // Swap the keyword (mirrors applyTableCellUpdate: strip indent +
        // list marker so only keyword + priority + text land in the cell)
        if (options.newState !== undefined) {
          const generated = TaskWriter.generateTaskLine(
            task,
            options.newState,
            true,
            this.keywordManager,
          );
          let cellLine = generated.newLine;
          if (cellLine.startsWith(task.indent)) {
            cellLine = cellLine.slice(task.indent.length);
          }
          if (cellLine.startsWith(task.listMarker)) {
            cellLine = cellLine.slice(task.listMarker.length);
          }
          textPart = cellLine.trim();
        }

        // Advance or remove an inline date segment in place; append only
        // when the rollover adds a date the cell doesn't carry yet.
        const replaceInlineDate = (
          dateType: 'SCHEDULED' | 'DEADLINE',
          dateStr: string | null,
        ): void => {
          const existing = new RegExp(
            `\\s*<br\\s*/?>\\s*${dateType}:\\s*<[^>]+>`,
            'i',
          );
          if (dateStr === null) {
            dateSuffix = dateSuffix.replace(existing, '');
            return;
          }
          const tag = `<br>${dateType}: ${dateStr}`;
          dateSuffix = existing.test(dateSuffix)
            ? dateSuffix.replace(existing, tag)
            : `${dateSuffix}${tag}`;
        };

        if (options.newScheduledDate !== undefined) {
          replaceInlineDate(
            'SCHEDULED',
            options.newScheduledDate === null
              ? null
              : TaskWriter.buildDateLineContent(
                  options.newScheduledDate,
                  options.newScheduledRepeat ?? task.scheduledDateRepeat,
                  options.newScheduledWarningPeriod !== undefined
                    ? options.newScheduledWarningPeriod
                    : task.scheduledWarningPeriod,
                ),
          );
        }

        if (options.newDeadlineDate !== undefined) {
          replaceInlineDate(
            'DEADLINE',
            options.newDeadlineDate === null
              ? null
              : TaskWriter.buildDateLineContent(
                  options.newDeadlineDate,
                  options.newDeadlineRepeat ?? task.deadlineDateRepeat,
                  options.newDeadlineWarningPeriod !== undefined
                    ? options.newDeadlineWarningPeriod
                    : task.deadlineWarningPeriod,
                ),
          );
        }

        newCellContent = `${textPart}${dateSuffix}`;
        return newCellContent;
      },
      task,
    );
    if (!applied) {
      throw new Error('Task row changed before recurrence update');
    }

    const completed =
      options.newState !== undefined
        ? this.keywordManager.isCompleted(options.newState)
        : task.completed;

    return {
      ...task,
      rawText: newCellContent,
      state: options.newState ?? task.state,
      completed,
      // Cells never stamp STARTED at rollover (documented limitation): with
      // tracking on, the rolled occurrence starts unstamped; with tracking
      // off the parsed value is kept (any hand-written segment also stays
      // untouched in the file by the mutation above).
      startedDate: startedReset.shouldResetStarted ? null : task.startedDate,
      scheduledDate:
        options.newScheduledDate !== undefined
          ? options.newScheduledDate
          : task.scheduledDate,
      scheduledDateRepeat:
        options.newScheduledRepeat !== undefined
          ? options.newScheduledRepeat
          : task.scheduledDateRepeat,
      scheduledWarningPeriod:
        options.newScheduledWarningPeriod !== undefined
          ? options.newScheduledWarningPeriod
          : task.scheduledWarningPeriod,
      deadlineDate:
        options.newDeadlineDate !== undefined
          ? options.newDeadlineDate
          : task.deadlineDate,
      deadlineDateRepeat:
        options.newDeadlineRepeat !== undefined
          ? options.newDeadlineRepeat
          : task.deadlineDateRepeat,
      deadlineWarningPeriod:
        options.newDeadlineWarningPeriod !== undefined
          ? options.newDeadlineWarningPeriod
          : task.deadlineWarningPeriod,
      lineDelta: 0,
    };
  }

  // Cycles a task to its next state using TaskStateTransitionManager and persists change
  async updateTaskState(
    task: Task,
    nextState: string | null = null,
    forceVaultApi = false,
  ): Promise<Task> {
    let state: string;
    if (nextState == null) {
      const stateManager = getStateTransitionManager(
        this.plugin.taskUpdateCoordinator,
        this.keywordManager,
        this.settings?.stateTransitions,
      );
      state = stateManager.getNextState(task.state);
    } else {
      state = nextState;
    }
    return await this.applyLineUpdate(task, state, true, forceVaultApi);
  }

  // Cycles a task to its next state using TaskStateTransitionManager.getCycleState() and persists change
  async updateTaskCycleState(
    task: Task,
    nextState: string | null = null,
    forceVaultApi = false,
  ): Promise<Task> {
    let state: string;
    if (nextState == null) {
      const stateManager = getStateTransitionManager(
        this.plugin.taskUpdateCoordinator,
        this.keywordManager,
        this.settings?.stateTransitions,
      );
      state = stateManager.getCycleState(task.state);
    } else {
      state = nextState;
    }
    return await this.applyLineUpdate(task, state, true, forceVaultApi);
  }

  // Updates task priority and persists change
  async updateTaskPriority(
    task: Task,
    newPriority: 'high' | 'med' | 'low',
  ): Promise<Task> {
    // Table tasks: update cell content only
    if (task.isTableTask && task.tableCell) {
      const priorityToken =
        newPriority === 'high'
          ? '[#A]'
          : newPriority === 'med'
            ? '[#B]'
            : '[#C]';
      const text = task.text ? ` ${task.text}` : '';
      // A table cell's identity anchor is not part of task.text; carry it
      // through the rebuild so a priority edit never drops the anchor.
      const anchor = task.embedReference?.trim();
      const cellContent = `${task.state} ${priorityToken}${text}${
        anchor ? ` ${anchor}` : ''
      }`;
      return this.applyTableCellContent(task, cellContent, {
        priority: newPriority,
      });
    }

    // Generate priority token
    const priorityToken =
      newPriority === 'high' ? '[#A]' : newPriority === 'med' ? '[#B]' : '[#C]';

    // Reconstruct task line from task attributes
    // This preserves indent by using task.indent directly
    const indent = task.indent;
    const listMarker = task.listMarker || '';
    const state = task.state;
    const text = task.text ? ` ${task.text}` : '';

    // For checkbox tasks, ensure a space after the list marker
    // The listMarker may or may not include trailing whitespace depending on regex capture
    const isCheckboxTask = listMarker.includes('[');
    const listMarkerWithSpace =
      isCheckboxTask && !listMarker.endsWith(' ')
        ? `${listMarker} `
        : listMarker;

    // Preserve embed and footnote references if they exist
    // Embed reference comes before the text, footnote reference comes after the text
    const footnoteMarker = task.footnoteMarker || '';
    const lineAnchor = TaskWriter.taskLineAnchor(task);
    const anchorPart = lineAnchor ? ` ${lineAnchor}` : '';
    const footnoteReference = task.footnoteReference || '';
    const newTaskLine = `${indent}${footnoteMarker}${listMarkerWithSpace}${state} ${priorityToken}${text}${anchorPart}${footnoteReference}`;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!file || !(file instanceof TFile)) {
      return {
        ...task,
        rawText: newTaskLine,
        priority: newPriority,
      };
    }

    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    const isActive = md?.file?.path === task.path;
    const editor = md?.editor;

    const isSourceMode =
      isActive &&
      editor &&
      md?.getViewType() === 'markdown' &&
      md?.getMode &&
      md.getMode() === 'source';

    if (isSourceMode) {
      const currentLine = editor.getLine(task.line);
      if (typeof currentLine === 'string') {
        const from: EditorPosition = { line: task.line, ch: 0 };
        const to: EditorPosition = {
          line: task.line,
          ch: currentLine.length,
        };
        editor.replaceRange(newTaskLine, from, to);
      }
      return {
        ...task,
        rawText: newTaskLine,
        priority: newPriority,
      };
    }

    await this.app.vault.process(file, (data) => {
      const lines = data.split('\n');
      if (task.line < lines.length) {
        lines[task.line] = newTaskLine;
      }
      return lines.join('\n');
    });

    // Return an updated Task snapshot (do not mutate original)
    return {
      ...task,
      rawText: newTaskLine,
      priority: newPriority,
    };
  }

  /**
   * Removes the priority token from a task and persists the change.
   * If the task has no priority, returns the task unchanged without writing.
   */
  async removeTaskPriority(task: Task): Promise<Task> {
    if (!task.priority) {
      return { ...task };
    }

    // Table tasks: update cell content only
    if (task.isTableTask && task.tableCell) {
      const text = task.text ? ` ${task.text}` : '';
      const anchor = task.embedReference?.trim();
      const cellContent = `${task.state}${text}${anchor ? ` ${anchor}` : ''}`;
      return this.applyTableCellContent(task, cellContent, { priority: null });
    }

    // Reconstruct task line from task attributes (without priority)
    // This preserves indent by using task.indent directly
    const indent = task.indent;
    const listMarker = task.listMarker || '';
    const state = task.state;
    const text = task.text ? ` ${task.text}` : '';

    // For checkbox tasks, add a space after the list marker
    // The listMarker for checkboxes is "- [ ]" but format requires "- [ ] "
    // Check for '[' instead of '-[' to avoid footnote issues
    const isCheckboxTask = listMarker.includes('[');
    const listMarkerWithSpace = isCheckboxTask ? `${listMarker} ` : listMarker;

    // Preserve embed and footnote references if they exist
    // Embed reference comes before the text, footnote reference comes after the text
    const footnoteMarker = task.footnoteMarker || '';
    const lineAnchor = TaskWriter.taskLineAnchor(task);
    const anchorPart = lineAnchor ? ` ${lineAnchor}` : '';
    const footnoteReference = task.footnoteReference || '';
    const newTaskLine = `${indent}${footnoteMarker}${listMarkerWithSpace}${state}${text}${anchorPart}${footnoteReference}`;

    await this.writeLineToFile(task, newTaskLine);

    return {
      ...task,
      rawText: newTaskLine,
      priority: null,
    };
  }

  /**
   * Updates or adds a SCHEDULED date line below the task.
   * If a SCHEDULED line already exists, it is updated in place.
   * If no SCHEDULED line exists, a new one is inserted after the task line.
   * Returns the updated task with lineDelta for the coordinator to adjust subsequent task indices.
   */
  async updateTaskScheduledDate(
    task: Task,
    newDate: Date,
    repeat?: DateRepeatInfo | null,
    warningPeriod?: WarningPeriodInfo | null,
  ): Promise<Task & { lineDelta?: number }> {
    if (!supportsTaskMetadata(task)) {
      return { ...task, lineDelta: 0 };
    }

    // Table tasks store dates inline with <br> separators
    if (this.isTableCellDateUpdate(task)) {
      return this.applyTableCellDateUpdate(
        task,
        newDate,
        'SCHEDULED',
        repeat,
        warningPeriod,
      );
    }

    const dateStr = TaskWriter.buildDateLineContent(
      newDate,
      repeat,
      warningPeriod,
    );
    let lineDelta = 0;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      const editor = this.getEditorForTask(task);

      if (editor) {
        const taskIndent = getTaskIndent(task);
        lineDelta = this.updateDateLineInEditor(
          editor,
          task,
          'SCHEDULED',
          dateStr,
          taskIndent,
        );
      } else {
        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          const result = this.updateOrInsertDateLine(
            lines,
            task.line,
            'SCHEDULED',
            dateStr,
            task,
          );
          lineDelta = result.lineDelta;
          return lines.join('\n');
        });
      }
    }

    const result: Task & { lineDelta?: number } = {
      ...task,
      scheduledDate: newDate,
      scheduledDateRepeat: repeat ?? null,
      scheduledWarningPeriod: warningPeriod ?? null,
    };
    if (lineDelta !== 0) {
      result.lineDelta = lineDelta;
    }
    return result;
  }

  /**
   * Removes the SCHEDULED date line below the task.
   * If no SCHEDULED line exists in the file, returns the task unchanged.
   * Note: This method attempts to remove the SCHEDULED line regardless of whether
   * the task.scheduledDate property is set, as there may be a discrepancy between
   * the parsed property and what exists in the file.
   * Returns the updated task with lineDelta (only included when non-zero) for the coordinator
   * to adjust subsequent task indices.
   */
  async removeTaskScheduledDate(
    task: Task,
  ): Promise<Task & { lineDelta?: number }> {
    if (!supportsTaskMetadata(task)) {
      return { ...task, lineDelta: 0 };
    }

    // Table tasks store dates inline — strip from cell
    if (this.isTableCellDateUpdate(task)) {
      return this.removeTableCellDate(task, 'SCHEDULED');
    }

    let lineDelta = 0;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      const editor = this.getEditorForTask(task);

      if (editor) {
        const taskIndent = getTaskIndent(task);
        lineDelta = this.updateDateLineInEditor(
          editor,
          task,
          'SCHEDULED',
          null,
          taskIndent,
        );
      } else {
        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          const result = this.removeDateLine(
            lines,
            task.line,
            'SCHEDULED',
            task,
          );
          lineDelta = result.lineDelta;
          return lines.join('\n');
        });
      }
    }

    const result: Task & { lineDelta?: number } = {
      ...task,
      scheduledDate: null,
    };
    if (lineDelta !== 0) {
      result.lineDelta = lineDelta;
    }
    return result;
  }

  /**
   * Updates or adds a DEADLINE date line below the task.
   * If a DEADLINE line already exists, it is updated in place.
   * If no DEADLINE line exists, a new one is inserted after the task line (or after the
   * SCHEDULED line if one exists).
   * Returns the updated task with lineDelta (only included when non-zero) for the coordinator
   * to adjust subsequent task indices.
   */
  async updateTaskDeadlineDate(
    task: Task,
    newDate: Date,
    repeat?: DateRepeatInfo | null,
    warningPeriod?: WarningPeriodInfo | null,
  ): Promise<Task & { lineDelta?: number }> {
    if (!supportsTaskMetadata(task)) {
      return { ...task, lineDelta: 0 };
    }

    // Table tasks store dates inline with <br> separators
    if (this.isTableCellDateUpdate(task)) {
      return this.applyTableCellDateUpdate(
        task,
        newDate,
        'DEADLINE',
        repeat,
        warningPeriod,
      );
    }

    const dateStr = TaskWriter.buildDateLineContent(
      newDate,
      repeat,
      warningPeriod,
    );
    let lineDelta = 0;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      const editor = this.getEditorForTask(task);

      if (editor) {
        const taskIndent = getTaskIndent(task);
        lineDelta = this.updateDateLineInEditor(
          editor,
          task,
          'DEADLINE',
          dateStr,
          taskIndent,
        );
      } else {
        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          const result = this.updateOrInsertDateLine(
            lines,
            task.line,
            'DEADLINE',
            dateStr,
            task,
          );
          lineDelta = result.lineDelta;
          return lines.join('\n');
        });
      }
    }

    const result: Task & { lineDelta?: number } = {
      ...task,
      deadlineDate: newDate,
      deadlineDateRepeat: repeat ?? null,
      deadlineWarningPeriod: warningPeriod ?? null,
    };
    if (lineDelta !== 0) {
      result.lineDelta = lineDelta;
    }
    return result;
  }

  /**
   * Removes the DEADLINE date line below the task.
   * If no DEADLINE line exists in the file, returns the task unchanged.
   * Note: This method attempts to remove the DEADLINE line regardless of whether
   * the task.deadlineDate property is set, as there may be a discrepancy between
   * the parsed property and what exists in the file.
   * Returns the updated task with lineDelta (only included when non-zero) for the coordinator
   * to adjust subsequent task indices.
   */
  async removeTaskDeadlineDate(
    task: Task,
  ): Promise<Task & { lineDelta?: number }> {
    if (!supportsTaskMetadata(task)) {
      return { ...task, lineDelta: 0 };
    }

    // Table tasks store dates inline — strip from cell
    if (this.isTableCellDateUpdate(task)) {
      return this.removeTableCellDate(task, 'DEADLINE');
    }

    let lineDelta = 0;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      const editor = this.getEditorForTask(task);

      if (editor) {
        const taskIndent = getTaskIndent(task);
        lineDelta = this.updateDateLineInEditor(
          editor,
          task,
          'DEADLINE',
          null,
          taskIndent,
        );
      } else {
        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          const result = this.removeDateLine(
            lines,
            task.line,
            'DEADLINE',
            task,
          );
          lineDelta = result.lineDelta;
          return lines.join('\n');
        });
      }
    }

    const result: Task & { lineDelta?: number } = {
      ...task,
      deadlineDate: null,
    };
    if (lineDelta !== 0) {
      result.lineDelta = lineDelta;
    }
    return result;
  }

  /**
   * Helper: write a single line replacement to the file, using Editor API
   * for active files or Vault.process for background files.
   */
  private async writeLineToFile(task: Task, newLine: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      const md = this.app.workspace.getActiveViewOfType(MarkdownView);
      const isActive = md?.file?.path === task.path;
      const editor = md?.editor;

      if (isActive && editor) {
        const currentLine = editor.getLine(task.line);
        if (typeof currentLine === 'string') {
          const from: EditorPosition = { line: task.line, ch: 0 };
          const to: EditorPosition = {
            line: task.line,
            ch: currentLine.length,
          };
          editor.replaceRange(newLine, from, to);
        }
        return;
      }

      await this.app.vault.process(file, (data) => {
        const lines = data.split('\n');
        if (task.line < lines.length) {
          lines[task.line] = newLine;
        }
        return lines.join('\n');
      });
    }
  }

  /**
   * Updates or adds a STARTED date line below the task.
   *
   * IDEMPOTENT and ONE-WAY (first-ever-start semantics):
   * - If a STARTED line already exists, this method does NOTHING — the
   *   original timestamp is retained (no duplicate, no update).
   * - There is intentionally NO removal path. STARTED is never removed by
   *   state transitions; only manual user editing can remove the line.
   *
   * The line is inserted first in the date-line sequence (before
   * SCHEDULED/DEADLINE/CLOSED), mirroring CLOSED handling for both the
   * Editor and Vault API paths.
   *
   * Returns both the updated task and the line delta (+1 if inserted, 0 if
   * a STARTED line already existed).
   */
  /**
   * Insert (or, with allowOverwrite, rewrite) the task's STARTED line.
   *
   * Returns both the updated task and the line delta (+1 if inserted,
   * 0 if a STARTED line already existed). A STARTED line is never removed
   * here — removal belongs to the recurrence rollover only.
   */
  async updateTaskStartedDate(
    task: Task,
    startedDate: Date | null,
    forceVaultApi = false,
    allowOverwrite = false,
  ): Promise<DateLineUpdateResult> {
    if (!supportsTaskMetadata(task)) {
      return { task, lineDelta: 0 };
    }

    // Idempotent: if a STARTED line already exists, do nothing — unless
    // allowOverwrite ('last' mode fresh re-entry) rewrites the date in
    // place. STARTED is never removed once set.
    const dateStr = startedDate
      ? DateUtils.formatStartedDate(startedDate)
      : null;

    let lineDelta = 0;
    let retainedStartedDate: Date | null = null;
    let overwrote = false;

    if (!dateStr) {
      return {
        task: { ...task, startedDate: task.startedDate ?? null },
        lineDelta,
      };
    }

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      const md = this.app.workspace.getActiveViewOfType(MarkdownView);
      // Use Editor API only if NOT forcing Vault API AND file is active in editor (source mode)
      const isActive = !forceVaultApi && md?.file?.path === task.path;
      const editor = md?.editor;

      if (isActive && editor) {
        // Use Editor API when file is open in editor to avoid triggering file watcher
        const lines = Array.from({ length: editor.lineCount() }, (_, i) =>
          editor.getLine(i),
        );

        // Get the proper indent including quote prefix, bullet, or checkbox marker
        const taskIndent = getTaskIndent(task);

        // Idempotency check: search for an existing STARTED line regardless of
        // task.startedDate (file may contain one the parser hasn't picked up).
        const startedLineIndex = findDateLine(
          lines,
          task.line + 1,
          'STARTED',
          taskIndent,
          this.keywordManager,
        );

        if (startedLineIndex >= 0) {
          if (allowOverwrite) {
            // 'last' mode fresh re-entry: the new work period replaces the
            // record — rewrite the date in place, preserving the line's
            // indentation/quote prefix. lineDelta stays 0 (in-place update).
            const existingLine = editor.getLine(startedLineIndex);
            const prefixMatch = existingLine.match(
              /^(\s*(?:>\s*)?)STARTED:.*$/,
            );
            const prefix = prefixMatch ? prefixMatch[1] : taskIndent;
            const from: EditorPosition = { line: startedLineIndex, ch: 0 };
            const to: EditorPosition = {
              line: startedLineIndex,
              ch: existingLine.length,
            };
            editor.replaceRange(`${prefix}STARTED: ${dateStr}`, from, to);
            lineDelta = 0;
            overwrote = true;
          } else {
            // Existing STARTED line found: retain original, do nothing.
            lineDelta = 0;
            retainedStartedDate = TaskWriter.parseStartedDateFromLine(
              lines[startedLineIndex],
            );
          }
        } else {
          // Insert new STARTED line first in the date-line sequence
          const insertIndex = this.calcDateLineInsertIndex(
            lines,
            task.line,
            'STARTED',
            taskIndent,
          );
          const indent = this.getEffectiveDateLineIndent(lines, -1, task);
          this.insertDateLineInEditor(
            editor,
            insertIndex,
            `${indent}STARTED: ${dateStr}`,
            lines,
          );
          lineDelta = 1;
        }
      } else {
        // Vault API path (atomic)
        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          const result = this.updateOrInsertStartedDateLine(
            lines,
            task.line,
            dateStr,
            task,
            allowOverwrite,
          );
          lineDelta = result.lineDelta;
          retainedStartedDate = result.retainedStartedDate;
          overwrote = result.overwrote;
          return lines.join('\n');
        });
      }
    }

    return {
      task: {
        ...task,
        startedDate:
          overwrote || lineDelta > 0
            ? startedDate
            : (task.startedDate ?? retainedStartedDate ?? startedDate),
      },
      lineDelta,
    };
  }

  /**
   * Parse a retained STARTED line's date, mirroring the scanner's
   * parseDateFromLine so a snapshot derived from the file round-trips to
   * the same instant the parser produces.
   */
  private static parseStartedDateFromLine(line: string): Date | null {
    const match = line.match(/^\s*(?:>\s*)?STARTED:\s*(.+)$/);
    if (!match) {
      return null;
    }
    let content = splitTrailingBlockAnchor(match[1].trim()).text;
    if (content.startsWith('[') && content.endsWith(']')) {
      content = `<${content.slice(1, -1)}>`;
    }
    return DateParser.parseDate(content);
  }

  /**
   * Vault-API variant of idempotent STARTED insertion. An existing line is
   * retained untouched — the first-ever-start timestamp is preserved —
   * unless allowOverwrite ('last' mode fresh re-entry) rewrites its date
   * in place (lineDelta 0, overwrote true).
   */
  private updateOrInsertStartedDateLine(
    lines: string[],
    taskLineIndex: number,
    dateStr: string,
    task: Task,
    allowOverwrite = false,
  ): {
    lines: string[];
    lineDelta: number;
    retainedStartedDate: Date | null;
    overwrote: boolean;
  } {
    const kwManager = this.keywordManager;
    const taskIndent = getTaskIndent(task);
    const anchor = this.blockAnchorOf(lines, task);
    const existingIdx = findDateLine(
      lines,
      taskLineIndex + 1,
      'STARTED',
      taskIndent,
      kwManager,
    );

    if (existingIdx >= 0) {
      if (allowOverwrite) {
        // 'last' mode fresh re-entry: the new work period replaces the
        // record — rewrite the date in place, preserving the line's
        // indentation/quote prefix.
        const existingLine = lines[existingIdx];
        const prefixMatch = existingLine.match(/^(\s*(?:>\s*)?)STARTED:.*$/);
        const prefix = prefixMatch ? prefixMatch[1] : taskIndent;
        lines[existingIdx] = `${prefix}STARTED: ${dateStr}`;
        this.relocateBlockAnchor(lines, taskLineIndex, taskIndent, anchor);
        return {
          lines,
          lineDelta: 0,
          retainedStartedDate: TaskWriter.parseStartedDateFromLine(
            lines[existingIdx],
          ),
          overwrote: true,
        };
      }
      // Idempotent: retain the original STARTED line untouched, but report
      // its date so callers on a stale task snapshot can restore it.
      return {
        lines,
        lineDelta: 0,
        retainedStartedDate: TaskWriter.parseStartedDateFromLine(
          lines[existingIdx],
        ),
        overwrote: false,
      };
    }

    const insertIdx = this.calcDateLineInsertIndex(
      lines,
      taskLineIndex,
      'STARTED',
      taskIndent,
    );
    const indent = this.getEffectiveDateLineIndent(lines, -1, task);
    lines.splice(insertIdx, 0, `${indent}STARTED: ${dateStr}`);
    this.relocateBlockAnchor(lines, taskLineIndex, taskIndent, anchor);
    return {
      lines,
      lineDelta: 1,
      retainedStartedDate: null,
      overwrote: false,
    };
  }

  /**
   * Updates or adds a CLOSED date line below the task.
   * If a CLOSED line already exists, it is updated in place.
   * If no CLOSED line exists, a new one is inserted after DEADLINE (or after task if no DEADLINE).
   * Returns both the updated task and the line delta (+1 if new line inserted, 0 if updated in place).
   */
  async updateTaskClosedDate(
    task: Task,
    closedDate: Date,
    forceVaultApi = false,
  ): Promise<DateLineUpdateResult> {
    if (!supportsTaskMetadata(task)) {
      return { task, lineDelta: 0 };
    }

    const dateStr = DateUtils.formatClosedDate(closedDate);
    let lineDelta = 0;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      const md = this.app.workspace.getActiveViewOfType(MarkdownView);
      // Use Editor API only if NOT forcing Vault API AND file is active in editor (source mode)
      const isActive = !forceVaultApi && md?.file?.path === task.path;
      const editor = md?.editor;

      if (isActive && editor) {
        // Use Editor API when file is open in editor to avoid triggering file watcher
        const lines = Array.from({ length: editor.lineCount() }, (_, i) =>
          editor.getLine(i),
        );

        // Get the proper indent including quote prefix, bullet, or checkbox marker
        const taskIndent = getTaskIndent(task);
        const anchor = this.editorBlockAnchor(editor, task);

        // Search for existing CLOSED line
        // Always search regardless of task.closedDate because:
        // 1. On first completion: no CLOSED line exists, insert new
        // 2. On re-completion: CLOSED line exists from previous close, update existing
        const closedLineIndex = findDateLine(
          lines,
          task.line + 1,
          'CLOSED',
          taskIndent,
          this.keywordManager,
        );

        // Find insert position using helper (after DEADLINE/SCHEDULED if present, otherwise after task)
        const insertIndex = this.calcDateLineInsertIndex(
          lines,
          task.line,
          'CLOSED',
          taskIndent,
        );

        const closedIndent = this.getEffectiveDateLineIndent(
          lines,
          closedLineIndex,
          task,
        );

        if (closedLineIndex >= 0) {
          // Update existing CLOSED line, preserving its indentation
          const from: EditorPosition = { line: closedLineIndex, ch: 0 };
          const to: EditorPosition = {
            line: closedLineIndex,
            ch: lines[closedLineIndex].length,
          };
          editor.replaceRange(`${closedIndent}CLOSED: ${dateStr}`, from, to);
          lineDelta = 0; // Updated in place, no line count change
        } else {
          // Insert new CLOSED line at calculated position
          this.insertDateLineInEditor(
            editor,
            insertIndex,
            `${closedIndent}CLOSED: ${dateStr}`,
            lines,
          );
          lineDelta = 1; // New line inserted
        }
        this.relocateBlockAnchorInEditor(editor, task, anchor);
      } else {
        // Vault API path
        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          const result = this.updateOrInsertDateLine(
            lines,
            task.line,
            'CLOSED',
            dateStr,
            task,
          );
          lineDelta = result.lineDelta;
          return lines.join('\n');
        });
      }
    }

    return {
      task: {
        ...task,
        closedDate: closedDate,
      },
      lineDelta,
    };
  }

  /**
   * Decide what should happen to the CLOSED date line for a state transition.
   *
   * Matrix (maintainer-clarified, 2026-09-21):
   * - target is completed and trackClosedDate is enabled and the task has no
   *   CLOSED date yet:
   *       'add'    — fresh completion stamps CLOSED with the current time.
   * - target is completed or archived (all other cases):
   *       'keep'   — never add (archived targets never stamp CLOSED), never
   *                  overwrite an existing timestamp, never remove. This covers
   *                  DONE→CANCELED, DONE→ARCHIVED, re-completing an already
   *                  completed task, and archiving with tracking disabled.
   * - target is active/inactive/waiting AND the task was completed:
   *       'remove' — the task is no longer completed, so the record of closure
   *                  goes with it. This applies regardless of the
   *                  trackClosedDate setting: removal is a consequence of
   *                  leaving the completed state, not of the tracking
   *                  preference.
   * - otherwise (non-completed → non-completed):
   *       'keep'   — never touch a CLOSED line the user wrote.
   *
   * The trackClosedDate setting gates insertion only; it never gates removal.
   * An existing CLOSED line is user data (see docs/task-entry.md) and must not
   * be deleted merely because tracking is disabled.
   */
  private resolveClosedDateAction(
    task: Task,
    newState: string,
  ): 'add' | 'remove' | 'keep' {
    const isTargetCompleted = this.keywordManager.isCompleted(newState);

    if (isTargetCompleted || this.keywordManager.isArchived(newState)) {
      // Fresh completion only: the source must not already be completed
      // (completed → completed keeps — never stamps a NEW timestamp).
      const sourceCompleted =
        task.completed || this.keywordManager.isCompleted(task.state);
      if (
        isTargetCompleted &&
        this.settings?.trackClosedDate &&
        !task.closedDate &&
        !sourceCompleted
      ) {
        return 'add';
      }
      return 'keep';
    }

    if (task.completed || this.keywordManager.isCompleted(task.state)) {
      return 'remove';
    }
    return 'keep';
  }

  /**
   * Removes the CLOSED date line below the task.
   * If no CLOSED line exists in the file, returns the task unchanged.
   * Note: This method attempts to remove the CLOSED line regardless of whether
   * the task.closedDate property is set, as there may be a discrepancy between
   * the parsed property and what exists in the file.
   * Returns both the updated task and the line delta (-1 if line removed, 0 if no line found).
   * Note: Unlike removeTaskScheduledDate and removeTaskDeadlineDate, this method always
   * includes lineDelta in the return value (even when 0) due to its DateLineUpdateResult return type.
   */
  async removeTaskClosedDate(
    task: Task,
    forceVaultApi = false,
  ): Promise<DateLineUpdateResult> {
    if (!supportsTaskMetadata(task)) {
      return { task, lineDelta: 0 };
    }

    // Table tasks store dates inline — strip from cell
    if (this.isTableCellDateUpdate(task)) {
      await this.removeTableCellDate(task, 'CLOSED');
      return {
        task: { ...task, closedDate: null },
        lineDelta: 0,
      };
    }

    let lineDelta = 0;

    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (file && file instanceof TFile) {
      const md = this.app.workspace.getActiveViewOfType(MarkdownView);
      // Use Editor API only if NOT forcing Vault API AND file is active in editor (source mode)
      const isActive = !forceVaultApi && md?.file?.path === task.path;
      const editor = md?.editor;

      if (isActive && editor) {
        // Use Editor API when file is open in editor to avoid triggering file watcher
        lineDelta += this.removeDateLineInEditor(editor, task, 'CLOSED');
      } else {
        // Use Vault API for background edits
        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          const result = this.removeDateLine(lines, task.line, 'CLOSED', task);
          lineDelta = result.lineDelta;
          return lines.join('\n');
        });
      }
    }

    return {
      task: {
        ...task,
        closedDate: null,
      },
      lineDelta,
    };
  }

  /**
   * Remove an existing date line (CLOSED/STARTED/…) after the task via the
   * Editor API. Two-step removal (clear the line, then swallow its newline)
   * mirrors removeTaskClosedDate's historical editor branch. Returns -1 when
   * a line was removed, 0 when absent (idempotent).
   */
  private removeDateLineInEditor(
    editor: Editor,
    task: Task,
    dateType: DateLineType,
  ): number {
    const taskIndent = getTaskIndent(task);
    const anchor = this.editorBlockAnchor(editor, task);
    const lineIndex = findDateLine(
      Array.from({ length: editor.lineCount() }, (_, i) => editor.getLine(i)),
      task.line + 1,
      dateType,
      taskIndent,
      this.keywordManager,
    );
    if (lineIndex < 0) {
      return 0;
    }
    const from: EditorPosition = { line: lineIndex, ch: 0 };
    const to: EditorPosition = {
      line: lineIndex,
      ch: editor.getLine(lineIndex).length,
    };
    // Replace with empty string to remove the line
    editor.replaceRange('', from, to);
    // Remove the newline as well by extending to the next line
    const nextLineFrom: EditorPosition = { line: lineIndex, ch: 0 };
    const nextLineTo: EditorPosition = { line: lineIndex + 1, ch: 0 };
    editor.replaceRange('', nextLineFrom, nextLineTo);
    this.relocateBlockAnchorInEditor(editor, task, anchor);
    return -1;
  }

  /**
   * Atomically apply all recurrence updates (scheduled date, deadline date,
   * and state).
   *
   * File Operation Strategy:
   * - For active files in source mode: Uses Editor API (editor.replaceRange)
   *   to avoid triggering Obsidian's external file modification warning.
   * - For inactive files: Uses Vault.process() for atomic background operations.
   *
   * Returns the updated task snapshot with accumulated lineDelta.
   */
  async applyRecurrenceUpdate(
    task: Task,
    options: {
      newScheduledDate?: Date | null;
      newDeadlineDate?: Date | null;
      newScheduledRepeat?: DateRepeatInfo | null;
      newDeadlineRepeat?: DateRepeatInfo | null;
      newScheduledWarningPeriod?: WarningPeriodInfo | null;
      newDeadlineWarningPeriod?: WarningPeriodInfo | null;
      newState?: string;
      expectedRecurrence?: {
        scheduledDate?: Date | null;
        scheduledDateRepeat?: DateRepeatInfo | null;
        scheduledWarningPeriod?: WarningPeriodInfo | null;
        deadlineDate?: Date | null;
        deadlineDateRepeat?: DateRepeatInfo | null;
        deadlineWarningPeriod?: WarningPeriodInfo | null;
      };
    },
  ): Promise<Task & { lineDelta?: number }> {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    // A deleted or renamed note leaves nothing to roll over. Returning the
    // advanced snapshot here would let the coordinator publish a write that
    // never happened, so fail like the table row guard does.
    if (!(file instanceof TFile)) {
      throw new Error('Task row changed before recurrence update');
    }
    let lineDelta = 0;

    let newRawText: string | undefined;

    // Check if target is the active file in source mode
    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    const isActive = md?.file?.path === task.path;
    const editor = md?.editor;
    const isSourceMode =
      isActive &&
      editor &&
      md?.getViewType() === 'markdown' &&
      md?.getMode &&
      md.getMode() === 'source';

    // Per-occurrence STARTED reset. The rollover is the one operation that
    // advances the occurrence's dates, so it is the one operation that
    // resets the STARTED record: remove the completed occurrence's stamp
    // (idempotent) and, only when the rolled state is active, stamp the new
    // occurrence fresh. Gated on the setting AND a date advance — manual
    // transitions (including DONE→TODO and DOING→TODO) never reach here.
    const settings = this.settings;
    const shouldResetStarted =
      Boolean(settings?.trackStartedDate) &&
      (options.newScheduledDate !== undefined ||
        options.newDeadlineDate !== undefined);
    const freshStartedDate =
      shouldResetStarted &&
      options.newState !== undefined &&
      this.keywordManager.isActive(options.newState)
        ? new Date()
        : null;

    // Table-cell tasks store dates INLINE — the rollover is one
    // modifyTableCell write that swaps the keyword and advances/removes
    // the <br>SCHEDULED / <br>DEADLINE segments in place. The row is never
    // rewritten as a plain task line and no date lines are inserted below
    // the table. Cells never write STARTED (documented limitation, same as
    // applyTableCellUpdate), so the rolled snapshot carries startedDate
    // null when the rollover ran with tracking on — the file holds no
    // stamp.
    if (this.isTableCellDateUpdate(task)) {
      return this.applyTableCellRecurrenceUpdate(task, options, {
        shouldResetStarted,
      });
    }

    if (file instanceof TFile) {
      if (isSourceMode && editor) {
        // Use Editor API to avoid external file modification warning
        const taskIndent = getTaskIndent(task);
        let totalDelta = 0;
        const editorLines = this.editorLines(editor);
        if (
          !this.lineMatchesRecurrenceTarget(editor.getLine(task.line), task) ||
          !this.blockIdentityMatches(editorLines, task) ||
          !this.recurrencePlanningMatches(
            editorLines,
            task,
            options.expectedRecurrence,
          )
        ) {
          throw new Error('Task row changed before recurrence update');
        }

        // Update task state first if requested
        if (options.newState !== undefined) {
          const generated = TaskWriter.generateTaskLine(
            task,
            options.newState,
            true,
            this.keywordManager,
          );
          const currentLine = editor.getLine(task.line);
          if (typeof currentLine === 'string') {
            const from: EditorPosition = { line: task.line, ch: 0 };
            const to: EditorPosition = {
              line: task.line,
              ch: currentLine.length,
            };
            editor.replaceRange(generated.newLine, from, to);
            newRawText = generated.newLine;
          }
        }

        // Update SCHEDULED date if requested
        if (options.newScheduledDate !== undefined) {
          const dateStr =
            options.newScheduledDate === null
              ? null
              : TaskWriter.buildDateLineContent(
                  options.newScheduledDate,
                  options.newScheduledRepeat ?? task.scheduledDateRepeat,
                  options.newScheduledWarningPeriod !== undefined
                    ? options.newScheduledWarningPeriod
                    : task.scheduledWarningPeriod,
                );
          const delta = this.updateDateLineInEditor(
            editor,
            task,
            'SCHEDULED',
            dateStr,
            taskIndent,
          );
          totalDelta += delta;
        }

        // Update DEADLINE date if requested
        if (options.newDeadlineDate !== undefined) {
          const dateStr =
            options.newDeadlineDate === null
              ? null
              : TaskWriter.buildDateLineContent(
                  options.newDeadlineDate,
                  options.newDeadlineRepeat ?? task.deadlineDateRepeat,
                  options.newDeadlineWarningPeriod !== undefined
                    ? options.newDeadlineWarningPeriod
                    : task.deadlineWarningPeriod,
                );
          const delta = this.updateDateLineInEditor(
            editor,
            task,
            'DEADLINE',
            dateStr,
            taskIndent,
          );
          totalDelta += delta;
        }

        // Per-occurrence STARTED reset (editor path: sequential editor ops,
        // mirroring removeTaskClosedDate — no second write mechanism).
        if (shouldResetStarted) {
          totalDelta += this.removeDateLineInEditor(editor, task, 'STARTED');
          if (freshStartedDate) {
            const startedResult = await this.updateTaskStartedDate(
              task,
              freshStartedDate,
              false,
            );
            totalDelta += startedResult.lineDelta;
          }
        }

        lineDelta = totalDelta;
      } else {
        // Vault API path for inactive files
        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          if (
            !this.lineMatchesRecurrenceTarget(lines[task.line], task) ||
            !this.blockIdentityMatches(lines, task) ||
            !this.recurrencePlanningMatches(
              lines,
              task,
              options.expectedRecurrence,
            )
          ) {
            throw new Error('Task row changed before recurrence update');
          }
          let totalDelta = 0;

          // Update SCHEDULED date if requested
          if (options.newScheduledDate !== undefined) {
            if (options.newScheduledDate === null) {
              const result = this.removeDateLine(
                lines,
                task.line,
                'SCHEDULED',
                task,
              );
              totalDelta += result.lineDelta;
            } else {
              const dateStr = TaskWriter.buildDateLineContent(
                options.newScheduledDate,
                options.newScheduledRepeat ?? task.scheduledDateRepeat,
                options.newScheduledWarningPeriod !== undefined
                  ? options.newScheduledWarningPeriod
                  : task.scheduledWarningPeriod,
              );
              const result = this.updateOrInsertDateLine(
                lines,
                task.line,
                'SCHEDULED',
                dateStr,
                task,
              );
              totalDelta += result.lineDelta;
            }
          }

          // Update DEADLINE date if requested
          if (options.newDeadlineDate !== undefined) {
            if (options.newDeadlineDate === null) {
              const result = this.removeDateLine(
                lines,
                task.line,
                'DEADLINE',
                task,
              );
              totalDelta += result.lineDelta;
            } else {
              const dateStr = TaskWriter.buildDateLineContent(
                options.newDeadlineDate,
                options.newDeadlineRepeat ?? task.deadlineDateRepeat,
                options.newDeadlineWarningPeriod !== undefined
                  ? options.newDeadlineWarningPeriod
                  : task.deadlineWarningPeriod,
              );
              const result = this.updateOrInsertDateLine(
                lines,
                task.line,
                'DEADLINE',
                dateStr,
                task,
              );
              totalDelta += result.lineDelta;
            }
          }

          // Update task state if requested
          if (options.newState !== undefined) {
            const generated = TaskWriter.generateTaskLine(
              task,
              options.newState,
              true,
              this.keywordManager,
            );
            if (task.line < lines.length) {
              lines[task.line] = generated.newLine;
            }
            newRawText = generated.newLine;
          }

          // Per-occurrence STARTED reset — inside the SAME vault.process so
          // the rollover stays one atomic write / one undo entry.
          if (shouldResetStarted) {
            const removal = this.removeDateLine(
              lines,
              task.line,
              'STARTED',
              task,
            );
            totalDelta += removal.lineDelta;
            if (freshStartedDate) {
              const insert = this.updateOrInsertStartedDateLine(
                lines,
                task.line,
                DateUtils.formatStartedDate(freshStartedDate),
                task,
              );
              totalDelta += insert.lineDelta;
            }
          }

          lineDelta = totalDelta;
          return lines.join('\n');
        });
      }
    }

    // Build the updated task snapshot
    const completed =
      options.newState !== undefined
        ? this.keywordManager.isCompleted(options.newState)
        : task.completed;

    const result: Task & { lineDelta?: number } = {
      ...task,
      rawText: newRawText ?? task.rawText,
      state: options.newState ?? task.state,
      completed,
      // Reset only when this write is the date-advancing rollover; the
      // file is the truth: rolled inactive → null, rolled active → fresh.
      startedDate: shouldResetStarted ? freshStartedDate : task.startedDate,
      scheduledDate:
        options.newScheduledDate !== undefined
          ? options.newScheduledDate
          : task.scheduledDate,
      scheduledDateRepeat:
        options.newScheduledRepeat !== undefined
          ? options.newScheduledRepeat
          : task.scheduledDateRepeat,
      scheduledWarningPeriod:
        options.newScheduledWarningPeriod !== undefined
          ? options.newScheduledWarningPeriod
          : task.scheduledWarningPeriod,
      deadlineDate:
        options.newDeadlineDate !== undefined
          ? options.newDeadlineDate
          : task.deadlineDate,
      deadlineDateRepeat:
        options.newDeadlineRepeat !== undefined
          ? options.newDeadlineRepeat
          : task.deadlineDateRepeat,
      deadlineWarningPeriod:
        options.newDeadlineWarningPeriod !== undefined
          ? options.newDeadlineWarningPeriod
          : task.deadlineWarningPeriod,
    };
    if (lineDelta !== 0) {
      result.lineDelta = lineDelta;
    }
    return result;
  }

  /**
   * Check if the task's file is active in source mode and return the editor.
   * Returns null if the file is not active or not in source mode.
   */
  private getEditorForTask(task: Task): Editor | null {
    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    const isActive = md?.file?.path === task.path;
    const editor = md?.editor;
    const isSourceMode =
      isActive &&
      editor &&
      md?.getViewType() === 'markdown' &&
      md?.getMode &&
      md.getMode() === 'source';
    return isSourceMode && editor ? editor : null;
  }

  /**
   * Update, insert, or remove a date line (SCHEDULED/DEADLINE) via the Editor API.
   * Returns the line delta (+1 insert, -1 remove, 0 update).
   */
  private updateDateLineInEditor(
    editor: Editor,
    task: Task,
    dateType: DateLineType,
    dateStr: string | null,
    taskIndent: string,
  ): number {
    const lines = this.editorLines(editor);
    const anchor = this.editorBlockAnchor(editor, task);

    if (task.sourceFormat === 'org') {
      const token = findOrgPlanningToken(lines, task.line + 1, dateType);
      if (token) {
        const replacement = dateStr === null ? null : `${dateType}: ${dateStr}`;
        const next = replaceOrgPlanningToken(
          lines[token.lineIndex],
          token,
          replacement,
        );
        if (dateStr === null && next === null) {
          editor.replaceRange(
            '',
            { line: token.lineIndex, ch: 0 },
            { line: token.lineIndex + 1, ch: 0 },
          );
          this.relocateBlockAnchorInEditor(editor, task, anchor);
          return -1;
        }
        const oldLine = lines[token.lineIndex];
        editor.replaceRange(
          next ?? '',
          { line: token.lineIndex, ch: 0 },
          { line: token.lineIndex, ch: oldLine.length },
        );
        this.relocateBlockAnchorInEditor(editor, task, anchor);
        return 0;
      }
      if (dateStr === null) return 0;
    }

    const existingIdx = findDateLine(
      lines,
      task.line + 1,
      dateType,
      taskIndent,
      this.keywordManager,
    );

    if (dateStr === null) {
      if (existingIdx >= 0) {
        editor.replaceRange(
          '',
          { line: existingIdx, ch: 0 },
          { line: existingIdx + 1, ch: 0 },
        );
        this.relocateBlockAnchorInEditor(editor, task, anchor);
        return -1;
      }
      return 0;
    }

    if (existingIdx >= 0) {
      const indent = this.getEffectiveDateLineIndent(lines, existingIdx, task);
      editor.replaceRange(
        `${indent}${dateType}: ${dateStr}`,
        { line: existingIdx, ch: 0 },
        { line: existingIdx, ch: editor.getLine(existingIdx).length },
      );
      this.relocateBlockAnchorInEditor(editor, task, anchor);
      return 0;
    }

    const insertIdx = this.calcDateLineInsertIndex(
      lines,
      task.line,
      dateType,
      taskIndent,
    );
    const indent = this.getEffectiveDateLineIndent(lines, -1, task);
    this.insertDateLineInEditor(
      editor,
      insertIdx,
      `${indent}${dateType}: ${dateStr}`,
      lines,
    );
    this.relocateBlockAnchorInEditor(editor, task, anchor);
    return 1;
  }

  /**
   * Insert a complete date line at `insertIdx` through the Editor API.
   *
   * CodeMirror clamps out-of-range positions to the end of the document, so
   * `replaceRange(text + '\n', {line: lineCount, ch: 0}, …)` splices the
   * text onto the END of the last line ("SCHEDULED: …CLOSED: …") instead of
   * starting its own line. Anchor to the end of the final line with a
   * LEADING newline instead; when the document ends with an empty line the
   * classic line-boundary insert is already safe.
   */
  private insertDateLineInEditor(
    editor: Editor,
    insertIdx: number,
    lineText: string,
    sourceLines: string[],
  ): void {
    const lastLine = sourceLines[sourceLines.length - 1] ?? '';
    if (insertIdx >= sourceLines.length && lastLine !== '') {
      const last = Math.max(sourceLines.length - 1, 0);
      const pos: EditorPosition = { line: last, ch: lastLine.length };
      editor.replaceRange(`\n${lineText}`, pos, { ...pos });
    } else {
      const at = Math.min(insertIdx, Math.max(sourceLines.length - 1, 0));
      editor.replaceRange(
        `${lineText}\n`,
        { line: at, ch: 0 },
        { line: at, ch: 0 },
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Inlined date-line helpers (formerly src/services/date-line-operator.ts)
  // All methods are private; they capture `this.keywordManager` from the
  // owning TaskWriter instance. The math here is pure and identical to the
  // prior module — just relocated behind the class boundary.
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Extract the effective indentation from a date line.
   * Handles both plain indentation and quoted lines ("> " prefixes).
   */
  private getExistingDateLineIndent(line: string): string {
    const lineIndent = line.match(/^(\s*)/)?.[1] ?? '';
    const lineQuotePrefix = line.match(/^(\s*(>\s*)+)/)?.[1] ?? '';
    return lineQuotePrefix || lineIndent;
  }

  /**
   * Resolve the indent to use for a date line operation.
   * If the line already exists, preserves its current indent.
   * Otherwise, computes the default indent for the task.
   */
  private getEffectiveDateLineIndent(
    lines: string[],
    existingLineIndex: number,
    task: Task,
  ): string {
    if (existingLineIndex >= 0) {
      return this.getExistingDateLineIndent(lines[existingLineIndex]);
    }
    return getDateLineIndent(task);
  }

  /**
   * Calculate the line index where a new date line should be inserted.
   *
   * Insertion rules (all indices relative to task.line):
   * - DESCRIPTION: always inserted at taskLineIndex + 1
   * - STARTED:     first in the date-line sequence — immediately after the task
   *                line/description, BEFORE any SCHEDULED line (pushes SCHEDULED down)
   * - SCHEDULED: before DEADLINE (if exists), else after STARTED (if exists),
   *              else after DESCRIPTION (if exists), else after task
   * - DEADLINE:  after SCHEDULED (if exists), else after STARTED (if exists),
   *              else after DESCRIPTION (if exists), else after task
   * - CLOSED:    after DEADLINE (if exists), else after SCHEDULED (if exists),
   *              else after STARTED (if exists), else after task
   */
  private calcDateLineInsertIndex(
    lines: string[],
    taskLineIndex: number,
    dateType: DateLineType,
    taskIndent: string,
  ): number {
    const kwManager = this.keywordManager;
    const afterTask = taskLineIndex + 1;

    // Find DESCRIPTION position (dates must go after it)
    const descIdx = findDescriptionLine(lines, afterTask, taskIndent);
    const afterDesc = descIdx >= 0 ? descIdx + 1 : afterTask;

    if (dateType === 'STARTED') {
      // STARTED goes FIRST among date lines: before SCHEDULED/DEADLINE/CLOSED.
      const scheduledIdx = findDateLine(
        lines,
        afterTask,
        'SCHEDULED',
        taskIndent,
        kwManager,
      );
      if (scheduledIdx >= 0) return scheduledIdx;
      const deadlineIdx = findDateLine(
        lines,
        afterTask,
        'DEADLINE',
        taskIndent,
        kwManager,
      );
      if (deadlineIdx >= 0) return deadlineIdx;
      const closedIdx = findDateLine(
        lines,
        afterTask,
        'CLOSED',
        taskIndent,
        kwManager,
      );
      if (closedIdx >= 0) return closedIdx;
      return afterDesc;
    }
    if (dateType === 'SCHEDULED') {
      // Insert before DEADLINE (if exists), else after STARTED (if exists),
      // else after DESCRIPTION. Checking STARTED keeps the sequence order
      // STARTED → SCHEDULED: inserting before an existing STARTED line would
      // violate the STARTED-first invariant.
      const deadlineIdx = findDateLine(
        lines,
        afterTask,
        'DEADLINE',
        taskIndent,
        kwManager,
      );
      if (deadlineIdx >= 0) return deadlineIdx;
      const startedIdx = findDateLine(
        lines,
        afterTask,
        'STARTED',
        taskIndent,
        kwManager,
      );
      return startedIdx >= 0 ? startedIdx + 1 : afterDesc;
    }
    if (dateType === 'DEADLINE') {
      // Insert after SCHEDULED (if exists), else after STARTED (if exists),
      // else after DESCRIPTION. Checking STARTED keeps STARTED above DEADLINE.
      const scheduledIdx = findDateLine(
        lines,
        afterTask,
        'SCHEDULED',
        taskIndent,
        kwManager,
      );
      if (scheduledIdx >= 0) return scheduledIdx + 1;
      const startedIdx = findDateLine(
        lines,
        afterTask,
        'STARTED',
        taskIndent,
        kwManager,
      );
      return startedIdx >= 0 ? startedIdx + 1 : afterDesc;
    }
    // CLOSED - insert after DEADLINE, SCHEDULED, or STARTED (whichever is last)
    const deadlineIdx = findDateLine(
      lines,
      afterTask,
      'DEADLINE',
      taskIndent,
      kwManager,
    );
    if (deadlineIdx >= 0) return deadlineIdx + 1;
    const scheduledIdx = findDateLine(
      lines,
      afterTask,
      'SCHEDULED',
      taskIndent,
      kwManager,
    );
    if (scheduledIdx >= 0) return scheduledIdx + 1;
    // No SCHEDULED/DEADLINE: place CLOSED after STARTED (if present) so a
    // CLOSED line is never positioned before a STARTED line.
    const startedIdx = findDateLine(
      lines,
      afterTask,
      'STARTED',
      taskIndent,
      kwManager,
    );
    if (startedIdx >= 0) return startedIdx + 1;
    return afterDesc;
  }

  /**
   * Update an existing date line or insert a new one.
   * Returns the resulting lines and the line delta.
   */
  private updateOrInsertDateLine(
    lines: string[],
    taskLineIndex: number,
    dateType: DateLineType,
    dateStr: string,
    task: Task,
  ): { lines: string[]; lineDelta: number } {
    const kwManager = this.keywordManager;
    const taskIndent = getTaskIndent(task);
    const anchor = this.blockAnchorOf(lines, task);

    if (task.sourceFormat === 'org') {
      const token = findOrgPlanningToken(lines, taskLineIndex + 1, dateType);
      if (token) {
        const replacement = dateStr === null ? null : `${dateType}: ${dateStr}`;
        const next = replaceOrgPlanningToken(
          lines[token.lineIndex],
          token,
          replacement,
        );
        if (next === null) {
          lines.splice(token.lineIndex, 1);
          this.relocateBlockAnchor(lines, taskLineIndex, taskIndent, anchor);
          return { lines, lineDelta: -1 };
        }
        lines[token.lineIndex] = next;
        this.relocateBlockAnchor(lines, taskLineIndex, taskIndent, anchor);
        return { lines, lineDelta: 0 };
      }
      if (dateStr === null) return { lines, lineDelta: 0 };
    }

    const existingIdx = findDateLine(
      lines,
      taskLineIndex + 1,
      dateType,
      taskIndent,
      kwManager,
    );

    if (existingIdx >= 0) {
      const indent = this.getEffectiveDateLineIndent(lines, existingIdx, task);
      lines[existingIdx] = `${indent}${dateType}: ${dateStr}`;
      this.relocateBlockAnchor(lines, taskLineIndex, taskIndent, anchor);
      return { lines, lineDelta: 0 };
    }

    const insertIdx = this.calcDateLineInsertIndex(
      lines,
      taskLineIndex,
      dateType,
      taskIndent,
    );
    const indent = this.getEffectiveDateLineIndent(lines, -1, task);
    lines.splice(insertIdx, 0, `${indent}${dateType}: ${dateStr}`);
    this.relocateBlockAnchor(lines, taskLineIndex, taskIndent, anchor);
    return { lines, lineDelta: 1 };
  }

  /**
   * Remove a date line.
   * Returns the resulting lines and the line delta.
   */
  private removeDateLine(
    lines: string[],
    taskLineIndex: number,
    dateType: DateLineType,
    task: Task,
  ): { lines: string[]; lineDelta: number } {
    const kwManager = this.keywordManager;
    const taskIndent = getTaskIndent(task);
    const anchor = this.blockAnchorOf(lines, task);

    if (task.sourceFormat === 'org') {
      const token = findOrgPlanningToken(lines, taskLineIndex + 1, dateType);
      if (!token) return { lines, lineDelta: 0 };
      const next = replaceOrgPlanningToken(lines[token.lineIndex], token, null);
      if (next === null) {
        lines.splice(token.lineIndex, 1);
        this.relocateBlockAnchor(lines, taskLineIndex, taskIndent, anchor);
        return { lines, lineDelta: -1 };
      }
      lines[token.lineIndex] = next;
      return { lines, lineDelta: 0 };
    }

    const existingIdx = findDateLine(
      lines,
      taskLineIndex + 1,
      dateType,
      taskIndent,
      kwManager,
    );

    if (existingIdx >= 0) {
      lines.splice(existingIdx, 1);
      this.relocateBlockAnchor(lines, taskLineIndex, taskIndent, anchor);
      return { lines, lineDelta: -1 };
    }

    return { lines, lineDelta: 0 };
  }
}
