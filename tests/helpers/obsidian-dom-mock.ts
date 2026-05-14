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
    appendText: (text: string) => void;
    setAttr: (key: string, value: string) => void;
    createEl: <K extends keyof HTMLElementTagNameMap>(
      tag: K,
      options?: {
        cls?: string | string[];
        attr?: Record<string, string>;
        text?: string;
        type?: string;
        value?: string;
        placeholder?: string;
        href?: string;
        [key: string]: unknown;
      },
    ) => HTMLElementTagNameMap[K];
    createDiv: (options?: {
      cls?: string;
      attr?: Record<string, string>;
    }) => HTMLDivElement;
    createSpan: (options?: { cls?: string; text?: string }) => HTMLSpanElement;
    empty: () => void;
  }

  // Global Obsidian helper functions
  function createEl<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options?: {
      cls?: string | string[];
      attr?: Record<string, string>;
      text?: string;
      type?: string;
      value?: string;
      placeholder?: string;
      href?: string;
      [key: string]: unknown;
    },
  ): HTMLElementTagNameMap[K];

  // activeDocument is defined by Obsidian for popout window compatibility
  const activeDocument: Document;
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

  HTMLElement.prototype.toggleClass = function (
    cls: string,
    force?: boolean,
  ): boolean {
    if (force === undefined) {
      this.classList.toggle(cls);
      return this.classList.contains(cls);
    }
    this.classList.toggle(cls, force);
    return force;
  };

  HTMLElement.prototype.hasClass = function (cls: string): boolean {
    return this.classList.contains(cls);
  };

  HTMLElement.prototype.setText = function (text: string): void {
    this.textContent = text;
  };

  HTMLElement.prototype.appendText = function (text: string): void {
    this.appendChild(activeDocument.createTextNode(text));
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
      type?: string;
      value?: string;
      placeholder?: string;
      href?: string;
      [key: string]: unknown;
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
    // Handle common HTML element properties directly
    if (options?.type && 'type' in el) {
      (el as HTMLInputElement).type = options.type;
    }
    if (options?.value && 'value' in el) {
      (el as HTMLInputElement).value = options.value;
    }
    if (options?.placeholder && 'placeholder' in el) {
      (el as HTMLInputElement).placeholder = options.placeholder;
    }
    if (options?.href && 'href' in el) {
      (el as HTMLAnchorElement).href = options.href;
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

  HTMLElement.prototype.empty = function (): void {
    while (this.firstChild) {
      this.removeChild(this.firstChild);
    }
  };

  // Obsidian adds instanceOf to Element prototype for type checking
  Element.prototype.instanceOf = function <T>(
    clazz: new (...args: unknown[]) => T,
  ): boolean {
    return this instanceof clazz;
  };

  // Global Obsidian createEl helper
  const globalCreateEl = function <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options?: {
      cls?: string | string[];
      attr?: Record<string, string>;
      text?: string;
      type?: string;
      value?: string;
      placeholder?: string;
      href?: string;
      [key: string]: unknown;
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
    if (options?.type && 'type' in el) {
      (el as HTMLInputElement).type = options.type;
    }
    if (options?.value && 'value' in el) {
      (el as HTMLInputElement).value = options.value;
    }
    if (options?.placeholder && 'placeholder' in el) {
      (el as HTMLInputElement).placeholder = options.placeholder;
    }
    if (options?.href && 'href' in el) {
      (el as HTMLAnchorElement).href = options.href;
    }
    if (options?.text) el.textContent = options.text;
    activeDocument.body.appendChild(el);
    return el;
  };
  (globalThis as any).createEl = globalCreateEl;
  (window as any).createEl = globalCreateEl;
}
