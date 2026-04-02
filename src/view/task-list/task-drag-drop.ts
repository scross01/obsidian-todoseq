import { App, Notice, TFile, MarkdownView, Editor } from 'obsidian';
import { Task } from '../../types/task';
import TodoTracker from '../../main';
import { formatTaskForDailyNote } from '../../utils/daily-note-utils';
import { CHECKBOX_DETECTION_REGEX } from '../../utils/patterns';

export interface TaskDragDropCallbacks {
  onGetTask: (path: string, line: number) => Task | undefined;
}

export function getDropAction(
  ctrlKey: boolean,
  metaKey: boolean,
  shiftKey: boolean,
): 'copy' | 'move' | 'migrate' {
  if (ctrlKey || metaKey) return 'move';
  if (shiftKey) return 'migrate';
  return 'copy';
}

export function buildRemovalRange(
  lines: string[],
  taskLine: number,
): { start: number; end: number } {
  let end = taskLine;
  for (let i = taskLine + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('SCHEDULED:') || trimmed.startsWith('DEADLINE:')) {
      end = i;
    } else {
      break;
    }
  }
  return { start: taskLine, end };
}

export function findSubtaskEnd(
  lines: string[],
  afterLine: number,
  taskIndent: string,
  parentHasCheckbox: boolean,
): number {
  const parentIndentLen = taskIndent.length;
  let end = afterLine;
  for (let i = afterLine + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') break;
    const lineIndentLen = line.length - line.trimStart().length;
    if (lineIndentLen > parentIndentLen) {
      end = i;
    } else if (
      lineIndentLen === parentIndentLen &&
      !parentHasCheckbox &&
      CHECKBOX_DETECTION_REGEX.test(line)
    ) {
      end = i;
    } else {
      break;
    }
  }
  return end;
}

export function extractSubtaskLines(
  lines: string[],
  dateEnd: number,
  taskIndent: string,
  parentHasCheckbox: boolean,
): string[] {
  const subtaskEnd = findSubtaskEnd(
    lines,
    dateEnd,
    taskIndent,
    parentHasCheckbox,
  );
  if (subtaskEnd <= dateEnd) return [];

  const parentIndentLen = taskIndent.length;
  const result: string[] = [];
  for (let i = dateEnd + 1; i <= subtaskEnd; i++) {
    result.push(lines[i].substring(parentIndentLen));
  }
  return result;
}

export function modifyLinesForMigration(
  lines: string[],
  taskLine: number,
  oldKeyword: string,
  migrateState: string,
): string[] {
  const result = [...lines];
  const taskLineContent = result[taskLine];
  if (!taskLineContent) return result;

  const escaped = oldKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (migrateState === '') {
    result[taskLine] = taskLineContent.replace(
      new RegExp(`^(.*?)\\b${escaped}\\b\\s*`, 'i'),
      '$1',
    );
  } else {
    result[taskLine] = taskLineContent.replace(
      new RegExp(`\\b${escaped}\\b`, 'i'),
      migrateState,
    );
  }

  const { end } = buildRemovalRange(result, taskLine);
  if (end > taskLine) {
    result.splice(taskLine + 1, end - taskLine);
  }

  return result;
}

function taskHasCheckbox(task: Task): boolean {
  return CHECKBOX_DETECTION_REGEX.test(task.rawText);
}

export class TaskDragDropHandler {
  private app: App;
  private plugin: TodoTracker;
  private containerEl: HTMLElement;
  private callbacks: TaskDragDropCallbacks | null = null;
  private editorDropRef: ReturnType<App['workspace']['on']> | null = null;
  private draggedTask: Task | null = null;

