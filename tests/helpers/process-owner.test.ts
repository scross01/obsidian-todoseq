import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import http from 'http';
import { spawn, ChildProcess } from 'child_process';
import {
  assertPortAvailable,
  createProcessOwner,
  parseCdpPort,
  requestOwnerOperation,
  type OwnerPaths,
  type ProcessOwner,
  type ProcessOwnerOptions,
} from '../integration/helpers/process-owner';

let tmpDir: string;
let cleanups: Array<() => Promise<void> | void>;
let children: ChildProcess[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'process-owner-test-'));
  cleanups = [];
  children = [];
});

afterEach(async () => {
  for (const cleanup of cleanups.reverse()) {
    try {
      await cleanup();
    } catch {
      // A deliberately failed shutdown leaves its lease behind; the temp root
      // removal below is the last-resort test cleanup.
    }
  }
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
    }
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function paths(): OwnerPaths {
  const results = path.join(tmpDir, 'test-results');
  return {
    vaultDir: path.join(tmpDir, 'vault'),
    userDataDir: path.join(tmpDir, 'user-data'),
    lockPath: path.join(results, 'obsidian-owner.lock'),
    descriptorPath: path.join(results, 'obsidian-owner.json'),
  };
}

function ownerAt(
  ownerPaths: OwnerPaths,
  overrides: Partial<ProcessOwnerOptions> = {},
): ProcessOwner {
  const owner = createProcessOwner({
    paths: ownerPaths,
    cdpPort: 9334,
    start: async () => {},
    stop: async () => {},
    ...overrides,
  });
  cleanups.push(async () => {
    if (!owner.holdsLease) return;
    try {
      await owner.abort();
    } catch {
      // The owner deliberately keeps its lease when shutdown cannot be
      // confirmed. Close the test control server so Jest can exit, then remove
      // the temp-root evidence.
      await owner.closeControl().catch(() => {});
      fs.rmSync(ownerPaths.lockPath, { recursive: true, force: true });
      fs.rmSync(ownerPaths.descriptorPath, { force: true });
    }
  });
  return owner;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function isAlive(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

function waitForClose(child: ChildProcess): Promise<void> {
  if (!isAlive(child)) return Promise.resolve();
  return new Promise((resolve) => child.once('close', () => resolve()));
}

async function stopChild(child: ChildProcess | null): Promise<void> {
  if (!child || !isAlive(child)) return;
  child.kill('SIGTERM');
  await waitForClose(child);
}

function listen(server: net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as net.AddressInfo).port);
    });
  });
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function rawPost(
  port: number,
  token: string | undefined,
  body: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/owner',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-owner-token': token } : {}),
        },
      },
      (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (responseBody += chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: responseBody }),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

describe('parseCdpPort', () => {
  it('defaults an unset or blank setting and accepts the valid range', () => {
    expect(parseCdpPort(undefined)).toBe(9334);
    expect(parseCdpPort('')).toBe(9334);
    expect(parseCdpPort('1')).toBe(1);
    expect(parseCdpPort('65535')).toBe(65535);
  });

  it.each(['abc', '0', '65536', '12.5', '-1', ' 12', 'NaN'])(
    'rejects %p before a process can spawn',
    (value) => {
      expect(() => parseCdpPort(value)).toThrow(/OBSIDIAN_CDP_PORT/);
    },
  );
});

