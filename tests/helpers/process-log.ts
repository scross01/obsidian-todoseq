import fs from 'fs';
import type { ChildProcess } from 'child_process';

/**
 * Captures a launched Obsidian process's stdio and exit status to a log file.
 *
 * The integration harness launches Obsidian with `stdio: 'ignore'` so a chatty
 * Electron process cannot fill a pipe and block. That also means a renderer
 * crash is completely silent: the test fails with "Target page, context or
 * browser has been closed" and the report contains an empty snapshot with no
 * indication of why. This helper trades that silence for a durable log —
 * stdio is read from the pipes (so nothing blocks) and written to a file.
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
  note(message: string): void; /**
   * Truncate the log and forget the recorded exit state.
   *
   * Called at the start of each launch. Without it a previous run's failure
   * sits above the current run's header, and a reader chasing a crash reads
   * last run's stderr instead of this one's.
   */
  reset(): void;
  /** Last `maxChars` characters of the log; '' if nothing has been logged. */
  tail(maxChars?: number): string;
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

  function write(text: string): void {
    fs.mkdirSync(pathDir(filePath), { recursive: true });
    fs.appendFileSync(filePath, text);
  }

  function capture(
    stream: NodeJS.ReadableStream | null,
    label: 'stdout' | 'stderr',
  ): void {
    if (!stream) return;
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      // A child killed mid-write can emit EPIPE/EBADF here; losing a chunk of
      // crash output is acceptable, throwing out of the handler is not.
      try {
        const lines = chunk.split('\n');
        for (const [index, line] of lines.entries()) {
          const isLast = index === lines.length - 1;
          if (atLineStart[label] && line !== '') {
            write(`[${label}] `);
          }
          write(line);
          if (!isLast) {
            write('\n');
            atLineStart[label] = true;
          } else {
            atLineStart[label] = line === '';
          }
        }
      } catch {
        // Ignore: the log is diagnostics, never the reason a test fails.
      }
    });
    stream.on('error', () => {
      // Same rationale as above.
    });
  }

  return {
    filePath,

    attach(child: ChildProcess) {
      capturedPid = child.pid;
      write(
        `--- launch header ${new Date().toISOString()} pid=${child.pid} ---\n`,
      );
      capture(child.stdout, 'stdout');
      capture(child.stderr, 'stderr');

      child.on('exit', (code, signal) => {
        record = { code, signal };
        write(`--- ${formatExit(record)} pid=${capturedPid} ---\n`);
      });

      child.on('error', (err: Error) => {
        spawnError = err.message;
        write(`--- ${formatExit(record, spawnError)} pid=${capturedPid} ---\n`);
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

    reset() {
      record = null;
      spawnError = undefined;
      capturedPid = undefined;
      atLineStart.stdout = true;
      atLineStart.stderr = true;
      try {
        fs.mkdirSync(pathDir(filePath), { recursive: true });
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
