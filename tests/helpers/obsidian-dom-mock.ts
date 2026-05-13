/**
 * Shared Obsidian DOM mocks for jsdom test environments.
 * Centralizes HTMLElement prototype extensions that Obsidian provides.
 * Import and call `installObsidianDomMocks()` in your jsdom test file's beforeAll.
 */

declare global {
  interface Element {
    instanceOf: <T>(clazz: new (...args: unknown[]) => T) => boolean;
  }

  interface HTMLElement {
    addClass: (cls: string) => void;
    removeClass: (cls: string) => void;
    hasClass: (cls: string) => boolean;
    setText: (text: string) => void;
    setAttr: (key: string, value: string) => void;
    createEl: <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      options?: {
        cls?: string | string[];
        attr?: Record<string, string>;
        text?: string;
      },
    ) => HTMLElementTagNameMap[K];
    createDiv: (options?: {
      cls?: string;
      attr?: Record<string, string>;
    }) => HTMLDivElement;
    createSpan: (options?: { cls?: string; text?: string }) => HTMLSpanElement;
  }
}

export function installObsidianDomMocks(): void {
  // Set up activeDocument on both window and globalThis
  (window as any).activeDocument = document;
  (globalThis as any).activeDocument = document;

  HTMLElement.prototype.addClass = function (cls: string): void {
    this.classList.add(cls);
  };

  HTMLElement.prototype.removeClass = function (cls: string): void {
    this.classList.remove(cls);
  };

  HTMLElement.prototype.hasClass = function (cls: string): boolean {
    return this.classList.contains(cls);
  };

  HTMLElement.prototype.setText = function (text: string): void {
    this.textContent = text;
  };

  HTMLElement.prototype.setAttr = function (key: string, value: string): void {
    this.setAttribute(key, value);
  };

  HTMLElement.prototype.createEl = function <
    K extends keyof HTMLElementTagNameMap,
  >(
    tag: K,
    options?: {
      cls?: string | string[];
      attr?: Record<string, string>;
      text?: string;
    },
  ): HTMLElementTagNameMap[K] {
    const el = activeDocument.createElement(tag);
    if (options?.cls) {
      if (Array.isArray(options.cls)) {
        for (const c of options.cls) {
          if (c) el.classList.add(c);
        }
      } else {
        el.className = options.cls;
      }
    }
    if (options?.attr) {
      for (const [key, value] of Object.entries(options.attr)) {
        el.setAttribute(key, value);
      }
    }
    if (options?.text) el.textContent = options.text;
    this.appendChild(el);
    return el;
  };

  HTMLElement.prototype.createDiv = function (options?: {
    cls?: string;
    attr?: Record<string, string>;
  }): HTMLDivElement {
    return this.createEl('div', options);
  };

  HTMLElement.prototype.createSpan = function (options?: {
    cls?: string;
    text?: string;
  }): HTMLSpanElement {
    return this.createEl('span', options);
  };

  // Obsidian adds instanceOf to Element prototype for type checking
  Element.prototype.instanceOf = function <T>(
    clazz: new (...args: unknown[]) => T,
  ): boolean {
    return this instanceof clazz;
  };
}
