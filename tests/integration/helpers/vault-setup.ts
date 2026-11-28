import fs from 'fs';
import path from 'path';

// Keep this module free of import.meta so Jest can import the baseline map.
// The integration runner always executes from the repository root.
const FIXTURES_DIR = path.resolve(
  process.cwd(),
  'tests',
  'integration',
  'fixtures',
);

export const TEST_VAULT_DIR = path.join(FIXTURES_DIR, 'test-vault');

function localDateString(date: Date): string {
  // Local-time methods per AGENTS.md timezone-independence rule.
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localDayAbbr(date: Date): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
}

/**
 * The complete markdown fixture baseline, shared by offline bootstrap and the
 * live per-test reset. Dates are derived from the explicit local `today` so
 * tests can pin the inventory without depending on the wall clock.
 */
export function baselineVaultMarkdown(today: Date): Record<string, string> {
  const dateStr = localDateString(today);
  const todayStr = `${dateStr} ${localDayAbbr(today)}`;

  return {
    'inbox.md': `# Inbox

- [ ] TODO Buy groceries
- [ ] TODO Review PR #123
- [x] DONE Write documentation
- [ ] WAITING For feedback on proposal
`,

    'projects/alpha.md': `# Project Alpha

- [ ] TODO Implement feature A
- [ ] TODO Fix bug in module B
- [x] DONE Deploy to staging
`,

    'embedded-demo.md': `# Embedded Task List Demo

\`\`\`todoseq
search: path:projects
\`\`\`

Some text after the code block.
`,

    [`daily/${dateStr}.md`]: `# ${dateStr}

- [ ] TODO Daily task 1
`,

    // File for recurrence testing (recurring task with +1d repeat)
    // Use today's date so that when the task is completed, recurrence
    // advances to a future date that's clearly different from the initial.
    'recurrence.md': `# Recurrence Test

- [ ] TODO Recurring daily task
  SCHEDULED: <${todayStr} +1d>
`,

    // File for state cycling test (all states)
    'states.md': `# State Cycling Test

- [ ] TODO State cycling task
- [ ] DOING In-progress task
- [x] DONE Completed task
- [ ] WAITING Blocked task
`,

    // Parent/child and plain-sibling fixture for optimistic subtask progress.
    // The blank line keeps the sibling outside the parent's parsed span.
    'subtask-progress.md': `# Subtask Progress

- [ ] TODO Parent task
  - [ ] TODO Child one
  - [ ] TODO Child two

- [ ] TODO Plain sibling
`,

    // File for smart date processing test
    'smart-date.md': `# Smart Date Test

- [ ] TODO Type a task with natural date here
`,

    // File with frontmatter properties for property search testing
    'with-properties.md': `---
status: active
project: alpha
due: ${dateStr}
---

# Tasks With Properties

- [ ] TODO Property task one
- [ ] DOING Property task two
- [x] DONE Property task three
`,

    // File for recurrence-deadline testing (DEADLINE + repeat + warning period)
    'recurrence-deadline.md': `# Recurrence Deadline Test

- [ ] TODO Daily deadline task
  DEADLINE: <${todayStr} +1d -3d>
`,

    // File for DOING → DONE recurrence test (SCHEDULED + repeat)
    'recurrence-doing.md': `# Recurrence DOING Test

- [ ] DOING Recurring DOING task
  SCHEDULED: <${todayStr} +1m>
`,

    // Mixed repeating/one-off dates and a first-only warning period.
    'recurrence-mixed.md': `# Recurrence Mixed Date Test

- [ ] TODO Mixed date task
  SCHEDULED: <${todayStr} +1w>
  DEADLINE: <${todayStr}>

- [ ] DOING First-only warning task
  DEADLINE: <${todayStr} +1d --2d>
`,

    // Two same-title recurring rows with distinct IDs.
    'recurrence-identity.md': `# Recurrence Identity Test

- [ ] TODO Identity target
  SCHEDULED: <${todayStr} +1d>
  :PROPERTIES:
  :ID: identity-target
  :END:

- [ ] TODO Identity target
  SCHEDULED: <${todayStr} +1d>
  :PROPERTIES:
  :ID: identity-decoy
  :END:
`,

    // Table-cell recurrence with a regular warning period.
    'recurrence-table-warning.md': `# Recurrence Table Warning Test

| Task | Note |
|------|------|
| TODO Table warning task<br>SCHEDULED: <${todayStr} .+1d -3d> | keep |
`,

    // Warning-period edit before completion.
    'recurrence-warning-edit.md': `# Recurrence Warning Edit Test

- [ ] TODO Warning edit task
  SCHEDULED: <${todayStr} +1d -3d>
`,

    // Empty file for external-change testing (will be modified by test)
    'external-change.md': `# External Change Test

This file will be modified externally to test vault rescan.
`,

    // File with table cell tasks for testing
    'table-tasks.md': `# Table Tasks Test

| Task | Status | Priority |
|------|--------|----------|
| TODO Table task one | | |
| DOING Table task two with description<br>DESCRIPTION: Task two has a description | | |
| DONE Table task three | | |
| WAITING Table task four | | |

## Multi-column table

| ONE             | TWO                                                                        | THREE                                                                                        |
| --------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| DOING [#A] four | NOW [#B] five<br>DEADLINE: <2026-07-16 Thu><br>SCHEDULED: <2026-07-08 Wed> | IN-PROGRESS [#C] six<br>SCHEDULED: <2026-07-15 Wed 10:00 .+1y><br>DEADLINE: <2026-07-15 Wed> |
| seven           | eight                                                                      | nine                                                                                         |
`,
  };
}

export function baselineVaultPaths(today: Date): string[] {
  return Object.keys(baselineVaultMarkdown(today)).sort();
}

/**
 * Write the markdown fixture files into the test vault.
 * Does NOT touch `.obsidian/` — that is managed by the harness so that plugin
 * config stays isolated from these content resets.
 */
export function writeVaultMarkdown(today: Date = new Date()): void {
  for (const [relativePath, content] of Object.entries(
    baselineVaultMarkdown(today),
  )) {
    const target = path.join(TEST_VAULT_DIR, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}
