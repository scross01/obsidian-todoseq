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
}
