import { App, Notice, TFile, MarkdownView, Editor } from 'obsidian';
import { Task } from '../../types/task';
import TodoTracker from '../../main';

export interface TaskDragDropCallbacks {
  onGetTask: (path: string, line: number) => Task | undefined;
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

    evt.preventDefault();

    const isMove = evt.ctrlKey || evt.metaKey;
    const isMigrate = evt.shiftKey;

    const mdView =
      view instanceof MarkdownView
        ? view
        : this.app.workspace.getActiveViewOfType(MarkdownView);

    const isSourceMode = mdView?.getMode() === 'source';

    if (isSourceMode) {
      const lines = this.formatTaskForInsertion(task);
      this.insertAtCursor(editor, lines);
    } else {
      const lines = this.formatTaskForInsertion(task);
      void this.insertAtEnd(targetFile, lines).then(() => {
        this.handleSourceModification(task, isMove, isMigrate);
        this.showActionNotice(isMove, isMigrate);
      });
      return;
    }

    void this.handleSourceModification(task, isMove, isMigrate);
    this.showActionNotice(isMove, isMigrate);
  };

  private showActionNotice(isMove: boolean, isMigrate: boolean): void {
    if (isMove) {
      new Notice('Task moved');
    } else if (isMigrate) {
      new Notice('Task migrated');
    } else {
      new Notice('Task copied');
    }
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

  private formatTaskForInsertion(task: Task): string[] {
    const lines: string[] = [];

    let taskLine = task.listMarker + task.state;
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

    if (task.scheduledDate) {
      lines.push(`SCHEDULED: ${this.formatDate(task.scheduledDate)}`);
    }

    if (task.deadlineDate) {
      lines.push(`DEADLINE: ${this.formatDate(task.deadlineDate)}`);
    }

    return lines;
  }

  private insertAtCursor(editor: Editor, lines: string[]): void {
    const cursor = editor.getCursor();
    const currentLine = editor.getLine(cursor.line);
    const pos = { line: cursor.line, ch: currentLine.length };
    editor.replaceRange('\n' + lines.join('\n'), pos);
  }

  private async insertAtEnd(file: TFile, lines: string[]): Promise<void> {
    const content = await this.app.vault.read(file);
    const newContent = content.trimEnd() + '\n\n' + lines.join('\n') + '\n';
    await this.app.vault.modify(file, newContent);
  }

  private handleSourceModification(
    task: Task,
    isMove: boolean,
    isMigrate: boolean,
  ): void {
    if (isMove) {
      void this.removeSourceTask(task);
    } else if (isMigrate) {
      void this.migrateSourceTask(task);
    }
  }

  private async removeSourceTask(task: Task): Promise<void> {
    const sourceFile = this.app.vault.getAbstractFileByPath(task.path);
    if (!(sourceFile instanceof TFile)) return;

    const sourceContent = await this.app.vault.read(sourceFile);
    const sourceLines = sourceContent.split('\n');

    const startLine = task.line;
    let endLine = startLine;

    for (let i = startLine + 1; i < sourceLines.length; i++) {
      const nextLine = sourceLines[i].trim();
      if (
        nextLine.startsWith('SCHEDULED:') ||
        nextLine.startsWith('DEADLINE:')
      ) {
        endLine = i;
      } else {
        break;
      }
    }

    const newLines = [
      ...sourceLines.slice(0, startLine),
      ...sourceLines.slice(endLine + 1),
    ];

    await this.app.vault.modify(sourceFile, newLines.join('\n'));
  }

  private async migrateSourceTask(task: Task): Promise<void> {
    const migrateState = this.plugin.settings.migrateToTodayState;
    if (!migrateState) return;

    const sourceFile = this.app.vault.getAbstractFileByPath(task.path);
    if (!(sourceFile instanceof TFile)) return;

    const sourceContent = await this.app.vault.read(sourceFile);
    const sourceLines = sourceContent.split('\n');

    const taskLineContent = sourceLines[task.line];
    if (!taskLineContent) return;

    const taskKeyword = task.state || 'TODO';
    const escapedKeyword = taskKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    let updatedLine: string;
    if (migrateState === '') {
      updatedLine = taskLineContent.replace(
        new RegExp(`^(\\s*)\\b${escapedKeyword}\\b\\s*`, 'i'),
        '$1',
      );
    } else {
      updatedLine = taskLineContent.replace(
        new RegExp(`\\b${escapedKeyword}\\b`, 'i'),
        migrateState,
      );
    }

    sourceLines[task.line] = updatedLine;
    await this.app.vault.modify(sourceFile, sourceLines.join('\n'));
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekday = weekdays[date.getDay()];
    return `<${year}-${month}-${day} ${weekday}>`;
  }
}
