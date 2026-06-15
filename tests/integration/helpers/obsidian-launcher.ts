import { _electron as electron, ElectronApplication, Page } from 'playwright';
import path from 'path';

const OBSIDIAN_PATH = process.env.OBSIDIAN_PATH || '/Applications/Obsidian.app/Contents/MacOS/Obsidian';
const TEST_VAULT_PATH = path.join(__dirname, '../fixtures/test-vault');

export async function launchObsidian(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    executablePath: OBSIDIAN_PATH,
    args: ['--disable-gpu', '--no-sandbox', `--vault=${TEST_VAULT_PATH}`],
    env: { ...process.env, OBSIDIAN_VAULT: TEST_VAULT_PATH },
  });
  const page = await app.firstWindow();
  await page.waitForSelector('.workspace-leaf', { timeout: 30_000 });
  return { app, page };
}

export async function closeObsidian(app: ElectronApplication): Promise<void> {
  await app.close();
}
