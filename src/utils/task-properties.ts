import type {
  TaskPropertyIssue,
  TaskPropertyIssueCode,
  TaskPropertyKey,
} from '../types/task';
import { isDrawerEndLine } from './block-anchor';
import { getIndentLength } from './task-line-utils';

/**
 * Task properties supported by TODOseq. Other Org properties are preserved in
 * source but never modeled, so adding a supported key is an explicit parser
 * and writer change.
 */
export const SUPPORTED_TASK_PROPERTY_KEYS = [
  'ID',
  'BLOCKER',
  'ARCHIVED_BLOCKER',
  'ORDERED',
  'NOBLOCKING',
] as const;

export type SupportedTaskProperty = TaskPropertyKey;

export type { TaskPropertyIssue, TaskPropertyIssueCode };

export interface TaskPropertyEntry {
  /** Authored key, including a terminal `+` append marker. */
  key: string;
  /** Canonical supported key, or null for preserved unknown data. */
  canonicalKey: SupportedTaskProperty | null;
  baseKey: string;
  append: boolean;
  value: string;
  line: number;
  startIndex: number;
  endIndex: number;
  valueStart: number;
  valueEnd: number;
  quotePrefix: string;
  indent: string;
}

export interface TaskPropertiesDrawer {
  startLine: number;
  endLine: number;
  closed: boolean;
  entries: TaskPropertyEntry[];
  issues: TaskPropertyIssue[];
}

export interface ParsedTaskProperties {
  properties?: Partial<Record<SupportedTaskProperty, string>>;
  id?: string;
  blockedBy?: string[];
  archivedBlockers?: string[];
  ordered?: boolean;
  noblocking?: boolean;
  propertyIssues?: TaskPropertyIssue[];
}

export type DependencyReference =
  | { kind: 'id'; raw: string; id: string }
  | {
      kind: 'markdown-anchor';
      raw: string;
      path: string;
      anchor: string;
    }
  | { kind: 'previous-sibling'; raw: 'previous-sibling' }
  | { kind: 'invalid'; raw: string; reason: string };

export interface DependencyToken {
  raw: string;
  reference: DependencyReference;
}

interface MetadataParts {
  quotePrefix: string;
  indent: string;
  body: string;
}

const PROPERTY_LINE = /^([ \t]*):([^:\s]+):(?:[ \t]*(.*))?$/;
const MARKDOWN_METADATA = /^([ \t]*)((?:>[ \t]*)*)(.*)$/;

function splitMetadataLine(
  line: string,
  format: 'markdown' | 'org',
): MetadataParts {
  if (format === 'org') {
    const indent = line.match(/^[ \t]*/)?.[0] ?? '';
    return {
      quotePrefix: '',
      indent,
      body: line.slice(indent.length),
    };
  }

  const match = MARKDOWN_METADATA.exec(line);
  if (!match) {
    return { quotePrefix: '', indent: '', body: line };
  }
  return {
    quotePrefix: match[2] ?? '',
    indent: match[1] ?? '',
    body: match[3] ?? '',
  };
}

function quotePart(indent: string): string {
  return indent.match(/(?:>[ \t]*)+/)?.[0] ?? '';
}

/**
 * True when a line can begin a properties drawer for this task. Org callers
 * still enforce the legal entry-header position separately.
 */
export function isPropertiesDrawerStart(
  line: string,
  format: 'markdown' | 'org',
  taskIndent?: string,
): boolean {
  const parts = splitMetadataLine(line, format);
  if (parts.body.trim() !== ':PROPERTIES:') return false;
  if (taskIndent === undefined || format === 'org') return true;

  const taskQuote = quotePart(taskIndent);
  if (taskQuote && !parts.quotePrefix.startsWith(taskQuote)) return false;
  if (!taskQuote && parts.quotePrefix.trim() !== '') return false;

  const taskWhitespace = taskQuote
    ? taskIndent.slice(0, taskIndent.indexOf(taskQuote))
    : taskIndent;
  const isHeadingIndent = /^#{1,6}\s+$/.test(taskIndent);
  const taskIndentLength = isHeadingIndent
    ? 0
    : getIndentLength(taskWhitespace);
  return getIndentLength(parts.indent) >= taskIndentLength;
}

