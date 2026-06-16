import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// helpers/ -> fixtures/  (computed independently to avoid a circular import
// with harness.ts, which imports writeVaultMarkdown from this module).
const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures');

export const TEST_VAULT_DIR = path.join(FIXTURES_DIR, 'test-vault');

function todayDateStr(): string {
  const today = new Date();
  // Local-time methods per AGENTS.md timezone-independence rule.
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

/**
 * Write the markdown fixture files into the test vault.
 * Does NOT touch `.obsidian/` — that is managed by the harness so that plugin
 * config stays isolated from these content resets.
 */
export function writeVaultMarkdown(): void {
  fs.mkdirSync(path.join(TEST_VAULT_DIR, 'projects'), { recursive: true });
  fs.mkdirSync(path.join(TEST_VAULT_DIR, 'daily'), { recursive: true });

  fs.writeFileSync(
    path.join(TEST_VAULT_DIR, 'inbox.md'),
    `# Inbox

- [ ] TODO Buy groceries
- [ ] TODO Review PR #123
- [x] DONE Write documentation
- [ ] WAITING For feedback on proposal
`,
  );

  fs.writeFileSync(
    path.join(TEST_VAULT_DIR, 'projects', 'alpha.md'),
    `# Project Alpha

- [ ] TODO Implement feature A
- [ ] TODO Fix bug in module B
- [x] DONE Deploy to staging
`,
  );

  fs.writeFileSync(
    path.join(TEST_VAULT_DIR, 'embedded-demo.md'),
    `# Embedded Task List Demo

\`\`\`todoseq
search: path:projects
\`\`\`

Some text after the code block.
`,
  );

  const dateStr = todayDateStr();
  fs.writeFileSync(
    path.join(TEST_VAULT_DIR, 'daily', `${dateStr}.md`),
    `# ${dateStr}

- [ ] TODO Daily task 1
`,
  );

  // File for recurrence testing (recurring task with +1d repeat)
  // Use today's date so that when the task is completed, recurrence
  // advances to a future date that's clearly different from the initial.
  const today = new Date();
  const todayDayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
    today.getDay()
  ];
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')} ${todayDayAbbr}`;

  fs.writeFileSync(
    path.join(TEST_VAULT_DIR, 'recurrence.md'),
    `# Recurrence Test

- [ ] TODO Recurring daily task
  SCHEDULED: <${todayStr} +1d>
`,
  );

  // File for state cycling test (all states)
  fs.writeFileSync(
    path.join(TEST_VAULT_DIR, 'states.md'),
    `# State Cycling Test

- [ ] TODO State cycling task
- [ ] DOING In-progress task
- [x] DONE Completed task
- [ ] WAITING Blocked task
`,
  );

  // File for smart date processing test
  fs.writeFileSync(
    path.join(TEST_VAULT_DIR, 'smart-date.md'),
    `# Smart Date Test

- [ ] TODO Type a task with natural date here
`,
  );

  // File with frontmatter properties for property search testing
  fs.writeFileSync(
    path.join(TEST_VAULT_DIR, 'with-properties.md'),
    `---
status: active
project: alpha
due: ${dateStr}
---

# Tasks With Properties

- [ ] TODO Property task one
- [ ] DOING Property task two
- [x] DONE Property task three
`,
  );

  // Empty file for external-change testing (will be modified by test)
  fs.writeFileSync(
    path.join(TEST_VAULT_DIR, 'external-change.md'),
    `# External Change Test

This file will be modified externally to test vault rescan.
`,
  );
}
