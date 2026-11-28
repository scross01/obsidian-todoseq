import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import net from 'net';
import path from 'path';

/**
 * Single-owner lifecycle control for the isolated Obsidian integration run.
 *
 * The integration suite deliberately launches one application in globalSetup
 * and controls it from later Playwright workers (the restart project). CDP is
 * the only bridge between those processes, and a CDP port is not an identity:
 * anything can listen there. This module keeps the actual lifecycle authority
 * in the runner that spawned the application, publishes an authenticated
 * endpoint, and refuses rather than discovering or terminating unknown
 * listeners.
 *
 * Node-only and side-effect-free on import, so Jest can exercise it without a
 * running Obsidian or Playwright.
 */

export type OwnerOperation = 'start' | 'stop' | 'status';

export interface OwnerPaths {
  vaultDir: string;
  userDataDir: string;
  lockPath: string;
  descriptorPath: string;
}

export interface ProcessOwnerOptions {
  paths: OwnerPaths;
  cdpPort: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  status?: () => { running: boolean; detail?: string };
  logger?: (message: string) => void;
}

export interface OwnerStatus {
  running: boolean;
  runId: string;
  cdpPort: number;
  detail?: string;
}

export interface OwnerDescriptor {
  version: 1;
  runId: string;
  token: string;
  ownerPid: number;
  cdpPort: number;
  control: { host: string; port: number };
  vaultDir: string;
  userDataDir: string;
  lockPath: string;
  descriptorPath: string;
  createdAt: string;
}

export interface ProcessOwner {
  readonly runId: string;
  readonly paths: OwnerPaths;
  readonly holdsLease: boolean;
  acquireLease(): void;
  releaseLease(): void;
  startControlServer(): Promise<number>;
  writeDescriptor(): void;
  start(): Promise<OwnerStatus>;
  stop(): Promise<OwnerStatus>;
  getStatus(): OwnerStatus;
  closeControl(): Promise<void>;
  dispose(): Promise<void>;
  abort(): Promise<void>;
}

export interface OwnerRequestOptions {
  timeoutMs?: number;
}

interface LeaseRecord {
  version: 1;
  nonce: string;
  runId: string;
  pid: number;
  vaultDir: string;
  userDataDir: string;
  lockPath: string;
  descriptorPath: string;
  createdAt: string;
}

class RequestTooLargeError extends Error {
  constructor() {
    super('owner request body too large');
    this.name = 'RequestTooLargeError';
  }
}

/** A lifecycle request was refused; no process was signaled. */
export class OwnerRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OwnerRefusedError';
  }
}

const DEFAULT_CDP_PORT = 9334;
const MAX_CONTROL_BODY_BYTES = 1024;
const MAX_CONTROL_RESPONSE_BYTES = 64 * 1024;
const CONTROL_PATH = '/owner';

let activeOwner: ProcessOwner | null = null;

/** The owner singleton lives in the Playwright runner process. */
export function setActiveOwner(owner: ProcessOwner): void {
  activeOwner = owner;
}

export function getActiveOwner(): ProcessOwner | null {
  return activeOwner;
}

export function clearActiveOwner(owner?: ProcessOwner): void {
  if (!owner || activeOwner === owner) activeOwner = null;
}

/** Validate an explicit numeric CDP port. */
export function validateCdpPort(port: number): number {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new OwnerRefusedError(
      `OBSIDIAN_CDP_PORT must be an integer from 1 to 65535; received ${String(port)}`,
    );
  }
  return port;
}

/**
 * Parse `OBSIDIAN_CDP_PORT` before any bootstrap or spawn. Empty/unset keeps
 * the historical default; anything else must be a complete decimal integer.
 */
export function parseCdpPort(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_CDP_PORT;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new OwnerRefusedError(
      `OBSIDIAN_CDP_PORT must be an integer from 1 to 65535; received "${value}"`,
    );
  }
  return validateCdpPort(Number(value));
}

/**
 * Prove a loopback TCP port can be bound. This checks occupancy only; it never
 * connects to, identifies, or signals whatever may be listening.
 */
