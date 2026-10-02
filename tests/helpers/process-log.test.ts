import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { formatExit, createProcessLog } from './process-log';

/** A script that keeps running until killed, so a signal exit can be tested. */
const SPIN = 'setInterval(() => {}, 1000)';

/** Wait for `child` to settle, then resolve with its exit record. */
function waitForExit(child: ReturnType<typeof spawn>): Promise<unknown> {
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

/** Give stream events a chance to land in the log before asserting on it. */
async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 100));
}

let tmpDir: string;
let logPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'process-log-test-'));
  logPath = path.join(tmpDir, 'obsidian-stderr.log');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('formatExit', () => {
  it('reports a still-running process', () => {
    expect(formatExit(null)).toBe('still running');
  });

  it('reports a clean exit', () => {
    expect(formatExit({ code: 0, signal: null })).toBe('exited with code 0');
  });

  it('reports a non-zero exit', () => {
    expect(formatExit({ code: 1, signal: null })).toBe('exited with code 1');
  });

  it('reports a signal death, which carries no exit code', () => {
    expect(formatExit({ code: null, signal: 'SIGSEGV' })).toBe(
      'exited on signal SIGSEGV',
    );
  });

  it('reports a failed spawn, which is neither an exit nor a signal', () => {
    expect(formatExit(null, 'spawn ENOENT')).toBe(
      'failed to spawn: spawn ENOENT',
    );
  });
});

describe('createProcessLog', () => {
  it('writes stdout and stderr to the log file, labelled', async () => {
    const log = createProcessLog(logPath);
    const child = spawn(process.execPath, [
      '-e',
      'console.log("from stdout"); console.error("from stderr");',
    ]);
    log.attach(child);

    await waitForExit(child);
    await settle();

    const contents = fs.readFileSync(logPath, 'utf8');
    expect(contents).toContain('[stdout] from stdout');
    expect(contents).toContain('[stderr] from stderr');
  });

  it('records the exit code of the child', async () => {
    const log = createProcessLog(logPath);
    const child = spawn(process.execPath, ['-e', 'process.exit(3);']);
    log.attach(child);

    await waitForExit(child);
    await settle();

    expect(log.describeExit()).toBe('exited with code 3');
  });

  it('records the signal when the child is killed', async () => {
    const log = createProcessLog(logPath);
    const child = spawn(process.execPath, ['-e', SPIN]);
    log.attach(child);

    // Let node boot so the kill lands on a live process, not a spawn race.
    await settle();
    child.kill('SIGTERM');

    await waitForExit(child);
    await settle();

    expect(log.describeExit()).toBe('exited on signal SIGTERM');
  });

  it('records a spawn failure, which emits no exit event at all', async () => {
    const log = createProcessLog(logPath);
    const child = spawn(path.join(tmpDir, 'not-a-real-binary'), []);
    log.attach(child);

    await new Promise((resolve) => child.once('error', resolve));
    await settle();

    // Without this, a missing binary reads as "still running" and the caller
    // waits out the full CDP timeout before saying anything useful.
    expect(log.describeExit()).toContain('failed to spawn');
    expect(log.describeExit()).toContain('ENOENT');
  });

  it('appends a launch header so two launches stay distinguishable', async () => {
    const first = createProcessLog(logPath);
    const firstChild = spawn(process.execPath, ['-e', 'process.exit(0);']);
    first.attach(firstChild);
    await waitForExit(firstChild);
    await settle();

    // The restart project launches a second instance against the same file.
    const second = createProcessLog(logPath);
    const secondChild = spawn(process.execPath, ['-e', 'process.exit(0);']);
    second.attach(secondChild);
    await waitForExit(secondChild);
    await settle();

    const contents = fs.readFileSync(logPath, 'utf8');
    expect(contents.match(/launch header/g)).toHaveLength(2);
    // The first launch's record survives the second.
    expect(contents).toContain('exited with code 0');
  });

  it('writes harness notes to the log', async () => {
    const log = createProcessLog(logPath);
    log.note('stopping Obsidian (SIGTERM)');

    expect(fs.readFileSync(logPath, 'utf8')).toContain(
      '[note] stopping Obsidian (SIGTERM)',
    );
  });

  it('tail returns the end of the log, capped', async () => {
    const log = createProcessLog(logPath);
    log.note('a'.repeat(100));
    log.note('last line');

    const tail = log.tail(40);
    expect(tail).toContain('last line');
    expect(tail.length).toBeLessThanOrEqual(40);
  });

  it('tail is empty when nothing has been logged', () => {
    expect(createProcessLog(logPath).tail()).toBe('');
  });

  it('reports a failed spawn so the caller need not wait it out', async () => {
    const log = createProcessLog(logPath);
    const child = spawn(path.join(tmpDir, 'not-a-real-binary'), []);
    log.attach(child);

    await new Promise((resolve) => child.once('error', resolve));
    await settle();

    expect(log.hasFailedToSpawn()).toBe(true);
  });

  it('does not report a failed spawn for a child that ran and exited', async () => {
    const log = createProcessLog(logPath);
    const child = spawn(process.execPath, ['-e', 'process.exit(1);']);
    log.attach(child);

    await waitForExit(child);
    await settle();

    expect(log.hasFailedToSpawn()).toBe(false);
  });

  it('reset drops the previous run so its findings cannot mislead', async () => {
    const stale = createProcessLog(logPath);
    stale.note('from a previous run');
    expect(fs.readFileSync(logPath, 'utf8')).toContain('from a previous run');

    createProcessLog(logPath).reset();

    expect(fs.readFileSync(logPath, 'utf8')).not.toContain(
      'from a previous run',
    );
  });

  it('attributes exit and note lines to the launch they belong to', async () => {
    const log = createProcessLog(logPath);
    const child = spawn(process.execPath, ['-e', 'process.exit(0);']);
    log.attach(child);
    await waitForExit(child);
    await settle();
    log.note('after exit');

    const contents = fs.readFileSync(logPath, 'utf8');
    // globalSetup and the restart project are separate Node processes writing
    // one file, so an exit record can surface next to another launch's output.
    // Without the pid the reader cannot tell whose exit they are looking at.
    const exitLine = contents
      .split('\n')
      .find((l) => l.includes('exited with code'));
    expect(exitLine).toContain(`pid=${child.pid}`);
    expect(
      contents.split('\n').find((l) => l.includes('after exit')),
    ).toContain(`pid=${child.pid}`);
  });

  it('reset clears the recorded exit state too', async () => {
    const log = createProcessLog(logPath);
    const child = spawn(process.execPath, ['-e', 'process.exit(7);']);
    log.attach(child);
    await waitForExit(child);
    await settle();
    expect(log.describeExit()).toBe('exited with code 7');

    log.reset();

    expect(log.describeExit()).toBe('still running');
    expect(log.hasFailedToSpawn()).toBe(false);
  });

  it('ignores output arriving after the child is gone', async () => {
    const log = createProcessLog(logPath);
    const child = spawn(process.execPath, ['-e', 'process.exit(0);']);
    log.attach(child);
    await waitForExit(child);

    // A late chunk must not throw EPIPE/EBADF out of the data handler, which
    // would surface as an unhandled error and mask the real failure.
    expect(() => log.note('late')).not.toThrow();
    expect(log.tail()).toContain('late');
  });
});
