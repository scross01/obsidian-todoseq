/**
 * Shared helpers for the docs screenshot scenarios (ODR demo scripts).
 *
 * Scenarios need no plugin-load bootstrap: ODR verifies the staged plugin
 * post-launch, sets the Obsidian 1.13+ `enable-plugin-<appId>` localStorage
 * gate, calls loadPlugin, and fails the run naming the plugin if it still did
 * not load. Nothing to set up here.
 *
 * ## Demo content rules
 *
 * These govern every seeded file and every future scenario:
 *
 * 1. **TODOseq syntax only.** Dates live on their own `SCHEDULED:` /
 *    `DEADLINE:` / `CLOSED:` / `STARTED:` line immediately below the task, and
 *    nowhere else. An inline `<2026-10-01>` in the task text is *Tasks* plugin
 *    syntax that TODOseq never parses — it renders as dead literal text that
 *    merely looks like a date, which is worse than no date at all because the
 *    screenshot appears to demonstrate something it does not. Same for
 *    completion emoji: state is carried by the keyword and the checkbox, not
 *    decoration. Priorities are `[#A]`/`[#B]`/`[#C]` after the keyword;
 *    checkboxes are `- [ ]` / `- [x]`.
 *
 * 2. **Keep each demo focused.** A screenshot should make its point in one
 *    glance, so a seed carries only the tasks the scene is actually about. A
 *    list padded with filler rows shrinks every row until the feature is
 *    unreadable and buries what the shot is for. Volume is the exception, not
 *    the default: reach for a long list only in search and filter scenarios,
 *    where having something to narrow is the entire point (see
 *    `seeds/search-filter.ts`).
 *
 * 3. **No H1 in the note body.** Obsidian already renders the file name at H1
 *    size, so an `# Title` line just repeats it — two titles stacked, one
 *    redundant, and it reads as a mistake rather than as documentation. Start
 *    with a line or two of intro content, then use `##` sub-headings to give
 *    the note structure.
 */

/** ODR script action shape (subset used here). */
export interface Action {
  type: string;
  [key: string]: unknown;
}

/**
 * Wait until the plugin object exists.
 *
 * A plain arrow *definition* — ODR normalizes definition-style `fn` strings
 * into an immediate invocation before handing them to Playwright, so the body
 * actually runs and the predicate is polled for real.
 */
export function waitForPlugin(): Action {
  return {
    type: 'wait-for',
    fn: `() => !!(window.app && app.plugins && app.plugins.plugins && app.plugins.plugins.todoseq)`,
    timeout: 15000,
  };
}

/**
 * Wait for the task list view to exist: the leaf content carries
 * data-type="todoseq-view" and the view body carries .todoseq-panel.
 */
export function waitForTaskListView(): Action {
  return {
    type: 'wait-for',
    fn: `() => !!document.querySelector('.workspace-leaf-content[data-type="todoseq-view"] .todoseq-panel')`,
    timeout: 10000,
  };
}

/**
 * Open the TODOseq settings dialog inside the recorder's page.
 *
 * Obsidian 1.13+ renders settings in a *separate Electron window*
 * (`app.setting.win`), but the recorder drives only `contexts[0].pages()[0]` and
 * has no page targeting — so a `wait-for .vertical-tab-nav-item` on the
 * recorder's page can never match. The window is same-origin reachable, so its
 * `.modal` node is adopted into our document and re-anchored into the viewport.
 * Obsidian's own stylesheet is loaded here too, so it renders identically.
 */
export function openSettingsDialog(tabId = 'todoseq'): Action {
  return {
    type: 'evaluate',
    fn: `() => {
      app.setting.open();
      app.setting.openTabById('${tabId}');
      const win = app.setting.win;
      const modal = win && win.document && win.document.querySelector('.modal');
      if (!modal) throw new Error('settings dialog: no .modal in the settings window');
      document.body.appendChild(modal);
      // The adopted node keeps absolute offsets from the other window's
      // viewport (it lands at y=640), so re-anchor it into ours.
      modal.style.position = 'fixed';
      modal.style.left = '50%';
      modal.style.top = '50%';
      modal.style.right = 'auto';
      modal.style.bottom = 'auto';
      modal.style.transform = 'translate(-50%, -50%)';
      modal.style.width = '920px';
      modal.style.height = '560px';
      modal.style.maxWidth = '920px';
      modal.style.maxHeight = '560px';
      return { adopted: true };
    }`,
  };
}