export function assertPortAvailable(
  port: number,
  host = '127.0.0.1',
): Promise<void> {
  validateCdpPort(port);
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    let settled = false;

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      if (error.code === 'EADDRINUSE') {
        reject(
          new OwnerRefusedError(
            `CDP port ${port} on ${host} is already in use. Refusing to launch or terminate an unknown listener; choose an unused OBSIDIAN_CDP_PORT or close the known test instance manually.`,
          ),
        );
        return;
      }
      reject(error);
    });

    server.listen({ port, host, exclusive: true }, () => {
      if (settled) return;
      settled = true;
      server.close(() => resolve());
    });
  });
}

/**
 * Build the owner state for one Playwright run. Import-safe: all paths,
 * callbacks and logging come from the caller.
 */
export function createProcessOwner(options: ProcessOwnerOptions): ProcessOwner {
  const cdpPort = validateCdpPort(options.cdpPort);
  const ownerPaths: OwnerPaths = {
    vaultDir: path.resolve(options.paths.vaultDir),
    userDataDir: path.resolve(options.paths.userDataDir),
    lockPath: path.resolve(options.paths.lockPath),
    descriptorPath: path.resolve(options.paths.descriptorPath),
  };
  const runId = crypto.randomUUID();
  const nonce = crypto.randomBytes(32).toString('hex');
  const token = crypto.randomBytes(32).toString('hex');
  const logger =
    options.logger ??
    ((message: string) => console.debug(`[owner] ${message}`));

  let leaseHeld = false;
  let controlServer: http.Server | null = null;
  let controlPort: number | null = null;
  let running = false;
  let queue: Promise<void> = Promise.resolve();

  function leaseFile(): string {
    return path.join(ownerPaths.lockPath, 'owner.json');
  }

  function assertLease(): void {
    if (!leaseHeld) {
      throw new OwnerRefusedError(
        'Refusing lifecycle control without the exclusive fixture lease.',
      );
    }
  }

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function readLease(): LeaseRecord | null {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(leaseFile(), 'utf8'));
      if (!isRecord(parsed)) return null;
      if (
        parsed.version !== 1 ||
        typeof parsed.nonce !== 'string' ||
        parsed.nonce.length === 0 ||
        typeof parsed.runId !== 'string' ||
        parsed.runId.length === 0 ||
        typeof parsed.pid !== 'number' ||
        !Number.isInteger(parsed.pid) ||
        typeof parsed.vaultDir !== 'string' ||
        typeof parsed.userDataDir !== 'string' ||
        typeof parsed.lockPath !== 'string' ||
        typeof parsed.descriptorPath !== 'string' ||
        typeof parsed.createdAt !== 'string'
      ) {
        return null;
      }
      return {
        version: 1,
        nonce: parsed.nonce,
        runId: parsed.runId,
        pid: parsed.pid,
        vaultDir: parsed.vaultDir,
        userDataDir: parsed.userDataDir,
        lockPath: parsed.lockPath,
        descriptorPath: parsed.descriptorPath,
        createdAt: parsed.createdAt,
      };
    } catch {
      return null;
    }
  }

  function acquireLease(): void {
    if (leaseHeld) return;
    fs.mkdirSync(path.dirname(ownerPaths.lockPath), {
      recursive: true,
      mode: 0o700,
    });
    try {
      fs.mkdirSync(ownerPaths.lockPath, { mode: 0o700 });
    } catch (error) {
      if (isErrno(error, 'EEXIST')) {
        throw new OwnerRefusedError(
          `Fixture lease already exists at ${ownerPaths.lockPath}. Refusing to bootstrap, overwrite a descriptor, or signal anything. Another run is live, initializing, stale, or ambiguous; recover it manually only after confirming no owned process remains.`,
        );
      }
      throw error;
    }

    const lease: LeaseRecord = {
      version: 1,
      nonce,
      runId,
      pid: process.pid,
      vaultDir: ownerPaths.vaultDir,
      userDataDir: ownerPaths.userDataDir,
      lockPath: ownerPaths.lockPath,
      descriptorPath: ownerPaths.descriptorPath,
      createdAt: new Date().toISOString(),
    };

    try {
      fs.writeFileSync(leaseFile(), JSON.stringify(lease), {
        mode: 0o600,
        flag: 'wx',
      });
      chmodIfSupported(leaseFile(), 0o600);
      leaseHeld = true;
      logger(`fixture lease acquired at ${ownerPaths.lockPath}`);
    } catch (error) {
      fs.rmSync(ownerPaths.lockPath, { recursive: true, force: true });
      throw error;
    }
  }

  function releaseLease(): void {
    assertLease();
    if (running) {
      throw new OwnerRefusedError(
        'Refusing to release the fixture lease while the owned application is still running.',
      );
    }
    const lease = readLease();
    if (!lease || lease.nonce !== nonce) {
      throw new OwnerRefusedError(
        'Refusing to release a fixture lease whose nonce is missing, malformed, or owned by another run.',
      );
    }
    fs.rmSync(ownerPaths.lockPath, { recursive: true, force: false });
    leaseHeld = false;
    logger('fixture lease released');
  }

  async function startControlServer(): Promise<number> {
    assertLease();
    if (controlServer && controlPort !== null) return controlPort;

    const server = http.createServer((request, response) => {
      void handleControlRequest(request, response);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new OwnerRefusedError(
        'Owner control endpoint did not receive a loopback port.',
      );
    }
    controlServer = server;
    controlPort = address.port;
    logger(
      `owner control endpoint listening on 127.0.0.1:${String(controlPort)}`,
    );
    return controlPort;
  }

  function writeDescriptor(): void {
    assertLease();
    if (controlPort === null) {
      throw new OwnerRefusedError(
        'Refusing to write the owner descriptor before the control server is listening.',
      );
    }
    const descriptor: OwnerDescriptor = {
      version: 1,
      runId,
      token,
      ownerPid: process.pid,
      cdpPort,
      control: { host: '127.0.0.1', port: controlPort },
      vaultDir: ownerPaths.vaultDir,
      userDataDir: ownerPaths.userDataDir,
      lockPath: ownerPaths.lockPath,
      descriptorPath: ownerPaths.descriptorPath,
      createdAt: new Date().toISOString(),
    };
    const dir = path.dirname(ownerPaths.descriptorPath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const temporary = `${ownerPaths.descriptorPath}.${runId}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(descriptor), {
        mode: 0o600,
      });
      chmodIfSupported(temporary, 0o600);
      fs.renameSync(temporary, ownerPaths.descriptorPath);
      chmodIfSupported(ownerPaths.descriptorPath, 0o600);
      logger(
        `owner descriptor written at ${ownerPaths.descriptorPath} (token withheld)`,
      );
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }

  function getStatus(): OwnerStatus {
    const reported = options.status?.();
    return {
      running: reported ? reported.running : running,
      runId,
      cdpPort,
      ...(reported?.detail ? { detail: reported.detail } : {}),
    };
  }

  async function runOperation(operation: OwnerOperation): Promise<OwnerStatus> {
    switch (operation) {
      case 'start':
        if (!running) {
          // Mark the run as owning an application before the callback can
          // spawn one. A launch that spawns and then times out must still be
          // stoppable; otherwise abort would release the lease over a live
          // child it no longer knows about.
          running = true;
          try {
            await options.start();
            logger('owned application started');
          } catch (error) {
            try {
              await options.stop();
              running = false;
            } catch {
              // Keep the lease held: the child may still be alive. Closing the
              // endpoint avoids an otherwise hanging runner; the descriptor
              // remains for manual recovery.
              await closeControlServerOnly().catch(() => {});
            }
            throw error;
          }
        }
        return getStatus();
      case 'stop':
        if (running) {
          try {
            await options.stop();
            running = false;
            logger('owned application stopped');
          } catch (error) {
            // Do not leave a listening control server behind when shutdown is
            // unconfirmed. The descriptor and lease stay exactly where they
            // are so an operator can see who refused to release them.
            await closeControlServerOnly().catch(() => {});
            throw error;
          }
        }
        return getStatus();
      case 'status':
        return getStatus();
      default:
        throw new OwnerRefusedError('Unknown owner operation.');
    }
  }

  async function closeControlServerOnly(): Promise<void> {
    if (!controlServer) return;
    const server = controlServer;
    controlServer = null;
    controlPort = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  async function closeControl(): Promise<void> {
    await closeControlServerOnly();
    deleteDescriptorIfOwned();
  }

  function deleteDescriptorIfOwned(): void {
    if (!fs.existsSync(ownerPaths.descriptorPath)) return;
    let parsed: OwnerDescriptor;
    try {
      parsed = readOwnerDescriptor(ownerPaths.descriptorPath);
    } catch {
      throw new OwnerRefusedError(
        `Refusing to remove malformed owner descriptor at ${ownerPaths.descriptorPath}.`,
      );
    }
    if (parsed.runId !== runId) {
      throw new OwnerRefusedError(
        'Refusing to remove a descriptor owned by another run.',
      );
    }
    fs.rmSync(ownerPaths.descriptorPath, { force: true });
  }

  const owner: ProcessOwner = {
    runId,
    paths: ownerPaths,
    get holdsLease() {
      return leaseHeld;
    },
    acquireLease,
    releaseLease,
    startControlServer,
    writeDescriptor,
    start() {
      assertLease();
      return serialize(() => runOperation('start'));
    },
    stop() {
      assertLease();
      return serialize(() => runOperation('stop'));
    },
    getStatus,
    closeControl,
    async dispose() {
      if (running) {
        throw new OwnerRefusedError(
          'Refusing to dispose the owner while the application is still running.',
        );
      }
      await closeControl();
      releaseLease();
    },
    async abort() {
      if (running) {
        await owner.stop();
      }
      await closeControl();
      releaseLease();
    },
  };

  async function handleControlRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    try {
      if (request.method !== 'POST' || request.url !== CONTROL_PATH) {
        sendJson(response, 404, { error: 'not found' });
        return;
      }
      if (!hasValidToken(request, token)) {
        sendJson(response, 401, { error: 'invalid owner token' });
        return;
      }

      let body: string;
      try {
        body = await readRequestBody(request, MAX_CONTROL_BODY_BYTES);
      } catch (error) {
        if (error instanceof RequestTooLargeError) {
          sendJson(response, 413, { error: 'request body too large' });
          return;
        }
        throw error;
      }

      const operation = parseOperation(body);
      if (!operation) {
        sendJson(response, 400, { error: 'invalid owner operation' });
        return;
      }

      const status = await serialize(() => runOperation(operation));
      sendJson(response, 200, status);
    } catch (error) {
      sendJson(response, 500, {
        error:
          error instanceof Error ? error.message : 'owner operation failed',
      });
    }
  }

  return owner;
}

/** Read and validate the descriptor without ever signaling a process. */
export function readOwnerDescriptor(descriptorPath: string): OwnerDescriptor {
  let raw: string;
  try {
    raw = fs.readFileSync(descriptorPath, 'utf8');
  } catch {
    throw new OwnerRefusedError(
      `Owner descriptor missing at ${descriptorPath}; refusing lifecycle control.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OwnerRefusedError(
      `Owner descriptor at ${descriptorPath} is malformed; refusing lifecycle control.`,
    );
  }
  if (!isRecord(parsed) || parsed.version !== 1) {
    throw new OwnerRefusedError(
      `Owner descriptor at ${descriptorPath} is malformed; refusing lifecycle control.`,
    );
  }

  const control = parsed.control;
  if (
    typeof parsed.runId !== 'string' ||
    parsed.runId.length === 0 ||
    typeof parsed.token !== 'string' ||
    parsed.token.length === 0 ||
    typeof parsed.ownerPid !== 'number' ||
    typeof parsed.cdpPort !== 'number' ||
    !isRecord(control) ||
    control.host !== '127.0.0.1' ||
    typeof control.port !== 'number' ||
    !Number.isInteger(control.port) ||
    control.port < 1 ||
    control.port > 65_535 ||
    typeof parsed.vaultDir !== 'string' ||
    typeof parsed.userDataDir !== 'string' ||
    typeof parsed.lockPath !== 'string' ||
    typeof parsed.descriptorPath !== 'string' ||
    typeof parsed.createdAt !== 'string'
  ) {
    throw new OwnerRefusedError(
      `Owner descriptor at ${descriptorPath} is malformed; refusing lifecycle control.`,
    );
  }
  validateCdpPort(parsed.cdpPort);
  return {
    version: 1,
    runId: parsed.runId,
    token: parsed.token,
    ownerPid: parsed.ownerPid,
    cdpPort: parsed.cdpPort,
    control: { host: '127.0.0.1', port: control.port },
    vaultDir: parsed.vaultDir,
    userDataDir: parsed.userDataDir,
    lockPath: parsed.lockPath,
    descriptorPath: parsed.descriptorPath,
    createdAt: parsed.createdAt,
  };
}

/** Request start/stop/status from the authenticated run owner. */
export async function requestOwnerOperation(
  descriptorPath: string,
  operation: OwnerOperation,
  options: OwnerRequestOptions = {},
): Promise<OwnerStatus> {
  const descriptor = readOwnerDescriptor(descriptorPath);
  const timeoutMs = options.timeoutMs ?? 15_000;
  const body = JSON.stringify({ operation });

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | null, status?: OwnerStatus): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else if (status) resolve(status);
    };

    const request = http.request(
      {
        host: descriptor.control.host,
        port: descriptor.control.port,
        path: CONTROL_PATH,
        method: 'POST',
        agent: false,
        timeout: timeoutMs,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          'x-owner-token': descriptor.token,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_CONTROL_RESPONSE_BYTES) {
            response.destroy(
              new OwnerRefusedError('Owner response exceeded its size limit.'),
            );
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', (error) => finish(error));
        response.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf8');
          if (response.statusCode !== 200) {
            finish(
              new OwnerRefusedError(
                `Owner refused ${operation}: HTTP ${String(response.statusCode)} ${responseBody.slice(0, 200)}`,
              ),
            );
            return;
          }
          try {
            const status = parseOwnerStatus(JSON.parse(responseBody));
            if (
              status.runId !== descriptor.runId ||
              status.cdpPort !== descriptor.cdpPort
            ) {
              throw new OwnerRefusedError(
                'Owner response identity does not match the descriptor; refusing lifecycle control.',
              );
            }
            finish(null, status);
          } catch (error) {
            finish(
              error instanceof OwnerRefusedError
                ? error
                : new OwnerRefusedError(
                    `Owner returned an unreadable ${operation} response: ${
                      error instanceof Error ? error.message : 'invalid JSON'
                    }`,
                  ),
            );
          }
        });
      },
    );

    const timer = setTimeout(() => {
      request.destroy(
        new OwnerRefusedError(`Owner ${operation} request timed out.`),
      );
    }, timeoutMs);

    request.on('timeout', () => {
      request.destroy(
        new OwnerRefusedError(`Owner ${operation} request timed out.`),
      );
    });
    request.on('error', (error) => finish(error));
    request.end(body);
  });
}