describe('fixture ownership', () => {
  it('takes the lease before the control endpoint or descriptor exists', async () => {
    const ownerPaths = paths();
    const owner = ownerAt(ownerPaths);

    owner.acquireLease();
    expect(fs.existsSync(ownerPaths.lockPath)).toBe(true);
    expect(fs.existsSync(ownerPaths.descriptorPath)).toBe(false);
    expect(() => owner.writeDescriptor()).toThrow(/control server/i);

    await owner.startControlServer();
    owner.writeDescriptor();

    expect(fs.existsSync(ownerPaths.descriptorPath)).toBe(true);
    expect(owner.holdsLease).toBe(true);
  });

  it('refuses a second run with the same fixture roots before mutating anything', async () => {
    const ownerPaths = paths();
    let child: ChildProcess | null = null;
    const first = ownerAt(ownerPaths, {
      cdpPort: 9334,
      start: async () => {
        child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
          stdio: 'ignore',
        });
        children.push(child);
      },
      stop: async () => {
        await stopChild(child);
      },
    });
    first.acquireLease();
    await first.startControlServer();
    first.writeDescriptor();
    await first.start();
    fs.mkdirSync(ownerPaths.vaultDir, { recursive: true });
    fs.writeFileSync(path.join(ownerPaths.vaultDir, 'marker.txt'), 'first run');
    const descriptorBefore = fs.readFileSync(ownerPaths.descriptorPath);
    const leaseBefore = fs.readFileSync(
      path.join(ownerPaths.lockPath, 'owner.json'),
    );

    const second = createProcessOwner({
      paths: ownerPaths,
      cdpPort: 9444,
      start: async () => {
        throw new Error('second run must never start');
      },
      stop: async () => {},
    });

    expect(() => second.acquireLease()).toThrow(/lease/i);
    expect(
      fs.readFileSync(path.join(ownerPaths.vaultDir, 'marker.txt'), 'utf8'),
    ).toBe('first run');
    expect(fs.readFileSync(ownerPaths.descriptorPath)).toEqual(
      descriptorBefore,
    );
    expect(
      fs.readFileSync(path.join(ownerPaths.lockPath, 'owner.json')),
    ).toEqual(leaseBefore);
    if (!child) throw new Error('first run did not spawn its process');
    expect(isAlive(child)).toBe(true);

    await first.stop();
    await first.dispose();
  });

  it('refuses stale and malformed leases without reclaiming them', () => {
    const ownerPaths = paths();
    fs.mkdirSync(ownerPaths.lockPath, { recursive: true });

    const stale = ownerAt(ownerPaths);
    expect(() => stale.acquireLease()).toThrow(/lease/i);
    expect(fs.existsSync(ownerPaths.lockPath)).toBe(true);

    fs.writeFileSync(
      path.join(ownerPaths.lockPath, 'owner.json'),
      '{"version":1,"nonce":',
    );
    const malformed = ownerAt(ownerPaths);
    expect(() => malformed.acquireLease()).toThrow(/lease/i);
    expect(fs.existsSync(ownerPaths.lockPath)).toBe(true);
  });

  it('aborts a partial setup without leaving a lease or descriptor', async () => {
    const ownerPaths = paths();
    const owner = ownerAt(ownerPaths);
    owner.acquireLease();
    await owner.startControlServer();
    owner.writeDescriptor();

    await owner.abort();

    expect(owner.holdsLease).toBe(false);
    expect(fs.existsSync(ownerPaths.lockPath)).toBe(false);
    expect(fs.existsSync(ownerPaths.descriptorPath)).toBe(false);
  });

  it('releases only a lease carrying this owner nonce', () => {
    const ownerPaths = paths();
    const owner = ownerAt(ownerPaths);
    owner.acquireLease();
    const leaseFile = path.join(ownerPaths.lockPath, 'owner.json');
    const lease = readJson<Record<string, unknown>>(leaseFile);
    lease.nonce = 'a foreign nonce';
    fs.writeFileSync(leaseFile, JSON.stringify(lease));

    expect(() => owner.releaseLease()).toThrow(/nonce|own/i);
    expect(fs.existsSync(ownerPaths.lockPath)).toBe(true);
  });

  it('refuses a malformed lease even when its nonce matches', () => {
    const ownerPaths = paths();
    const owner = ownerAt(ownerPaths);
    owner.acquireLease();
    const leaseFile = path.join(ownerPaths.lockPath, 'owner.json');
    const lease = readJson<Record<string, unknown>>(leaseFile);
    delete lease.vaultDir;
    fs.writeFileSync(leaseFile, JSON.stringify(lease));

    expect(() => owner.releaseLease()).toThrow(/nonce|malformed|own/i);
    expect(fs.existsSync(ownerPaths.lockPath)).toBe(true);
  });
});

