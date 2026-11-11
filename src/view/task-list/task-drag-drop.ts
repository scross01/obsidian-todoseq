import {
  App,
  Notice,
  TFile,
  MarkdownView,
  Editor,
  Platform,
  EventRef,
} from 'obsidian';
import { EditorView } from '@codemirror/view';
import { Task } from '../../types/task';
import TodoTracker from '../../main';
import { TaskTransferStatus } from '../../services/task-writer';

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
  private editorDropRef: EventRef | null = null;
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
    if (!target || !target.instanceOf(HTMLElement)) return;

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
      this.dragImageEl.style.left = evt.clientX + 'px';
      this.dragImageEl.style.top = evt.clientY + 'px';
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
    const el = activeDocument.body.createDiv({
      cls: 'todoseq-drag-overlay',
    });
    el.style.left = x + 'px';
    el.style.top = y + 'px';

    el.createDiv({
      cls: 'todoseq-drag-overlay-task',
      text: task.state + ' ' + task.text,
    });

    const actionLine = el.createDiv({
      cls: 'todoseq-drag-overlay-action',
    });
    this.setActionText(actionLine, action);
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
      window.activeDocument.removeEventListener(
        'keydown',
        this.keydownHandler,
        true,
      );
      this.keydownHandler = null;
    }
    if (this.keyupHandler) {
      window.activeDocument.removeEventListener(
        'keyup',
        this.keyupHandler,
        true,
      );
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
        // workaround aggresive obsidianmd/ui/sentence-case -- "TODOseq" is a proper name in scentence.
        'Migration is disabled. Configure the migrated state keyword in ' +
          'TODOseq' +
          ' settings.',
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
      targetFile,
      action,
      isSourceMode ? dropPos : undefined,
    );
  };

  private async executeDrop(
    task: Task,
    targetFile: TFile,
    action: 'copy' | 'move' | 'migrate',
    dropPos?: { line: number; ch: number } | null,
  ): Promise<void> {
    const writer = this.plugin.taskEditor;
    if (!writer) {
      new Notice('Failed to write task');
      return;
    }
    const result = await writer.transferTask(
      task,
      targetFile,
      action,
      dropPos ? { insertAt: dropPos } : undefined,
    );
    if (result.status !== 'success') {
      new Notice(this.transferFailureNotice(result.status));
      return;
    }
    this.showActionNotice(action);
  }

  private transferFailureNotice(status: TaskTransferStatus): string {
    switch (status) {
      case 'already-there':
        return 'Task is already in this file';
      case 'stale-source':
        return 'Task has changed since it was dragged';
      case 'destination-failed':
        return 'Failed to write to the target file';
      case 'partial':
        return 'Task copied, but the original could not be updated';
      default:
        return 'Failed to transfer task';
    }
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

    if (Platform.isMobile) {
      return;
    }

    this.containerEl.addEventListener('dragstart', this.onDragStart);
    this.containerEl.addEventListener('dragend', this.onDragEnd);

    this.keydownHandler = this.onKeyDown;
    this.keyupHandler = this.onKeyUp;
    window.activeDocument.addEventListener(
      'keydown',
      this.keydownHandler,
      true,
    );
    window.activeDocument.addEventListener('keyup', this.keyupHandler, true);

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
}