function parseOwnerStatus(value: unknown): OwnerStatus {
  if (
    !isRecord(value) ||
    typeof value.running !== 'boolean' ||
    typeof value.runId !== 'string' ||
    typeof value.cdpPort !== 'number'
  ) {
    throw new Error('invalid owner status');
  }
  return {
    running: value.running,
    runId: value.runId,
    cdpPort: validateCdpPort(value.cdpPort),
    ...(typeof value.detail === 'string' ? { detail: value.detail } : {}),
  };
}

function readRequestBody(
  request: http.IncomingMessage,
  limit: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) reject(new RequestTooLargeError());
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', reject);
  });
}

function parseOperation(body: string): OwnerOperation | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (
    parsed.operation === 'start' ||
    parsed.operation === 'stop' ||
    parsed.operation === 'status'
  ) {
    return parsed.operation;
  }
  return null;
}

function hasValidToken(
  request: http.IncomingMessage,
  expected: string,
): boolean {
  const received = request.headers['x-owner-token'];
  if (typeof received !== 'string') return false;
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  if (receivedBytes.length !== expectedBytes.length) return false;
  return crypto.timingSafeEqual(receivedBytes, expectedBytes);
}

function sendJson(
  response: http.ServerResponse,
  status: number,
  payload: unknown,
): void {
  if (response.writableEnded) return;
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isErrno(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function chmodIfSupported(filePath: string, mode: number): void {
  try {
    fs.chmodSync(filePath, mode);
  } catch {
    // Windows and some filesystems do not implement POSIX modes.
  }
}
