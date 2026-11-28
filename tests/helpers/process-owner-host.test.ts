import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

/**
 * Characterizes the installed Playwright runner before the harness depends on
 * a runner-owned control service.
 *
 * The real suite launches Obsidian in globalSetup and expects a worker (the
 * restart project) to control it later. That only works if globalSetup and
 * globalTeardown run in the same long-lived runner process, with every worker
 * in between connecting to that process. This test proves that lifetime with a
 * temporary Playwright project and a harmless loopback server, without
 * launching Obsidian or a browser.
 */

const PLAYWRIGHT_ENTRY = require.resolve('@playwright/test');
const PLAYWRIGHT_CLI = require.resolve('@playwright/test/cli');

interface HostFixtureOptions {
  failSecondProject?: boolean;
}

interface HostEvent {
  event: 'setup' | 'first' | 'second' | 'cleanup';
  ownerPid: number;
  runId: string;
  childAlive?: boolean;
  serverClosed?: boolean;
}

function writeFile(dir: string, name: string, contents: string): void {
  fs.writeFileSync(path.join(dir, name), contents);
}

function workerSpec(event: HostEvent['event'], fail = false): string {
  return `
const { test, expect } = require(${JSON.stringify(PLAYWRIGHT_ENTRY)});
const fs = require('fs');
const http = require('http');
const path = require('path');

test(${JSON.stringify(`${event} worker reaches the owner`)}, async () => {
  const dir = process.env.OWNER_HOST_DIR;
  const descriptor = JSON.parse(
    fs.readFileSync(path.join(dir, 'descriptor.json'), 'utf8'),
  );
  const result = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: descriptor.host,
        port: descriptor.controlPort,
        path: '/identity',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-owner-token': descriptor.token,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(\`owner returned \${res.statusCode}: \${body}\`));
          } else {
            resolve(JSON.parse(body));
          }
        });
      },
    );
    req.on('error', reject);
    req.end('{"operation":"identity"}');
  });
  fs.appendFileSync(
    path.join(dir, 'results.jsonl'),
    JSON.stringify({
      event: ${JSON.stringify(event)},
      ownerPid: result.ownerPid,
      runId: result.runId,
    }) + '\\n',
  );
  expect(result.ownerPid).toBe(descriptor.ownerPid);
  expect(result.runId).toBe(descriptor.runId);
  ${fail ? "throw new Error('deliberate second-project failure');" : ''}
});
`;
}

