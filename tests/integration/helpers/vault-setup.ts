import fs from 'fs';
import path from 'path';

const TEST_VAULT_PATH = path.join(__dirname, '../fixtures/test-vault');

export function setupTestVault(): void {
  fs.mkdirSync(path.join(TEST_VAULT_PATH, '.obsidian'), { recursive: true });
  fs.mkdirSync(path.join(TEST_VAULT_PATH, 'projects'), { recursive: true });

  fs.writeFileSync(path.join(TEST_VAULT_PATH, 'inbox.md'), `# Inbox

- [ ] TODO Buy groceries
- [ ] TODO Review PR #123
- [x] DONE Write documentation
- [ ] WAITING For feedback on proposal
`);

  fs.writeFileSync(path.join(TEST_VAULT_PATH, 'projects', 'alpha.md'), `# Project Alpha

- [ ] TODO Implement feature A
- [ ] TODO Fix bug in module B
- [x] DONE Deploy to staging
`);

  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  fs.mkdirSync(path.join(TEST_VAULT_PATH, 'daily'), { recursive: true });
  fs.writeFileSync(path.join(TEST_VAULT_PATH, 'daily', `${dateStr}.md`), `# ${dateStr}

- [ ] TODO Daily task 1
`);
}

export function cleanupTestVault(): void {
  fs.rmSync(TEST_VAULT_PATH, { recursive: true, force: true });
}

export function getTestVaultPath(): string {
  return TEST_VAULT_PATH;
}
