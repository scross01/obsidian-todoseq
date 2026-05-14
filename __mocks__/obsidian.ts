// Mock for obsidian module
export class TFile {
  path: string;
  name: string;
  extension: string;

  constructor(path: string, name: string, extension = '') {
    this.path = path;
    this.name = name;
    this.extension = extension;
  }
}

export class App {
  vault: Vault;

  constructor() {
    this.vault = new Vault();
  }
}

export class Vault {
  getAbstractFileByPath(path: string): TFile | null {
    return null;
  }

  async read(file: TFile): Promise<string> {
    return '';
  }

  async modify(_file: TFile, _data: string): Promise<void> {
    // no-op in tests
  }

  getMarkdownFiles(): TFile[] {
    return [];
  }

  getConfig(key: string): unknown {
    return null;
  }
}

// Export other commonly used types
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
}

export class Plugin {
  app: App;
  manifest: PluginManifest;

  constructor(app: App, manifest: PluginManifest) {
    this.app = app;
    this.manifest = manifest;
  }

  async onload(): Promise<void> {}
  onunload(): void {}
}

export class PluginSettingTab {
  app: App;
  containerEl: HTMLElement;
  plugin: Plugin;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = activeDocument.createElement('div');
  }

  display(): void {}
}

export class ItemView {
  getViewType(): string {
    return 'item-view';
  }
}

export class WorkspaceLeaf {
  view: ItemView;
  constructor() {
    this.view = new ItemView();
  }
}

export class MarkdownView extends ItemView {
  file: TFile | null = null;
  getMode(): string {
    return 'source';
  }
  editor: { cm?: unknown } = {};
}

export class Editor {
  getCursor(): { line: number; ch: number } {
    return { line: 0, ch: 0 };
  }
  getLine(_line: number): string {
    return '';
  }
  replaceRange(_text: string, _from: unknown, _to?: unknown): void {}
}

export class Workspace {
  on(_name: string, _callback: (...args: unknown[]) => unknown): string {
    return 'mock-ref';
  }
  offref(_ref: string): void {}
  getActiveViewOfType<T>(_type: new (...args: unknown[]) => T): T | null {
    return null;
  }
}

export const Platform = { isMobile: false };

export class Notice {
  constructor(message: string, timeout?: number) {
    const instances = (Notice as any).instances as
      | Array<{ message: string; timeout?: number }>
      | undefined;
    if (instances) {
      instances.push({ message, timeout });
    }
  }
}

export function setIcon(_el: HTMLElement, _iconId: string): void {
  // no-op in tests
}

export function requireApiVersion(version: string): boolean {
  return true;
}

export function normalizePath(path: string): string {
  return path;
}