export function isPropertiesDrawerEnd(
  line: string,
  format: 'markdown' | 'org',
): boolean {
  return isDrawerEndLine(splitMetadataLine(line, format).body, format);
}

/**
 * Parse one Org property line. A naked `:KEY:` outside a drawer is ordinary
 * prose, so callers only invoke this inside a recognized drawer.
 */
export function parsePropertyLine(
  line: string,
  lineIndex: number,
  format: 'markdown' | 'org',
): TaskPropertyEntry | null {
  const parts = splitMetadataLine(line, format);
  const match = PROPERTY_LINE.exec(parts.body);
  if (!match) return null;

  const indent = match[1] ?? '';
  const authoredKey = match[2] ?? '';
  const value = match[3] ?? '';
  const append = authoredKey.endsWith('+');
  const keyWithoutMarker = append ? authoredKey.slice(0, -1) : authoredKey;
  if (keyWithoutMarker.length === 0) return null;

  const canonicalKey = SUPPORTED_TASK_PROPERTY_KEYS.includes(
    keyWithoutMarker.toUpperCase() as SupportedTaskProperty,
  )
    ? (keyWithoutMarker.toUpperCase() as SupportedTaskProperty)
    : null;

  const valueStart = parts.quotePrefix.length + match[0].length - value.length;

  return {
    key: authoredKey,
    canonicalKey,
    baseKey: keyWithoutMarker.toUpperCase(),
    append,
    value: value.trim(),
    line: lineIndex,
    startIndex: 0,
    endIndex: line.length,
    valueStart: Math.min(valueStart, line.length),
    valueEnd: line.length,
    quotePrefix: parts.quotePrefix,
    indent,
  };
}

/**
 * Bounded drawer read. Unknown keys and blank lines are preserved. Scanning
 * stops before the first boundary line when the drawer is unclosed, so a
 * child task or prose line is never consumed as property data.
 */
export function readTaskPropertiesDrawer(
  lines: string[],
  startIndex: number,
  format: 'markdown' | 'org',
  options?: {
    taskIndent?: string;
    allowAnyIndent?: boolean;
    isBoundary?: (line: string) => boolean;
  },
): TaskPropertiesDrawer | null {
  if (
    startIndex < 0 ||
    startIndex >= lines.length ||
    !isPropertiesDrawerStart(lines[startIndex], format)
  ) {
    return null;
  }

  if (
    !options?.allowAnyIndent &&
    options?.taskIndent !== undefined &&
    !isPropertiesDrawerStart(lines[startIndex], format, options.taskIndent)
  ) {
    return null;
  }

  const entries: TaskPropertyEntry[] = [];
  const issues: TaskPropertyIssue[] = [];
  let lastConsumed = startIndex;

  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (isPropertiesDrawerEnd(line, format)) {
      return {
        startLine: startIndex,
        endLine: i,
        closed: true,
        entries,
        issues,
      };
    }

    if (line.trim() === '') {
      lastConsumed = i;
      continue;
    }

    const entry = parsePropertyLine(line, i, format);
    if (entry) {
      entries.push(entry);
      lastConsumed = i;
      continue;
    }

    // Legacy drawers sometimes contain planning lines or a property-like
    // line missing its leading colon. They are drawer content, never parsed
    // as task dates, and must remain byte-preserved. A task boundary still
    // stops the drawer so a child can never be swallowed.
    if (!options?.isBoundary?.(line) && line.includes(':')) {
      lastConsumed = i;
      continue;
    }

    issues.push({
      code: 'malformed-drawer',
      line: i,
      message: 'Properties drawer is not closed before task content.',
    });
    return {
      startLine: startIndex,
      endLine: lastConsumed,
      closed: false,
      entries,
      issues,
    };
  }

  issues.push({
    code: 'malformed-drawer',
    line: startIndex,
    message: 'Properties drawer is not closed.',
  });
  return {
    startLine: startIndex,
    endLine: lastConsumed,
    closed: false,
    entries,
    issues,
  };
}

/**
 * Split a BLOCKER value into dependency tokens. Whitespace separates tokens,
 * except a balanced Markdown wiki link is one token even when its path has
 * spaces. A malformed link is kept whole so it cannot become accidental IDs.
 */
