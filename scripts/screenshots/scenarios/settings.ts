import { defineScript } from 'obsidian-demo-recorder';
import {
  openSettingsDialog,
  revealActiveSettingsTab,
  waitForSettingsDialog,
  waitForPlugin,
} from './helpers';
import { DEMO_SEEDS } from './seeds/demo.ts';

/**
 * Docs scenario for the Settings page (docs/settings.md).
 *
 * Captures:
 * - todoseq-settings — the plugin's settings tab
 */
export default defineScript({
  id: 'docs-settings',
  title: 'docs settings scenario',
  format: 'mp4',
  width: 1400,
  height: 900,
  stills: { mode: 'only', scale: 1 },
  setup: {
    vault: {
      files: Object.entries(DEMO_SEEDS).map(([path, content]) => ({
        path,
        content,
      })),
    },
  },
  scenes: [
    {
      id: 'settings',
      name: 'Settings tab',
      actions: [
        waitForPlugin(),
        openSettingsDialog('todoseq'),
        waitForSettingsDialog(),
        { type: 'wait', ms: 600 },
        revealActiveSettingsTab(),
        { type: 'wait', ms: 400 },
        {
          type: 'screenshot',
          name: 'settings dialog',
          id: 'todoseq-settings',
          selector: '.modal',
          padding: 6,
        },
      ],
    },
  ],
});
