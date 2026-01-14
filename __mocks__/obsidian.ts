// Mock for obsidian module
export class TFile {
  path: string;
  name: string;

  constructor(path: string, name: string) {
    this.path = path;
    this.name = name;
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

  getMarkdownFiles(): TFile[] {
    return [];
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

export class MarkdownView {}

export function requireApiVersion(version: string): boolean {
  return true;
}

export function normalizePath(path: string): string {
  return path;
}