/** Wait for the adopted settings dialog to be laid out inside the viewport. */
export function waitForSettingsDialog(): Action {
  return {
    type: 'wait-for',
    fn: `() => {
      const modal = document.querySelector('.modal');
      if (!modal || !document.body.contains(modal)) return false;
      const r = modal.getBoundingClientRect();
      if (r.width < 100 || r.height < 100) return false;
      return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
    }`,
    timeout: 10000,
  };
}

/** Scroll the settings sidebar so the active (TODOseq) tab is in view. */
export function revealActiveSettingsTab(): Action {
  return {
    type: 'evaluate',
    fn: `() => {
      const active = document.querySelector('.vertical-tab-nav-item.is-active');
      if (active) active.scrollIntoView({ block: 'center' });
      const title = active && active.querySelector('.vertical-tab-nav-item-title');
      return { scrolledTo: title ? title.textContent.trim() : null };
    }`,
  };
}

/**
 * Switch the active leaf between editing and reading mode.
 *
 * `markdown:toggle-preview` is the real id on current Obsidian — there is no
 * `editor:toggle-preview`. The recorder fails fast on unknown ids, which is how
 * the wrong id surfaced.
 */
export const TOGGLE_VIEW_MODE: Action = {
  type: 'command',
  id: 'markdown:toggle-preview',
};

/** Wait until the active leaf is actually rendering a reading-mode view. */
export function waitForReadingMode(): Action {
  return {
    type: 'wait-for',
    fn: `() => !!document.querySelector('.workspace-leaf.mod-active .markdown-preview-view')`,
    timeout: 10000,
  };
}

/** Wait until the active leaf is back in editing (live preview) mode. */
export function waitForEditingMode(): Action {
  return {
    type: 'wait-for',
    fn: `() => !!document.querySelector('.workspace-leaf.mod-active .cm-editor')`,
    timeout: 10000,
  };
}

/**
 * Actions that leave the active leaf in editing mode again.
 *
 * The recorder's open-file waits for `.cm-editor, .markdown-source-view` to be
 * visible, so a leaf left in reading mode makes the *next* scene's open-file
 * time out. Every scene that enters reading mode must leave it.
 */
export function leaveReadingMode(): Action[] {
  return [TOGGLE_VIEW_MODE, waitForEditingMode()];
}

/** Local YYYY-MM-DD, offset in days from today. */
export function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Org-mode planning date `<YYYY-MM-DD>` with local offset. */
export function orgDate(days: number): string {
  return `<${dateOffset(days)}>`;
}

/**
 * Org-mode CLOSED date `[YYYY-MM-DD Ddd]` with local offset.
 *
 * Square brackets mark an inactive timestamp (CLOSED/STARTED); the day name is
 * optional in the grammar but included so the seeded files match the shape the
 * docs show.
 */
export function orgClosedDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `[${dateOffset(days)} ${weekday}]`;
}

/**
 * Org-mode date carrying a warning period, e.g. `<2026-10-01 -3d>`.
 *
 * The suffix is passed exactly as it is written (`-3d`, `--2d`) rather than
 * derived from a number, so a seed reads the way the docs write it.
 */
export function orgWarningDate(days: number, warning: string): string {
  return `<${dateOffset(days)} ${warning}>`;
}

/**
 * Seed notes live in ./seeds/, one module per scenario dependency set, so the
 * staleness hash can depend on the maps a scenario actually stages.
 *
 * Keep *shared* wait predicates and date helpers here: editing one invalidates
 * every scenario, which is correct. Editing a seed module invalidates only the
 * scenarios that declare it in ../registry.ts.
 *
 * The demo-content rules above apply to every seed module too.
 */
