import { KeywordManager } from './keyword-manager';
import { CHECKBOX_DETECTION_REGEX } from './patterns';
import { getIndentLength } from './task-line-utils';
import type {
  StructuralEntry,
  StructuralEntryKind,
} from '../types/task-structure';

const QUOTE_PREFIX = /^((?:\s*>)+[ \t]*)/;
const MARKDOWN_HEADING = /^(#{1,6})[ \t]+(.*)$/;
const ORG_HEADING = /^(\*+)[ \t]+(.*)$/;
const LIST_PREFIX = /^(?:[-+*]|\d+[.)])[ \t]+/;
const CHECKBOX_PREFIX = /^\[([^\]])\][ \t]*/;
const DRAWER_OR_PROPERTY = /^:[A-Za-z0-9_-]+:/;
const DATE_METADATA = /^(SCHEDULED|DEADLINE|CLOSED|STARTED|DESCRIPTION):/;

function firstWord(value: string): string | undefined {
  return /^([^\s[\]]+)/.exec(value.trim())?.[1];
}

function keywordAtStart(
  value: string,
  keywordManager: KeywordManager,
): string | undefined {
  const word = firstWord(value);
  if (!word) return undefined;
  return keywordManager.getAllKeywords().includes(word) ? word : undefined;
}

function stripTaskPrefix(value: string): string {
  return value.replace(LIST_PREFIX, '').replace(CHECKBOX_PREFIX, '');
}

function splitQuote(value: string): { quote: string; rest: string } {
  const match = QUOTE_PREFIX.exec(value);
  if (!match) return { quote: '', rest: value };
  return { quote: match[1], rest: value.slice(match[1].length) };
}

function entry(
  kind: StructuralEntryKind,
  path: string,
  line: number,
  options: {
    indent?: string;
    quote?: string;
    headingLevel?: number;
    text?: string;
    checked?: boolean;
    archived?: boolean;
  } = {},
): StructuralEntry {
  const indent = options.indent ?? '';
  return {
    kind,
    path,
    line,
    indent,
    indentLength: getIndentLength(indent),
    quotePrefix: options.quote ?? '',
    ...(options.headingLevel !== undefined
      ? { headingLevel: options.headingLevel }
      : {}),
    ...(options.text !== undefined ? { text: options.text } : {}),
    ...(options.checked !== undefined ? { checked: options.checked } : {}),
    ...(options.archived ? { archived: true } : {}),
  };
}

/**
 * One bounded line pass. It publishes only lines that can change dependency
 * structure: headings (task and non-task), non-task prose, keywordless
 * checkboxes and archived task lines. Ordinary prose is only meaningful for
 * indented Markdown groups, so Org skips it.
 */
export function collectStructuralEntries(
  content: string,
  path: string,
  format: 'markdown' | 'org',
  keywordManager: KeywordManager,
): StructuralEntry[] {
  const lines = content.split('\n');
  return format === 'org'
    ? collectOrgEntries(lines, path, keywordManager)
    : collectMarkdownEntries(lines, path, keywordManager);
}

function collectMarkdownEntries(
  lines: string[],
  path: string,
  keywordManager: KeywordManager,
): StructuralEntry[] {
  const entries: StructuralEntry[] = [];
  let fence: string | null = null;
  let math = false;
  let comment = false;

  for (let line = 0; line < lines.length; line++) {
    const raw = lines[line];
    const trimmed = raw.trim();
    if (trimmed === '') continue;

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      const delimiter = trimmed.slice(0, 3);
      fence = fence === delimiter ? null : (fence ?? delimiter);
      continue;
    }
    if (trimmed === '$$') {
      math = !math;
      continue;
    }
    if (trimmed.startsWith('%%')) {
      // Single-line comment or a paired %% block.
      if (trimmed === '%%' || (trimmed.match(/%%/g)?.length ?? 0) === 1) {
        comment = !comment;
      }
      continue;
    }
    if (fence || math || comment) continue;

    const { quote, rest } = splitQuote(raw);
    const heading = MARKDOWN_HEADING.exec(rest);
    if (heading) {
      const text = heading[2].trim();
      const keyword = keywordAtStart(text, keywordManager);
      entries.push(
        entry('heading', path, line, {
          quote,
          headingLevel: heading[1].length,
          text,
          archived: keyword
            ? keywordManager.isArchived(keyword)
            : false,
        }),
      );
      continue;
    }

    const body = rest.trim();
    if (DRAWER_OR_PROPERTY.test(body) || DATE_METADATA.test(body)) continue;

    const indent = rest.slice(0, rest.length - rest.trimStart().length);
    const checkbox = CHECKBOX_DETECTION_REGEX.test(body);
    const keyword = keywordAtStart(stripTaskPrefix(body), keywordManager);

    if (checkbox && !keyword) {
      const glyph = /\[([^\]])\]/.exec(body)?.[1] ?? ' ';
      entries.push(
        entry('checkbox', path, line, {
          indent,
          quote,
          text: stripTaskPrefix(
            body.replace(CHECKBOX_DETECTION_REGEX, ''),
          ).trim(),
          checked: glyph.toLowerCase() === 'x',
        }),
      );
      continue;
    }

    if (keyword) {
      if (keywordManager.isArchived(keyword)) {
        entries.push(
          entry('archived', path, line, { indent, quote }),
        );
      }
      continue;
    }

    entries.push(entry('prose', path, line, { indent, quote }));
  }

  return entries;
}

function collectOrgEntries(
  lines: string[],
  path: string,
  keywordManager: KeywordManager,
): StructuralEntry[] {
  const entries: StructuralEntry[] = [];
  let sourceBlock = false;

  for (let line = 0; line < lines.length; line++) {
    const raw = lines[line];
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    if (/^#\+(?:BEGIN|END)_(?:SRC|EXAMPLE|COMMENT)/i.test(trimmed)) {
      sourceBlock = !sourceBlock;
      continue;
    }
    if (sourceBlock) continue;

    const heading = ORG_HEADING.exec(raw);
    if (heading) {
      const text = heading[2].trim();
      const keyword = keywordAtStart(text, keywordManager);
      entries.push(
        entry('heading', path, line, {
          headingLevel: heading[1].length,
          text,
          archived: keyword
            ? keywordManager.isArchived(keyword)
            : false,
        }),
      );
      continue;
    }

    const checkbox = /^(\s*)(?:[-+*]|\d+[.)])[ \t]+\[([ xX-])\]/.exec(raw);
    if (checkbox) {
      entries.push(
        entry('checkbox', path, line, {
          indent: checkbox[1],
          text: raw.slice(checkbox[0].length).trim(),
          checked: checkbox[2].toLowerCase() === 'x',
        }),
      );
    }
  }

  return entries;
}
