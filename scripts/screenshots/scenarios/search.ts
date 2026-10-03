import { defineScript } from 'obsidian-demo-recorder';
import {
  SEARCH_FILTER_SEEDS,
  waitForPlugin,
  waitForTaskListView,
} from './helpers';

/**
 * Docs scenario for search and filtering (docs/search.md).
 *
 * Captures:
 * - todoseq-search-options-menu — the options dropdown with filter toggles
 *
 * This scenario is deliberately separate from the others even though it shares
 * the task list view. Filtering is the one demo where volume *is* the subject:
 * "n of m" counts and a narrowing result set only mean something against a list
 * worth narrowing. Keeping it here means the task-list and reader scenarios can
 * stay focused on a handful of legible rows instead of carrying filler.
 */
export default defineScript({
  id: 'docs-search',
  title: 'docs search scenario',
  format: 'mp4',
  width: 1400,
  height: 900,
  stills: { mode: 'only', scale: 1 },
  setup: {
    vault: {
      files: Object.entries(SEARCH_FILTER_SEEDS).map(([path, content]) => ({
        path,
        content,
      })),
    },
  },
  scenes: [
    {
      id: 'search-options',
      name: 'Search options dropdown',
      actions: [
        waitForPlugin(),
        { type: 'command', id: 'todoseq:show-task-list' },
        waitForTaskListView(),
        { type: 'open-file', name: 'Backlog' },
        { type: 'wait', ms: 800 },
        // The settings gear opens the options dropdown section.
        {
          type: 'click',
          selector:
            '.todoseq-toolbar .clickable-icon[aria-label*="ettings"], .todoseq-toolbar .todoseq-settings-toggle',
        },
        { type: 'wait', ms: 500 },
        {
          type: 'screenshot',
          name: 'search options menu',
          id: 'todoseq-search-options-menu',
          selector: '.todoseq-toolbar',
          padding: 8,
        },
      ],
    },
  ],
});