export function tokenizeDependencyValue(
  value: string,
  format: 'markdown' | 'org',
): DependencyToken[] {
  const tokens: DependencyToken[] = [];
  let i = 0;

  while (i < value.length) {
    while (i < value.length && /\s/.test(value[i])) i++;
    if (i >= value.length) break;

    let raw: string;
    if (value.startsWith('![[', i)) {
      const close = value.indexOf(']]', i + 3);
      if (close < 0) {
        raw = value.slice(i).trim();
        i = value.length;
      } else {
        raw = value.slice(i, close + 2);
        i = close + 2;
      }
    } else if (value.startsWith('[[', i)) {
      const close = value.indexOf(']]', i + 2);
      if (close < 0) {
        raw = value.slice(i).trim();
        i = value.length;
      } else {
        raw = value.slice(i, close + 2);
        i = close + 2;
      }
    } else {
      const start = i;
      while (i < value.length && !/\s/.test(value[i])) i++;
      raw = value.slice(start, i);
    }

    tokens.push({ raw, reference: parseDependencyReference(raw, format) });
  }

  return tokens;
}

export function parseDependencyReference(
  raw: string,
  format: 'markdown' | 'org',
): DependencyReference {
  if (raw === 'previous-sibling') {
    return { kind: 'previous-sibling', raw: 'previous-sibling' };
  }

  if (format === 'org') {
    if (raw.length === 0) {
      return { kind: 'invalid', raw, reason: 'Empty dependency reference.' };
    }
    return { kind: 'id', raw, id: raw };
  }

  if (raw.length === 0) {
    return { kind: 'invalid', raw, reason: 'Empty dependency reference.' };
  }
  if (raw.startsWith('[[') || raw.startsWith('![[')) {
    const match = /^\[\[([^[\]|]+)#\^([^[\]|\s]+)\]\]$/.exec(raw);
    if (!match) {
      return {
        kind: 'invalid',
        raw,
        reason: 'Use one file-qualified [[note#^anchor]] dependency link.',
      };
    }
    const path = match[1].trim();
    const anchor = match[2].trim();
    if (!path || !anchor) {
      return {
        kind: 'invalid',
        raw,
        reason: 'Dependency link needs a file path and block anchor.',
      };
    }
    return { kind: 'markdown-anchor', raw, path, anchor };
  }

  if (raw.startsWith('^')) {
    return {
      kind: 'invalid',
      raw,
      reason: 'Bare block anchors are not dependency references.',
    };
  }

  return { kind: 'id', raw, id: raw };
}

export interface DependencyValueParse {
  references: string[];
  issues: Array<{ reference: string; message: string }>;
}

export function parseDependencyValue(
  value: string,
  format: 'markdown' | 'org',
): DependencyValueParse {
  const references: string[] = [];
  const issues: Array<{ reference: string; message: string }> = [];
  const seen = new Set<string>();

  for (const token of tokenizeDependencyValue(value, format)) {
    if (token.reference.kind === 'invalid') {
      issues.push({
        reference: token.raw,
        message: token.reference.reason,
      });
      continue;
    }
    if (!seen.has(token.reference.raw)) {
      seen.add(token.reference.raw);
      references.push(token.reference.raw);
    }
  }

  return { references, issues };
}

export function serializeDependencyReferences(
  references: readonly string[],
): string {
  return references.join(' ');
}

function addUnique(target: string[], values: readonly string[]): void {
  const seen = new Set(target);
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      target.push(value);
    }
  }
}

/**
 * Extract only the supported keys from a bounded drawer. Unsupported keys
 * stay in source and never produce warnings merely for existing.
 */
