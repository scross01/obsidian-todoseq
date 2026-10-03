import fs from 'fs';
import type { ChildProcess } from 'child_process';

/**
 * Captures a launched Obsidian process's stdio and exit status to a log file.
 *
 * The launcher used to spawn Obsidian with `stdio: 'ignore'`, which kept a
 * chatty Electron process from filling a pipe and blocking — and discarded
 * everything the process said about itself, so a launch that failed or exited
 * unexpectedly left only "Obsidian CDP not available after 60000ms". The pipes
 * are now written here instead: still drained, so nothing blocks, but recorded.
 *
 * What it does NOT do: explain a renderer crash. A killed renderer writes
 * nothing to either stream (measured — killing one produced zero bytes), so
 * "Target page, context or browser has been closed" still arrives with no
 * explanation. The value here is the main process's own output and exit status.
 *
 * Node-only, with no Obsidian or Playwright imports, so it can be unit tested
 * without a running app.
 */

/** How the child process finished, as reported by Node's exit events. */
export interface ExitRecord {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface ProcessLog {
  /** Path being written to. */
  readonly filePath: string;
  /** Mirror a child's stdout/stderr into the log and track how it ends. */
  attach(child: ChildProcess): void;
  /** One-line human summary of the child's state, for error messages. */
  describeExit(): string;
  /**
   * True only when the process never started (spawn error). A process that ran
   * and then died is not a spawn failure, and waiting on its CDP port is still
   * worth doing.
   */
  hasFailedToSpawn(): boolean;
  /** Record a harness-side event (a kill, a launch failure) in the log. */
  note(message: string): void;
  /**
   * Truncate the log, forget the recorded exit state, and stop the previous
   * launch's handlers writing into it.
   *
   * Called at the start of each launch. Without it a previous run's failure
   * sits above the current run's header, and a reader chasing a crash reads
   * last run's stderr instead of this one's. 'error' handlers — on the streams
   * and on the child — are kept deliberately, never removed; see capture()
   * and attach().
   */
  reset(): void;
  /** Last `maxChars` characters of the log; '' if nothing has been logged. */
  tail(maxChars?: number): string;
  /**
   * Append a block of child output, prefixing each line with its stream label
   * and writing the whole block in one append. The launcher reaches this
   * through `attach`; it is exposed so tests can assert on the line splitting
   * and the write count without standing up a child process.
   */
  writeChunk(label: 'stdout' | 'stderr', text: string): void;
}

/** Default cap on the log excerpt embedded in an error message. */
const DEFAULT_TAIL_CHARS = 2000;

/**
 * Describe a child's exit for a human reading a test failure.
 *
 * `null` for the record means "no exit observed yet". `spawnError` is separate
 * because a failed spawn emits 'error' and never emits 'exit' — without this
 * branch, a missing binary reads as "still running" and the caller waits out
 * the full CDP timeout before saying anything useful.
 */
export function formatExit(
  record: ExitRecord | null,
  spawnError?: string,
): string {
  if (spawnError) return `failed to spawn: ${spawnError}`;
  if (!record) return 'still running';
  if (record.signal) return `exited on signal ${record.signal}`;
  if (record.code !== null) return `exited with code ${record.code}`;
  return 'exited with an unknown status';
}

/**
 * Create a process log backed by `filePath`, creating the parent directory if
 * needed. Appends within a launch, so multiple writes land in one file; call
 * `reset()` to start a fresh one.
 */
export function createProcessLog(filePath: string): ProcessLog {
  let record: ExitRecord | null = null;
  let spawnError: string | undefined;
  // Captured alongside the state so every line can be attributed: the launch
  // header, the exit, and the notes all name the pid they belong to. Needed
  // because globalSetup and the restart project run in separate Node processes
  // writing one file, so a record can surface next to another launch's output.
  let capturedPid: number | undefined;
  // Chunks do not align to line boundaries, so a half-written line would get
  // mislabelled if we prefixed every chunk. Track whether a newline is owed.
  const atLineStart = { stdout: true, stderr: true };
  // The output dir is created once per ProcessLog, not per chunk. Piping the
  // child's stdio makes this handler hot, and a recursive mkdir on every line
  // is thousands of syscalls per run for a directory that already exists.
  let dirEnsured = false;
  // Per-launch teardown, run by reset(). Two different jobs: stream 'data'
  // listeners are unsubscribed, while child exit/error handlers are only
  // silenced — never removed, because they live on an emitter the child owns.
  // See capture() and attach().
  let detachers: Array<() => void> = [];

  function ensureDir(): void {
    if (dirEnsured) return;
    fs.mkdirSync(pathDir(filePath), { recursive: true });
    dirEnsured = true;
  }

  function write(text: string): void {
    try {
      ensureDir();
      fs.appendFileSync(filePath, text);
    } catch {
      // The log is diagnostics, never the reason a test fails. Losing output
      // is acceptable; throwing out of a stdio handler is not.
    }
  }

  /**
   * Append a chunk of child output, labelling each line and buffering it into
   * a single append. One file write per chunk, not per line — the difference
   * between one open/write/close and five for a chatty Electron process.
   */
  function writeChunk(label: 'stdout' | 'stderr', chunk: string): void {
    const lines = chunk.split('\n');
    const out: string[] = [];
    for (const [index, line] of lines.entries()) {
      const isLast = index === lines.length - 1;
      if (atLineStart[label] && line !== '') {
        out.push(`[${label}] `);
      }
      out.push(line);
      if (!isLast) {
        out.push('\n');
        atLineStart[label] = true;
      } else {
        atLineStart[label] = line === '';
      }
    }
    write(out.join(''));
  }

  function capture(
    stream: NodeJS.ReadableStream | null,
    label: 'stdout' | 'stderr',
  ): void {
    if (!stream) return;
    stream.setEncoding('utf8');
    const onData = (chunk: string) => {
      // A child killed mid-write can emit EPIPE/EBADF here; losing a chunk of
      // crash output is acceptable, throwing out of the handler is not.
      writeChunk(label, chunk);
    };
    // Deliberately never detached. A stream with no 'error' listener rethrows
    // as an uncaught exception, and this stream outlives reset() — the child
    // still owns it — so removing this handler would convert a lost chunk of
    // log into a killed test worker.
    const onError = () => {
      // Same rationale as above.
    };
    stream.on('data', onData);
    stream.on('error', onError);
    // `reset` detaches only 'data': 'exit' fires before the pipes finish
    // draining, so a superseded launch can still emit output afterwards. That
    // output belongs to the launch the truncate just discarded, and would land
    // in the new launch's log carrying only a bare [stdout]/[stderr] — no pid to
    // attribute it with, and no guarantee it lands above the new header rather
    // than below it, where it reads as the current launch's own output.
    detachers.push(() => stream.off('data', onData));
  }

  return {
    filePath,

    attach(child: ChildProcess) {
      // Per-child rather than shared: reset() silences the superseded child
      // while the next attach() activates its own. A flag held on the
      // ProcessLog would be set true again by that attach, reviving handlers
      // belonging to a process the truncate just discarded.
      let live = true;
      // Closed over rather than read from `capturedPid` at event time, so a
      // record can never be stamped with another launch's pid.
      const pid = child.pid;
      capturedPid = pid;
      write(`--- launch header ${new Date().toISOString()} pid=${pid} ---\n`);
      capture(child.stdout, 'stdout');
      capture(child.stderr, 'stderr');

      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        if (!live) return;
        record = { code, signal };
        write(`--- ${formatExit(record)} pid=${pid} ---\n`);
      };

      const onError = (err: Error) => {
        if (!live) return;
        spawnError = err.message;
        write(`--- ${formatExit(record, spawnError)} pid=${pid} ---\n`);
      };

      // Never detached — a ChildProcess is an EventEmitter with the same rule
      // as its streams, and an 'error' with no listener rethrows as an
      // uncaught exception. Node emits 'error' for "the process could not be
      // killed", and killSpawned() resolves on its SIGKILL timeout without
      // waiting for the exit, so a superseded child can still emit one — and a
      // bare emitter would take the Playwright worker down with it.
      child.on('exit', onExit);
      child.on('error', onError);
      // reset() silences these rather than unsubscribing them: the stale-exit
      // and stale-spawnError problems are solved by the `live` guard above,
      // and by this nothing is ever removed from an emitter we do not own.
      detachers.push(() => {
        live = false;
      });
    },

    describeExit() {
      return formatExit(record, spawnError);
    },

    hasFailedToSpawn() {
      return spawnError !== undefined;
    },

    note(message: string) {
      write(
        capturedPid === undefined
          ? `[note] ${message}\n`
          : `[note pid=${capturedPid}] ${message}\n`,
      );
    },

    writeChunk,

    reset() {
      // Stop the previous launch writing into the file before emptying it, so
      // a straggler cannot land in the next launch's log. Stream 'data'
      // listeners are unsubscribed; child exit/error handlers are silenced via
      // their `live` flag and stay attached, since the child still owns the
      // emitter and a bare one would rethrow.
      for (const teardown of detachers) {
        try {
          teardown();
        } catch {
          // The child is already gone and its streams torn down with it, so
          // there is nothing left to unsubscribe or silence.
        }
      }
      detachers = [];
      record = null;
      spawnError = undefined;
      capturedPid = undefined;
      atLineStart.stdout = true;
      atLineStart.stderr = true;
      try {
        ensureDir();
        fs.writeFileSync(filePath, '');
      } catch {
        // A log we cannot truncate still appends; nothing downstream depends
        // on the file being empty.
      }
    },

    tail(maxChars: number = DEFAULT_TAIL_CHARS): string {
      try {
        if (!fs.existsSync(filePath)) return '';
        return fs.readFileSync(filePath, 'utf8').slice(-maxChars);
      } catch {
        return '';
      }
    },
  };
}

/** Directory part of `p`, or '.' when it has none. */
function pathDir(p: string): string {
  const index = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return index <= 0 ? '.' : p.slice(0, index);
}
