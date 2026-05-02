import { App, Notice, TFile, MarkdownView, Editor } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { Task } from '../../types/task';
import TodoTracker from '../../main';
import {
  buildRemovalRange,
  findSubtaskEnd,
  modifyLinesForMigration,
  readTaskBlockFromVault,
  taskHasCheckbox,
} from '../../utils/task-sub-bullets';
import { isPhoneDevice } from '../../utils/mobile-utils';

export interface TaskDragDropCallbacks {
  onGetTask: (path: string, line: number) => Task | undefined;
}

export function getDropAction(
  ctrlKey: boolean,
  metaKey: boolean,
  altKey: boolean,
): 'copy' | 'move' | 'migrate' {
  if (altKey && ctrlKey) return 'migrate';
  if (altKey) return 'move';
  return 'copy';
}

export function getDropEffect(
  action: 'copy' | 'move' | 'migrate',
): 'copy' | 'move' | 'link' {
  if (action === 'migrate') return 'link';
  if (action === 'move') return 'move';
  return 'copy';
}

export class TaskDragDropHandler {
  private app: App;
  private plugin: TodoTracker;
  private containerEl: HTMLElement;
  private callbacks: TaskDragDropCallbacks | null = null;
  private editorDropRef: ReturnType<App['workspace']['on']> | null = null;
  private dragoverHandler: ((evt: DragEvent) => void) | null = null;
  private draggedTask: Task | null = null;
  private currentAction: 'copy' | 'move' | 'migrate' = 'copy';
  private dragImageEl: HTMLElement | null = null;
  private modifierKeys: { ctrl: boolean; meta: boolean; alt: boolean } = {
    ctrl: false,
    meta: false,
    alt: false,
  };
  private keydownHandler: ((evt: KeyboardEvent) => void) | null = null;
  private keyupHandler: ((evt: KeyboardEvent) => void) | null = null;

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
    this.currentAction = 'copy';

    this.modifierKeys.ctrl = evt.ctrlKey;
    this.modifierKeys.meta = evt.metaKey;
    this.modifierKeys.alt = evt.altKey;

    if (evt.dataTransfer) {
      evt.dataTransfer.setData('text/plain', task.state + ' ' + task.text);
      evt.dataTransfer.effectAllowed = 'all';
      // eslint-disable-next-line no-undef
      const img = new Image();
      img.src =
        'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
      evt.dataTransfer.setDragImage(img, 0, 0);
    }

    this.dragImageEl = this.createDragOverlay(
      task,
      'copy',
      evt.clientX,
      evt.clientY,
    );

    target.addClass('todoseq-task-dragging');

