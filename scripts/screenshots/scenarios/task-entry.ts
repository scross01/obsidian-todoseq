import { defineScript } from 'obsidian-demo-recorder';
import {
  TASK_ENTRY_SEEDS,
  waitForPlugin,
  waitForTaskListView,
} from './helpers';

/**
 * Animated task-entry demo — the landing-page hero (docs/index.md, README).
 *
 * This is a *video* scenario, not a stills one: the driver records an MP4 and
 * converts it to docs/assets/todoseq-task-entry.gif.
 *
 * The flow reproduces the original recording — open the note, type three tasks,
 * set priority and a scheduled date, open the task list, change states — with
 * the content corrected to TODOseq-only. The tasks are typed live rather than
 * seeded, because watching a keyword turn a line into a task is the entire
 * point; seeding them would defeat the demo.
 *
 * Every choice the demo makes is driven by a real mouse move and click, not a
 * scripted DOM call: the point is to show someone using the plugin, and a menu
 * that appears and vanishes without the pointer ever reaching it is not that.
 */
export default defineScript({
  id: 'docs-task-entry',
  title: 'task entry hero demo',
  format: 'mp4',
  // Must match the recorder's capture resolution exactly: it defaults to
  // 1024x640 and the driver does not pass --width/--height.
  width: 1024,
  height: 640,
  fps: 10,
  setup: {
    // Obsidian's chrome is the recorder's `ScriptSetup`, and every visibility
    // flag there defaults to true — `resetLayout` collapses both sidebars and
    // sets display:none on the ribbon and status bar so captures come out
    // chrome-free. No scenario in this directory set any of them, so all six
    // have been inheriting those defaults. Spelled out here so the choice is
    // deliberate rather than accidental.
    //
    // The ribbon and status bar stay visible because this is the landing-page
    // hero: it should read as somebody working in Obsidian, not as a bare text
    // editor.
    //
    // The left sidebar stays collapsed — the file explorer would eat a third of
    // the width and says nothing about the plugin. `hideRightSidebar` must also
    // stay true: the scene below reveals the panel with a real click on
    // Obsidian's expand toggle, which only opens a panel that starts collapsed.
    hideRibbon: false,
    hideLeftSidebar: true,
    hideRightSidebar: true,
    hideStatusBar: false,
    // Obsidian's core "Slash commands" plugin. It is off by default in the
    // recorder's vault, and without it `/high` and `/sched` type as literal
    // text with no suggestion menu — the demo would then show dead text
    // instead of the commands it is meant to demonstrate.
    corePlugins: { 'slash-command': true },
    vault: {
      files: Object.entries(TASK_ENTRY_SEEDS).map(([path, content]) => ({
        path,
        content,
      })),
    },
  },
  scenes: [
    {
      id: 'open-note',
      name: 'Open the note',
      actions: [
        waitForPlugin(),
        // The original recording opened the note through the command palette.
        // That is not reproducible here: the palette returns zero suggestions
        // for this filename on current Obsidian, so the typed query would sit
        // there matching nothing. open-file reaches the same end state.
        { type: 'open-file', name: 'TODOseq Task Entry Flow' },
        { type: 'wait-for', selector: '.cm-editor' },
        { type: 'wait', ms: 700 },
      ],
    },
    {
      id: 'type-tasks',
      name: 'Type three tasks',
      actions: [
        // Land the cursor at the end of the seeded intro line.
        { type: 'click', selector: '.cm-line' },
        { type: 'press', key: 'End' },
        { type: 'press', key: 'Enter' },
        {
          type: 'type',
          selector: '.cm-content',
          text: 'TODO this is an example task',
        },
        { type: 'wait', ms: 400 },
        // Blank line between tasks.
        { type: 'press', key: 'Enter' },
        { type: 'press', key: 'Enter' },
        {
          type: 'type',
          selector: '.cm-content',
          text: 'TODO this is another task',
        },
        { type: 'wait', ms: 300 },
        { type: 'type', selector: '.cm-content', text: ' /high' },
        { type: 'wait', ms: 800 },
        // Move to the command, pause on it, then take it — the pointer should
        // visibly travel to the menu entry rather than the item just appearing.
        {
          type: 'hover',
          text: 'Set priority high',
          scope: '.suggestion-container',
        },
        { type: 'wait', ms: 500 },
        {
          type: 'click',
          text: 'Set priority high',
          scope: '.suggestion-container',
        },
        { type: 'wait', ms: 600 },
        { type: 'press', key: 'Enter' },
        { type: 'press', key: 'Enter' },
        {
          type: 'type',
          selector: '.cm-content',
          text: 'TODO need to do this later',
        },
        { type: 'wait', ms: 300 },
        { type: 'type', selector: '.cm-content', text: ' /sched' },
        { type: 'wait', ms: 800 },
        {
          type: 'hover',
          text: 'Add scheduled date',
          scope: '.suggestion-container',
        },
        { type: 'wait', ms: 500 },
        {
          type: 'click',
          text: 'Add scheduled date',
          scope: '.suggestion-container',
        },
        { type: 'wait', ms: 800 },
        // The date is filled in automatically; move the caret so the viewer
        // sees it land there rather than the value appearing unattended.
        { type: 'hover', text: 'SCHEDULED', scope: '.cm-editor' },
        { type: 'press', key: 'End' },
        { type: 'wait', ms: 700 },
      ],
    },
    {
      id: 'open-task-list',
      name: 'Open the task list',
      actions: [
        // Opened by a real mouse move and click on Obsidian's right-panel
        // expand toggle, rather than by firing `todoseq:show-task-list` and
        // letting the panel materialise with no pointer anywhere near it.
        //
        // Firing the command id is the one beat a viewer could not believe,
        // and there is no todoseq ribbon icon to click instead: it is
        // registered under `Platform.isMobile` only.
        //
        // The toggle is the whole story, and not a shortcut. On first load the
        // plugin's own install path calls showTasks(), so the leaf is already
        // sitting in the right dock — the dock is just collapsed to 0x0, which
        // is why nothing is visible until the toggle is clicked. Clicking the
        // TODOseq tab in the dock's strip afterwards was tried and dropped: it
        // is already the active tab, so it is a click that visibly changes
        // nothing.
        { type: 'hover', selector: '.sidebar-toggle-button.mod-right' },
        { type: 'wait', ms: 500 },
        { type: 'click', selector: '.sidebar-toggle-button.mod-right' },
        waitForTaskListView(),
        // Park the pointer on the third task's scheduled date. Two reasons,
        // and the second is the point of the beat.
        //
        // First, the toggle: the moment the dock opens its label flips from
        // "Expand" to "Collapse", so a pointer left resting there pops that
        // tooltip into the shot. Leaving before the panel settles is what
        // stops it appearing at all, rather than appearing and being
        // dismissed.
        //
        // Second, and deliberately, the pointer lands on the date rather
        // than on neutral empty space. The third task is the one the
        // `/sched` command dated a moment ago, so this is the first time the
        // viewer sees that the scheduled date they watched being typed in
        // the editor is *here*, in the list. The very next beat right-clicks
        // this same row to open its context menu, so the pointer travels
        // within one target and the two actions read as connected: this task
        // is the one we are about to reschedule.
        {
          type: 'hover',
          selector: '.todoseq-task-item:nth-child(3) .todoseq-task-date',
        },
        { type: 'wait', ms: 1400 },
      ],
    },
    {
      id: 'work-the-list',
      name: 'Update tasks in the list',
      actions: [
        // 1. Keyword right-click on the first task → the state menu.
        //    Right-clicking the keyword is what opens it; right-clicking the
        //    row opens the task context menu instead (the handler explicitly
        //    skips the keyword span), so the selector has to be the keyword.
        {
          type: 'right-click',
          selector: '.todoseq-task-item:nth-child(1) .todo-task-keyword',
        },
        { type: 'wait', ms: 900 },
        { type: 'hover', text: 'DOING', scope: '.menu' },
        { type: 'wait', ms: 600 },
        { type: 'click', text: 'DOING', scope: '.menu' },
        { type: 'wait', ms: 1200 },
        // 2. The checkbox completes the task — the input's change handler
        //    resolves the next completed state, so one click takes TODO → DONE.
        {
          type: 'click',
          selector:
            '.todoseq-task-item:nth-child(2) input.todoseq-task-checkbox',
        },
        { type: 'wait', ms: 1400 },
        // 3. Row right-click on the third task → the task context menu, then
        //    the scheduled-date shortcut.
        //
        //    The target is the row, not `.todoseq-task-text`: right-clicking
        //    the text span opens Obsidian's own menu instead (verified against
        //    the live DOM — it comes back as a bare `.menu` with
        //    menu-grabber/menu-group markup, not `.todoseq-task-context-menu`).
        //    The row and its `.todoseq-task-file-info` both reach the plugin's
        //    menu; the row is the natural "right-click this task" target.
        //
        //    "Next weekend" is one of the menu's icon-only date buttons: it
        //    carries `aria-label` and a Lucide icon with no text node, so it
        //    has to be addressed by selector — a text match finds nothing.
        //
        //    Match the label by prefix, not equality. The menu sets
        //    `aria-label` to the option name and then calls setTooltip(), which
        //    overwrites it with the tooltip text — so the live attribute reads
        //    "Next weekend — Sat, Oct 3". An equality selector matches nothing.
        {
          type: 'right-click',
          selector: '.todoseq-task-item:nth-child(3)',
        },
        { type: 'wait', ms: 1200 },
        {
          type: 'hover',
          selector:
            '.todoseq-task-context-menu .todoseq-context-menu-icon-btn[aria-label^="Next weekend"]',
        },
        { type: 'wait', ms: 700 },
        {
          type: 'click',
          selector:
            '.todoseq-task-context-menu .todoseq-context-menu-icon-btn[aria-label^="Next weekend"]',
        },
        // Hold on the result. The click closes the menu and the new date only
        // lands after the menu is gone and the row has re-rendered, so a short
        // wait here ends the recording on the menu closing rather than on the
        // date it just set — the payoff of the last beat is invisible.
        { type: 'wait', ms: 2600 },
      ],
    },
  ],
});