function createFixture(dir: string, options: HostFixtureOptions): void {
  fs.mkdirSync(dir, { recursive: true });
  writeFile(dir, 'owner-state.js', 'module.exports = {};\n');

  writeFile(
    dir,
    'global-setup.js',
    `
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

module.exports = async () => {
  const dir = process.env.OWNER_HOST_DIR;
  const state = require('./owner-state');
  state.runId = crypto.randomUUID();
  state.token = crypto.randomBytes(24).toString('hex');

  state.server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/identity') {
      res.writeHead(404).end();
      return;
    }
    if (req.headers['x-owner-token'] !== state.token) {
      res.writeHead(401).end();
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024) req.destroy();
    });
    req.on('end', () => {
      if (body !== '{"operation":"identity"}') {
        res.writeHead(400).end();
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({ ownerPid: process.pid, runId: state.runId }),
      );
    });
  });
  await new Promise((resolve, reject) => {
    state.server.once('error', reject);
    state.server.listen(0, '127.0.0.1', resolve);
  });

  state.child = spawn(process.execPath, [
    '-e',
    'setInterval(() => {}, 1000)',
  ], { stdio: 'ignore' });

  const address = state.server.address();
  fs.writeFileSync(
    path.join(dir, 'descriptor.json'),
    JSON.stringify({
      ownerPid: process.pid,
      runId: state.runId,
      token: state.token,
      host: '127.0.0.1',
      controlPort: address.port,
      childPid: state.child.pid,
    }),
    { mode: 0o600 },
  );
  fs.appendFileSync(
    path.join(dir, 'results.jsonl'),
    JSON.stringify({
      event: 'setup',
      ownerPid: process.pid,
      runId: state.runId,
    }) + '\\n',
  );
};
`,
  );

  writeFile(
    dir,
    'global-teardown.js',
    `
const fs = require('fs');
const path = require('path');

module.exports = async () => {
  const dir = process.env.OWNER_HOST_DIR;
  const state = require('./owner-state');
  await new Promise((resolve) => state.server.close(resolve));
  if (state.child.exitCode === null && state.child.signalCode === null) {
    await new Promise((resolve) => {
      const force = setTimeout(() => {
        state.child.kill('SIGKILL');
      }, 2000);
      state.child.once('close', () => {
        clearTimeout(force);
        resolve();
      });
      state.child.kill('SIGTERM');
    });
  }
  fs.appendFileSync(
    path.join(dir, 'results.jsonl'),
    JSON.stringify({
      event: 'cleanup',
      ownerPid: process.pid,
      runId: state.runId,
      childAlive: state.child.exitCode === null && state.child.signalCode === null,
      serverClosed: true,
    }) + '\\n',
  );
};
`,
  );

  writeFile(dir, 'first.spec.js', workerSpec('first'));
  writeFile(
    dir,
    'second.spec.js',
    workerSpec('second', options.failSecondProject),
  );

  writeFile(
    dir,
    'playwright.config.js',
    `
module.exports = {
  testDir: __dirname,
  timeout: 10000,
  workers: 1,
  globalSetup: require.resolve('./global-setup.js'),
  globalTeardown: require.resolve('./global-teardown.js'),
  projects: [
    { name: 'first', testMatch: /first\\.spec\\.js/ },
    { name: 'second', dependencies: ['first'], testMatch: /second\\.spec\\.js/ },
  ],
};
`,
  );
}

function runFixture(dir: string): ReturnType<typeof spawnSync> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OWNER_HOST_DIR: dir,
    CI: '1',
  };
  // Playwright refuses to start when it detects a Jest worker. The fixture is
  // deliberately launched from Jest, but the CLI must not inherit that marker.
  delete env.JEST_WORKER_ID;
  return spawnSync(
    process.execPath,
    [
      PLAYWRIGHT_CLI,
      'test',
      '--config',
      path.join(dir, 'playwright.config.js'),
      '--reporter=line',
    ],
    {
      cwd: dir,
      encoding: 'utf8',
      timeout: 90_000,
      env,
    },
  );
}

function readEvents(dir: string): HostEvent[] {
  return fs
    .readFileSync(path.join(dir, 'results.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as HostEvent);
}

let tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Playwright runner ownership lifetime', () => {
  it('keeps one globalSetup owner across dependent workers and runs explicit teardown last', () => {
    const dir = makeTempDir('process-owner-host-');
    createFixture(dir, {});

    const result = runFixture(dir);
    if (result.status !== 0) {
      throw new Error(
        `Playwright fixture failed (status ${result.status}, signal ${result.signal}):\n${result.stdout}\n${result.stderr}`,
      );
    }

    const events = readEvents(dir);
    expect(events.map((event) => event.event)).toEqual([
      'setup',
      'first',
      'second',
      'cleanup',
    ]);
    const ownerPids = new Set(events.map((event) => event.ownerPid));
    const runIds = new Set(events.map((event) => event.runId));
    expect(ownerPids.size).toBe(1);
    expect(runIds.size).toBe(1);
    expect(events[3].childAlive).toBe(false);
    expect(events[3].serverClosed).toBe(true);
  });

  it('runs the explicit globalTeardown cleanup when a later project fails', () => {
    const dir = makeTempDir('process-owner-host-fail-');
    createFixture(dir, { failSecondProject: true });

    const result = runFixture(dir);
    expect(result.status).not.toBe(0);

    const events = readEvents(dir);
    expect(events.map((event) => event.event)).toEqual([
      'setup',
      'first',
      'second',
      'cleanup',
    ]);
    expect(events[3].childAlive).toBe(false);
    expect(events[3].serverClosed).toBe(true);
  });
});
