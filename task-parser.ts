import { Task, DEFAULT_COMPLETED_STATES, DEFAULT_PENDING_STATES, DEFAULT_ACTIVE_STATES } from './task';
import { TodoTrackerSettings } from "./settings";

type RegexPair = { test: RegExp; capture: RegExp };

export class TaskParser {
  private readonly testRegex: RegExp;
  private readonly captureRegex: RegExp;
  private readonly includeCodeBlocks: boolean;

  private constructor(regex: RegexPair, includeCodeBlocks: boolean) {
    this.testRegex = regex.test;
    this.captureRegex = regex.capture;
    this.includeCodeBlocks = includeCodeBlocks;
  }

  static create(settings: TodoTrackerSettings): TaskParser {
    const keywords = (settings.taskKeywords && settings.taskKeywords.length > 0)
      ? settings.taskKeywords
      : [...DEFAULT_PENDING_STATES, ...DEFAULT_ACTIVE_STATES, ...DEFAULT_COMPLETED_STATES];
    const regex = TaskParser.buildRegex(keywords);
    return new TaskParser(regex, !!settings.includeCodeBlocks);
  }

  static buildRegex(keywords: string[]): RegexPair {
    const escaped = keywords
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const listMarkerPart = `(?:(?:[-*+]|\\d+[.)]|[A-Za-z][.)]|\\([A-Za-z0-9]+\\))\\s+)?`;
    const test = new RegExp(`^[ \\t]*${listMarkerPart}(?:${escaped})\\s+`);
    const capture = new RegExp(`^([ \\t]*)(${listMarkerPart})?(${escaped})\\s+`);
    return { test, capture };
  }

  isTask(line: string): boolean {
    return this.testRegex.test(line);
  }

  // Parse a single file content into Task[], pure and stateless w.r.t. external app
  parseFile(content: string, path: string): Task[] {
    const lines = content.split('\n');

    // Fence state
    let inFence = false;
    let fenceMarker: '`' | '~' | null = null;

    const tasks: Task[] = [];

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];

      // Update fence state and skip delimiter lines
      const toggled = this.toggleFenceIfDelimiter(line, inFence, fenceMarker);
      if (toggled.didToggle) {
        inFence = toggled.inFence;
        fenceMarker = toggled.fenceMarker;
        continue;
      }

      if (inFence && !this.includeCodeBlocks) {
        continue;
      }

      if (!this.isTask(line)) continue;

      const m = this.captureRegex.exec(line);
      if (!m) continue;

      const indent = m[1] ?? '';
      const listMarker = (m[2] ?? '') as string;
      const state = m[3] ?? '';
      const afterPrefix = line.slice(m[0].length);

      // Priority parsing: first occurrence wins, then remove it preserving spacing semantics
      let priority: 'high' | 'med' | 'low' | null = null;
      const priMatch = /(\s*)\[#([ABC])\](\s*)/.exec(afterPrefix);
      let cleanedText = afterPrefix;
      if (priMatch) {
        const letter = priMatch[2];
        if (letter === 'A') priority = 'high';
        else if (letter === 'B') priority = 'med';
        else if (letter === 'C') priority = 'low';

        const before = cleanedText.slice(0, priMatch.index);
        const after = cleanedText.slice(priMatch.index + priMatch[0].length);
        cleanedText = (before + ' ' + after).replace(/[ \t]+/g, ' ').trimStart();
      }

      const text = cleanedText;

      tasks.push({
        path,
        line: index,
        rawText: line,
        indent,
        listMarker,
        text,
        state,
        completed: DEFAULT_COMPLETED_STATES.has(state),
        priority,
      });
    }

    return tasks;
  }

  // Pure fence delimiter tracker: detects ``` or ~~~ at start (with indent), toggles when matching opener char.
  private toggleFenceIfDelimiter(
    line: string,
    inFence: boolean,
    fenceMarker: '`' | '~' | null
  ): { didToggle: boolean; inFence: boolean; fenceMarker: '`' | '~' | null } {
    const fenceMatch = /^[ \t]*(`{3,}|~{3,})/.exec(line);
    if (!fenceMatch) {
      return { didToggle: false, inFence, fenceMarker };
    }
    const markerRun = fenceMatch[1];
    const currentMarker: '`' | '~' = markerRun[0] === '`' ? '`' : '~';
    if (!inFence) {
      return { didToggle: true, inFence: true, fenceMarker: currentMarker };
    } else {
      if (fenceMarker === currentMarker) {
        return { didToggle: true, inFence: false, fenceMarker: null };
      }
      // Different fence char while inside: ignore as plain text
      return { didToggle: false, inFence, fenceMarker };
    }
  }
}