    this.dragoverHandler = this.onDragOver;
    window.addEventListener('dragover', this.dragoverHandler, true);
  };

  private onDragEnd = (evt: DragEvent): void => {
    const target = (evt.target as HTMLElement)?.closest?.('.todoseq-task-item');
    if (target instanceof HTMLElement) {
      target.removeClass('todoseq-task-dragging');
    }
    this.removeDragoverListener();
    this.removeDragOverlay();
    this.draggedTask = null;
    this.currentAction = 'copy';
  };

  private onDragOver = (evt: DragEvent): void => {
    if (!this.draggedTask) return;
    this.modifierKeys.ctrl = evt.ctrlKey;
    this.modifierKeys.meta = evt.metaKey;
    this.modifierKeys.alt = evt.altKey;
    const action = getDropAction(
      this.modifierKeys.ctrl || evt.ctrlKey,
      this.modifierKeys.meta || evt.metaKey,
      this.modifierKeys.alt || evt.altKey,
    );
    const overTarget = this.isOverValidDropTarget(evt);
    if (this.dragImageEl) {
      this.dragImageEl.style.left = evt.clientX + 12 + 'px';
      this.dragImageEl.style.top = evt.clientY + 12 + 'px';
      this.dragImageEl.toggleClass(
        'todoseq-drag-overlay-over-target',
        overTarget,
      );
    }
    if (action !== this.currentAction) {
      this.currentAction = action;
      if (this.dragImageEl) {
        this.updateOverlayAction(this.dragImageEl, action);
      }
    }
  };

  private removeDragoverListener(): void {
    if (this.dragoverHandler) {
      window.removeEventListener('dragover', this.dragoverHandler, true);
      this.dragoverHandler = null;
    }
  }

  private isOverValidDropTarget(evt: DragEvent): boolean {
    const target = evt.target;
    if (!(target instanceof HTMLElement)) return false;
    return !!target.closest('.markdown-source-view');
  }

  private createDragOverlay(
    task: Task,
    action: 'copy' | 'move' | 'migrate',
    x: number,
    y: number,
  ): HTMLElement {
    const el = document.createElement('div');
    el.className = 'todoseq-drag-overlay';
    el.style.left = x + 12 + 'px';
    el.style.top = y + 12 + 'px';

    const taskLine = document.createElement('div');
    taskLine.className = 'todoseq-drag-overlay-task';
    taskLine.textContent = task.state + ' ' + task.text;
    el.appendChild(taskLine);

    const actionLine = document.createElement('div');
    actionLine.className = 'todoseq-drag-overlay-action';
    this.setActionText(actionLine, action);
    el.appendChild(actionLine);

    document.body.appendChild(el);
    return el;
  }

  private setActionText(
    el: HTMLElement,
    action: 'copy' | 'move' | 'migrate',
  ): void {
    const labels: Record<string, string> = {
      copy: 'Copy task here',
      move: 'Move task here',
      migrate: 'Migrate task here',
    };
    el.textContent = labels[action];
  }

  private updateOverlayAction(
    el: HTMLElement,
    action: 'copy' | 'move' | 'migrate',
  ): void {
    const actionLine = el.querySelector('.todoseq-drag-overlay-action');
    if (actionLine) {
      this.setActionText(actionLine as HTMLElement, action);
    }
  }

  private removeDragOverlay(): void {
    if (this.dragImageEl) {
      this.dragImageEl.remove();
      this.dragImageEl = null;
    }
  }

  private onKeyDown = (evt: KeyboardEvent): void => {
    this.modifierKeys.ctrl = evt.ctrlKey;
    this.modifierKeys.meta = evt.metaKey;
    this.modifierKeys.alt = evt.altKey;
  };

  private onKeyUp = (evt: KeyboardEvent): void => {
    this.modifierKeys.ctrl = evt.ctrlKey;
    this.modifierKeys.meta = evt.metaKey;
    this.modifierKeys.alt = evt.altKey;
  };

  private removeKeyListeners(): void {
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler, true);
      this.keydownHandler = null;
    }
    if (this.keyupHandler) {
      document.removeEventListener('keyup', this.keyupHandler, true);
      this.keyupHandler = null;
    }
  }

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

    const action = getDropAction(
      this.modifierKeys.ctrl || evt.ctrlKey,
      this.modifierKeys.meta || evt.metaKey,
      this.modifierKeys.alt || evt.altKey,
    );

    if (action === 'migrate' && !this.plugin.settings.migrateToTodayState) {
      new Notice(
        'Migration is disabled. Configure the migrated state keyword in TODOseq settings.',
      );
      return;
    }

    const mdView =
      view instanceof MarkdownView
        ? view
        : this.app.workspace.getActiveViewOfType(MarkdownView);

    const isSourceMode = mdView?.getMode() === 'source';

    const dropPos =
      mdView && isSourceMode ? this.getDropPosition(mdView, evt) : undefined;

    void this.executeDrop(
      task,
      editor,
      targetFile,
      isSourceMode,
      action,
      dropPos,
    );
    this.showActionNotice(action);
  };

  private async executeDrop(
    task: Task,
    editor: Editor,
    targetFile: TFile,
    isSourceMode: boolean | undefined,
    action: 'copy' | 'move' | 'migrate',
    dropPos?: { line: number; ch: number } | null,
  ): Promise<void> {
    const allLines = await readTaskBlockFromVault(this.app, task);

    if (isSourceMode) {
      this.insertAtPosition(editor, allLines, dropPos);
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

    if (isPhoneDevice()) {
      return;
    }

    this.containerEl.addEventListener('dragstart', this.onDragStart);
    this.containerEl.addEventListener('dragend', this.onDragEnd);

    this.keydownHandler = this.onKeyDown;
    this.keyupHandler = this.onKeyUp;
    document.addEventListener('keydown', this.keydownHandler, true);
    document.addEventListener('keyup', this.keyupHandler, true);

    this.editorDropRef = this.app.workspace.on(
      'editor-drop',
      this.onEditorDrop,
    );
  }

  destroy(): void {
    this.containerEl.removeEventListener('dragstart', this.onDragStart);
    this.containerEl.removeEventListener('dragend', this.onDragEnd);
    this.removeDragoverListener();
    this.removeKeyListeners();

    if (this.editorDropRef) {
      this.app.workspace.offref(this.editorDropRef);
      this.editorDropRef = null;
    }

    this.modifierKeys = { ctrl: false, meta: false, alt: false };
    this.removeDragOverlay();
    this.draggedTask = null;
    this.currentAction = 'copy';
    this.callbacks = null;
  }

  private getDropPosition(
    view: MarkdownView,
    evt: DragEvent,
  ): { line: number; ch: number } | null {
    const editorView = (view.editor as { cm?: EditorView })?.cm;
    if (!editorView) return null;
    const pos = editorView.posAtCoords(
      { x: evt.clientX, y: evt.clientY },
      false,
    );
    if (pos == null) return null;
    const line = editorView.state.doc.lineAt(pos);
    return { line: line.number - 1, ch: line.length };
  }

  private insertAtPosition(
    editor: Editor,
    lines: string[],
    pos?: { line: number; ch: number } | null,
  ): void {
    const cursor = pos ?? editor.getCursor();
    const currentLine = editor.getLine(cursor.line);
    const insertPos = { line: cursor.line, ch: currentLine.length };
    const prefix = currentLine === '' ? '' : '\n';
    editor.replaceRange(prefix + lines.join('\n'), insertPos);
  }

  private async insertAtEnd(file: TFile, lines: string[]): Promise<void> {
    const content = await this.app.vault.read(file);
    const newContent = content.trimEnd() + '\n\n' + lines.join('\n') + '\n';
    await this.app.vault.modify(file, newContent);
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