export function extractTaskProperties(
  drawer: TaskPropertiesDrawer,
  format: 'markdown' | 'org',
): ParsedTaskProperties {
  const issues: TaskPropertyIssue[] = [...drawer.issues];
  const properties: Partial<Record<SupportedTaskProperty, string>> = {};
  let id: string | undefined;
  let blockedBy: string[] | undefined;
  let archivedBlockers: string[] | undefined;
  let blockedValue: string | undefined;
  let archivedValue: string | undefined;
  let ordered: boolean | undefined;
  let noblocking: boolean | undefined;

  const baseEntries = new Map<SupportedTaskProperty, TaskPropertyEntry[]>();
  const appendEntries = new Map<SupportedTaskProperty, TaskPropertyEntry[]>();

  for (const entry of drawer.entries) {
    if (!entry.canonicalKey) continue;
    const bucket = entry.append ? appendEntries : baseEntries;
    const list = bucket.get(entry.canonicalKey) ?? [];
    list.push(entry);
    bucket.set(entry.canonicalKey, list);
  }

  for (const [key, entries] of baseEntries) {
    if (entries.length > 1) {
      issues.push({
        code: 'duplicate-key',
        key,
        line: entries[1].line,
        message: `Duplicate :${key}: property. First value is used.`,
      });
    }
  }

  const idEntries = [
    ...(baseEntries.get('ID') ?? []),
    ...(appendEntries.get('ID') ?? []),
  ];
  if (idEntries.length > 0) {
    const rawId = idEntries[0].value.trim();
    if (!rawId || /\s/.test(rawId) || /^[\^[]/.test(rawId)) {
      issues.push({
        code: 'invalid-id',
        key: 'ID',
        line: idEntries[0].line,
        message: 'ID must be one non-empty identifier without whitespace.',
        reference: rawId,
      });
    } else {
      id = rawId;
      properties.ID = rawId;
    }
  }

  const readList = (
    key: 'BLOCKER' | 'ARCHIVED_BLOCKER',
  ): { refs: string[]; raw: string } => {
    const base = baseEntries.get(key) ?? [];
    const appended = appendEntries.get(key) ?? [];
    const refs: string[] = [];
    const rawParts: string[] = [];
    const source = [...base.slice(0, 1), ...appended];

    for (const entry of source) {
      rawParts.push(entry.value);
      const parsed = parseDependencyValue(entry.value, format);
      addUnique(refs, parsed.references);
      for (const issue of parsed.issues) {
        issues.push({
          code: 'invalid-reference',
          key,
          line: entry.line,
          message: issue.message,
          reference: issue.reference,
        });
      }
    }

    return { refs, raw: rawParts.filter(Boolean).join(' ') };
  };

  const blocked = readList('BLOCKER');
  if (
    (baseEntries.has('BLOCKER') || appendEntries.has('BLOCKER')) &&
    (blocked.refs.length > 0 || blocked.raw.length > 0)
  ) {
    blockedBy = blocked.refs;
    blockedValue = blocked.raw;
    properties.BLOCKER = blocked.raw;
  } else if (baseEntries.has('BLOCKER') || appendEntries.has('BLOCKER')) {
    blockedBy = [];
    blockedValue = '';
    properties.BLOCKER = '';
  }

  const archived = readList('ARCHIVED_BLOCKER');
  if (
    (baseEntries.has('ARCHIVED_BLOCKER') ||
      appendEntries.has('ARCHIVED_BLOCKER')) &&
    (archived.refs.length > 0 || archived.raw.length > 0)
  ) {
    archivedBlockers = archived.refs;
    archivedValue = archived.raw;
    properties.ARCHIVED_BLOCKER = archived.raw;
  } else if (
    baseEntries.has('ARCHIVED_BLOCKER') ||
    appendEntries.has('ARCHIVED_BLOCKER')
  ) {
    archivedBlockers = [];
    archivedValue = '';
    properties.ARCHIVED_BLOCKER = '';
  }

  const readSwitch = (key: 'ORDERED' | 'NOBLOCKING'): boolean | undefined => {
    const entries = [
      ...(baseEntries.get(key) ?? []).slice(0, 1),
      ...(appendEntries.get(key) ?? []),
    ];
    if (entries.length === 0) return undefined;
    const canonical = entries[entries.length - 1];
    properties[key] = canonical.value;
    return canonical.value.trim().toLowerCase() !== 'nil';
  };

  ordered = readSwitch('ORDERED');
  noblocking = readSwitch('NOBLOCKING');

  void blockedValue;
  void archivedValue;

  return {
    ...(Object.keys(properties).length > 0 ? { properties } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(blockedBy !== undefined ? { blockedBy } : {}),
    ...(archivedBlockers !== undefined ? { archivedBlockers } : {}),
    ...(ordered !== undefined ? { ordered } : {}),
    ...(noblocking !== undefined ? { noblocking } : {}),
    ...(issues.length > 0 ? { propertyIssues: issues } : {}),
  };
}