  constructor(app: App, plugin: TodoTracker, containerEl: HTMLElement) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = containerEl;
  }

  private onDragStart = (evt: DragEvent): void => {
    const target = (evt.target as HTMLElement)?.closest?.('.todoseq-task-item');
    if (!target || !(target instanceof HTMLElement)) return;

    const path = target.getAttribute('data-path');
    const lineStr = target.getAttribute('data-line');
    if (!path || lineStr === null) return;

    const line = parseInt(lineStr, 10);
    if (isNaN(line)) return;

    const task = this.callbacks?.onGetTask(path, line);
    if (!task) return;

    this.draggedTask = task;

    if (evt.dataTransfer) {
      evt.dataTransfer.setData('text/plain', task.state + ' ' + task.text);
      evt.dataTransfer.effectAllowed = 'copyMove';
    }

    target.addClass('todoseq-task-dragging');
  };

  private onDragEnd = (evt: DragEvent): void => {
    const target = (evt.target as HTMLElement)?.closest?.('.todoseq-task-item');
    if (target instanceof HTMLElement) {
      target.removeClass('todoseq-task-dragging');
    }
    this.draggedTask = null;
  };

  private onEditorDrop = (
    evt: DragEvent,
    editor: Editor,
    view: MarkdownView | { file: TFile | null },
  ): void => {
    const task = this.draggedTask;
    if (!task) return;

    const targetFile = view.file;
    if (!targetFile) return;

    if (task.path === targetFile.path) {
      new Notice('Task is already in this file');
      return;
    }

    const action = getDropAction(evt.ctrlKey, evt.metaKey, evt.shiftKey);

    if (action === 'migrate' && !this.plugin.settings.migrateToTodayState) {
      new Notice(
        'Migration is disabled. Configure the migrated state keyword in TODOseq settings.',
      );
      return;
    }

    evt.preventDefault();

    const mdView =
      view instanceof MarkdownView
        ? view
        : this.app.workspace.getActiveViewOfType(MarkdownView);

    const isSourceMode = mdView?.getMode() === 'source';

    void this.executeDrop(task, editor, targetFile, isSourceMode, action);
    this.showActionNotice(action);
  };

  private async executeDrop(
    task: Task,
    editor: Editor,
    targetFile: TFile,
    isSourceMode: boolean | undefined,
    action: 'copy' | 'move' | 'migrate',
  ): Promise<void> {
    const taskLines = formatTaskForDailyNote(task);
    const subtaskLines = await this.readSubtaskLines(task);
    const allLines = [...taskLines, ...subtaskLines];

    if (isSourceMode) {
      this.insertAtCursor(editor, allLines);
    } else {
      await this.insertAtEnd(targetFile, allLines);
    }

    await this.handleSourceModification(task, action);
  }

  private showActionNotice(action: 'copy' | 'move' | 'migrate'): void {
    const messages: Record<string, string> = {
      copy: 'Task copied',
      move: 'Task moved',
      migrate: 'Task migrated',
    };
    new Notice(messages[action]);
  }

  initialize(callbacks: TaskDragDropCallbacks): void {
    this.callbacks = callbacks;

    this.containerEl.addEventListener('dragstart', this.onDragStart);
    this.containerEl.addEventListener('dragend', this.onDragEnd);

    this.editorDropRef = this.app.workspace.on(
      'editor-drop',
      this.onEditorDrop,
    );
  }

  destroy(): void {
    this.containerEl.removeEventListener('dragstart', this.onDragStart);
    this.containerEl.removeEventListener('dragend', this.onDragEnd);

    if (this.editorDropRef) {
      this.app.workspace.offref(this.editorDropRef);
      this.editorDropRef = null;
    }

    this.draggedTask = null;
    this.callbacks = null;
  }

  private insertAtCursor(editor: Editor, lines: string[]): void {
    const cursor = editor.getCursor();
    const currentLine = editor.getLine(cursor.line);
    const pos = { line: cursor.line, ch: currentLine.length };
    const prefix = currentLine === '' ? '' : '\n';
    editor.replaceRange(prefix + lines.join('\n'), pos);
  }

  private async insertAtEnd(file: TFile, lines: string[]): Promise<void> {
    const content = await this.app.vault.read(file);
    const newContent = content.trimEnd() + '\n\n' + lines.join('\n') + '\n';
    await this.app.vault.modify(file, newContent);
  }

  private async readSubtaskLines(task: Task): Promise<string[]> {
    try {
      const sourceFile = this.app.vault.getAbstractFileByPath(task.path);
      if (!(sourceFile instanceof TFile)) return [];

      const sourceContent = await this.app.vault.read(sourceFile);
      const sourceLines = sourceContent.split('\n');

      const { end: dateEnd } = buildRemovalRange(sourceLines, task.line);
      return extractSubtaskLines(
        sourceLines,
        dateEnd,
        task.indent,
        taskHasCheckbox(task),
      );
    } catch {
      return [];
    }
  }

  private async handleSourceModification(
    task: Task,
    action: 'copy' | 'move' | 'migrate',
  ): Promise<void> {
    if (action === 'copy') return;

    try {
      const sourceFile = this.app.vault.getAbstractFileByPath(task.path);
      if (!(sourceFile instanceof TFile)) return;

      const sourceContent = await this.app.vault.read(sourceFile);
      const sourceLines = sourceContent.split('\n');

      if (action === 'move') {
        const { start, end: dateEnd } = buildRemovalRange(
          sourceLines,
          task.line,
        );
        const subtaskEnd = findSubtaskEnd(
          sourceLines,
          dateEnd,
          task.indent,
          taskHasCheckbox(task),
        );
        const newLines = [
          ...sourceLines.slice(0, start),
          ...sourceLines.slice(subtaskEnd + 1),
        ];
        await this.app.vault.modify(sourceFile, newLines.join('\n'));
      } else if (action === 'migrate') {
        const migrateState = this.plugin.settings.migrateToTodayState;
        const taskKeyword = task.state || 'TODO';
        const modified = modifyLinesForMigration(
          sourceLines,
          task.line,
          taskKeyword,
          migrateState,
        );
        await this.app.vault.modify(sourceFile, modified.join('\n'));
      }
    } catch (error) {
      console.error('[TODOseq] Failed to modify source task:', error);
      new Notice('Failed to update source task');
    }
  }
}