describe('owned lifecycle', () => {
  it('does not call stop for an application it never started', async () => {
    const stops: string[] = [];
    const ownerPaths = paths();
    const owner = ownerAt(ownerPaths, {
      stop: async () => {
        stops.push('stop');
      },
    });
    owner.acquireLease();

    await owner.stop();
    expect(stops).toEqual([]);

    await owner.start();
    await owner.stop();
    expect(stops).toEqual(['stop']);
    await owner.dispose();
  });

  it('leaves the lease and descriptor intact when shutdown cannot be confirmed', async () => {
    const ownerPaths = paths();
    const owner = ownerAt(ownerPaths, {
      stop: async () => {
        throw new Error('cannot confirm shutdown');
      },
    });
    owner.acquireLease();
    await owner.startControlServer();
    owner.writeDescriptor();
    await owner.start();

    await expect(owner.stop()).rejects.toThrow(/cannot confirm shutdown/);
    await expect(owner.dispose()).rejects.toThrow(/running/i);
    expect(owner.holdsLease).toBe(true);
    expect(fs.existsSync(ownerPaths.lockPath)).toBe(true);
    expect(fs.existsSync(ownerPaths.descriptorPath)).toBe(true);
  });

  it('does not mark a failed start as running and still releases a safe setup', async () => {
    const ownerPaths = paths();
    const owner = ownerAt(ownerPaths, {
      start: async () => {
        throw new Error('launch refused');
      },
    });
    owner.acquireLease();
    await owner.startControlServer();
    owner.writeDescriptor();

    await expect(owner.start()).rejects.toThrow(/launch refused/);
    expect(owner.getStatus().running).toBe(false);

    await owner.abort();
    expect(fs.existsSync(ownerPaths.lockPath)).toBe(false);
  });

  it('serializes concurrent lifecycle requests', async () => {
    const ownerPaths = paths();
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    const owner = ownerAt(ownerPaths, {
      start: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 25));
        order.push('start');
        active--;
      },
      stop: async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 25));
        order.push('stop');
        active--;
      },
    });
    owner.acquireLease();

    await Promise.all([owner.start(), owner.stop(), owner.start()]);

    expect(maxActive).toBe(1);
    expect(order).toEqual(['start', 'stop', 'start']);
    await owner.stop();
    await owner.dispose();
  });
});

describe('port conflict safety', () => {
  it('rejects an occupied port without signaling its listener', async () => {
    const server = net.createServer((socket) => socket.end());
    const port = await listen(server);

    await expect(assertPortAvailable(port)).rejects.toThrow(/in use/i);
    expect(await canConnect(port)).toBe(true);

    await closeServer(server);
  });

  it('leaves a listener orphaned by an exited wrapper alive and refuses the launch', async () => {
    const listener = spawn(
      process.execPath,
      [
        '-e',
        `const net = require('net');
         const server = net.createServer((socket) => socket.end());
         server.listen(0, '127.0.0.1', () => process.stdout.write(String(server.address().port)));
         setInterval(() => {}, 1000);`,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    children.push(listener);
    const port = await new Promise<number>((resolve, reject) => {
      listener.once('error', reject);
      listener.stdout?.setEncoding('utf8');
      listener.stdout?.once('data', (chunk: string) => resolve(Number(chunk)));
    });

    let wrapper: ChildProcess | null = null;
    const owner = ownerAt(paths(), {
      cdpPort: port,
      start: async () => {
        const launched = spawn(process.execPath, ['-e', 'process.exit(0)'], {
          stdio: 'ignore',
        });
        wrapper = launched;
        children.push(launched);
        await waitForClose(launched);
        if (await canConnect(port)) {
          throw new Error('wrapper exited while its CDP listener survived');
        }
      },
      stop: async () => {
        // The listener is deliberately not owned by this owner.
      },
    });
    owner.acquireLease();

    await expect(owner.start()).rejects.toThrow(/wrapper exited/i);
    expect(wrapper).not.toBeNull();
    expect(isAlive(listener)).toBe(true);
    expect(await canConnect(port)).toBe(true);

    await owner.abort();
    expect(isAlive(listener)).toBe(true);
    await stopChild(listener);
  });
});

describe('owner control endpoint', () => {
  it('rejects missing, malformed and foreign-token descriptors without stopping', async () => {
    const ownerPaths = paths();
    const stops: string[] = [];
    const owner = ownerAt(ownerPaths, {
      stop: async () => {
        stops.push('stop');
      },
    });
    owner.acquireLease();
    await owner.startControlServer();
    owner.writeDescriptor();
    await owner.start();

    await expect(
      requestOwnerOperation(path.join(tmpDir, 'missing.json'), 'stop'),
    ).rejects.toThrow(/descriptor/i);

    const malformed = path.join(tmpDir, 'malformed.json');
    fs.writeFileSync(malformed, '{"version":1}');
    await expect(requestOwnerOperation(malformed, 'stop')).rejects.toThrow(
      /descriptor/i,
    );

    const foreign = path.join(tmpDir, 'foreign.json');
    const descriptor = readJson<Record<string, unknown>>(
      ownerPaths.descriptorPath,
    );
    descriptor.token = 'foreign-token';
    fs.writeFileSync(foreign, JSON.stringify(descriptor));
    await expect(requestOwnerOperation(foreign, 'stop')).rejects.toThrow(
      /owner/i,
    );

    const listening = readJson<{
      control: { port: number };
    }>(ownerPaths.descriptorPath);
    const missingToken = await rawPost(
      listening.control.port,
      undefined,
      '{"operation":"stop"}',
    );
    expect(missingToken.status).toBe(401);

    expect(stops).toEqual([]);
    await owner.stop();
    await owner.dispose();
    expect(stops).toEqual(['stop']);
  });

  it('rejects an oversized request body without changing lifecycle state', async () => {
    const ownerPaths = paths();
    const stops: string[] = [];
    const owner = ownerAt(ownerPaths, {
      stop: async () => {
        stops.push('stop');
      },
    });
    owner.acquireLease();
    await owner.startControlServer();
    owner.writeDescriptor();
    await owner.start();
    const descriptor = readJson<{
      control: { port: number };
      token: string;
    }>(ownerPaths.descriptorPath);

    const response = await rawPost(
      descriptor.control.port,
      descriptor.token,
      '{"operation":"stop","padding":"' + 'x'.repeat(2048) + '"}',
    );

    expect(response.status).toBe(413);
    expect(stops).toEqual([]);
    await owner.stop();
    await owner.dispose();
  });

  it('rejects a response whose owner identity does not match the descriptor', async () => {
    const ownerPaths = paths();
    const server = http.createServer((request, response) => {
      request.resume();
      response.setHeader('content-type', 'application/json');
      response.setHeader('connection', 'close');
      response.end(
        JSON.stringify({ running: true, runId: 'foreign-run', cdpPort: 9334 }),
      );
    });
    const port = await listen(server);
    const descriptorPath = path.join(tmpDir, 'foreign-owner.json');
    fs.writeFileSync(
      descriptorPath,
      JSON.stringify({
        version: 1,
        runId: 'expected-run',
        token: 'test-token',
        ownerPid: process.pid,
        cdpPort: 9334,
        control: { host: '127.0.0.1', port },
        vaultDir: ownerPaths.vaultDir,
        userDataDir: ownerPaths.userDataDir,
        lockPath: ownerPaths.lockPath,
        descriptorPath,
        createdAt: new Date().toISOString(),
      }),
    );

    try {
      await expect(
        requestOwnerOperation(descriptorPath, 'status'),
      ).rejects.toThrow(/identity/i);
    } finally {
      server.closeAllConnections();
      await closeServer(server);
    }
  });

  it('authenticates start, status and stop through the descriptor', async () => {
    const ownerPaths = paths();
    let starts = 0;
    let stops = 0;
    const owner = ownerAt(ownerPaths, {
      start: async () => {
        starts++;
      },
      stop: async () => {
        stops++;
      },
    });
    owner.acquireLease();
    await owner.startControlServer();
    owner.writeDescriptor();

    const started = await requestOwnerOperation(
      ownerPaths.descriptorPath,
      'start',
    );
    expect(started.running).toBe(true);
    expect(starts).toBe(1);

    const status = await requestOwnerOperation(
      ownerPaths.descriptorPath,
      'status',
    );
    expect(status.running).toBe(true);
    expect(status.cdpPort).toBe(9334);

    const stopped = await requestOwnerOperation(
      ownerPaths.descriptorPath,
      'stop',
    );
    expect(stopped.running).toBe(false);
    expect(stops).toBe(1);

    await owner.dispose();
  });
});
