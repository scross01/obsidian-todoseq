import { App, Editor, MarkdownView, TFile } from 'obsidian';
import { buildWikiLink, findWikiLinks } from '../utils/task-link';

/** One guarded token rewrite in one note. */
export interface TaskReferenceEdit {
  path: string;
  line: number;
  reference: string;
  replacement: string;
}

export interface TaskReferenceFailure {
  path: string;
  line: number;
  reference: string;
  reason: string;
}

export interface TaskReferenceRepairReport {
  path: string;
  applied: number;
  failed: TaskReferenceFailure[];
}

export interface TaskReferenceRepairOutcome {
  reports: TaskReferenceRepairReport[];
  failedEdits: TaskReferenceEdit[];
}

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\.md$/i, '');
}

/**
 * Find and repair references that point at one task block anchor.
 *
 * The inventory is one bounded vault pass per transfer, using cached reads and
 * a cheap `[[` pre-filter. Obsidian's metadata cache is used only to resolve a
 * link's note, so a disagreement between two indexes cannot arise. Non-task
 * notes are included because prose links and embeds break too.
 */
export class TaskReferenceService {
  constructor(private readonly app: App) {}

  async collectAnchorReferences(options: {
    sourcePath: string;
    anchor: string;
    destinationPath: string;
  }): Promise<TaskReferenceEdit[]> {
    const destinationTarget = normalizePath(options.destinationPath);
    const edits: TaskReferenceEdit[] = [];

    for (const file of this.listTextFiles()) {
      // The two notes a transfer just changed must be read fresh: the cache can
      // still describe the pre-transfer file while our own write settles.
      const fresh =
        file.path === options.sourcePath ||
        file.path === options.destinationPath;
      const text = await this.readText(file, fresh);
      if (!text.includes('[[')) continue;
      const lines = text.split('\n');
      for (let line = 0; line < lines.length; line++) {
        if (!lines[line].includes('[[')) continue;
        for (const token of findWikiLinks(lines[line])) {
          if (!token.anchor || !token.anchor.startsWith('^')) continue;
          if (token.anchor.slice(1) !== options.anchor) continue;
          if (
            !this.resolvesTo(token.target, file.path, options.sourcePath)
          ) {
            continue;
          }
          const replacement = buildWikiLink(
            token.embed,
            destinationTarget,
            token.anchor,
            token.alias,
          );
          if (replacement === token.raw) continue;
          edits.push({
            path: file.path,
            line,
            reference: token.raw,
            replacement,
          });
        }
      }
    }

    return edits;
  }

  /**
   * Apply edits through the live editor buffer or one atomic vault write per
   * file. A line is rewritten only while it still contains the recorded token;
   * everything else on the line is preserved byte-for-byte.
   */
  async apply(
    edits: readonly TaskReferenceEdit[],
  ): Promise<TaskReferenceRepairOutcome> {
    const byPath = new Map<string, TaskReferenceEdit[]>();
    for (const edit of edits) {
      const list = byPath.get(edit.path) ?? [];
      list.push(edit);
      byPath.set(edit.path, list);
    }

    const reports: TaskReferenceRepairReport[] = [];
    const failedEdits: TaskReferenceEdit[] = [];

    for (const [path, pathEdits] of byPath) {
      const report: TaskReferenceRepairReport = {
        path,
        applied: 0,
        failed: [],
      };
      reports.push(report);

      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) {
        report.failed.push(
          ...pathEdits.map((edit) => ({
            path,
            line: edit.line,
            reference: edit.reference,
            reason: 'The note could not be found.',
          })),
        );
        failedEdits.push(...pathEdits);
        continue;
      }

      const editor = this.getEditor(file);
      if (editor) {
        const lines = Array.from({ length: editor.lineCount() }, (_, i) =>
          editor.getLine(i),
        );
        const failed = this.rewriteLines(lines, path, pathEdits, report);
        if (report.applied > 0) {
          const last = editor.lineCount() - 1;
          editor.replaceRange(
            lines.join('\n'),
            { line: 0, ch: 0 },
            { line: last, ch: (editor.getLine(last) ?? '').length },
          );
        }
        failedEdits.push(...failed);
        continue;
      }

      try {
        const working: TaskReferenceRepairReport = {
          path,
          applied: 0,
          failed: [],
        };
        let failed: TaskReferenceEdit[] = [];
        await this.app.vault.process(file, (data) => {
          const lines = data.split('\n');
          failed = this.rewriteLines(lines, path, pathEdits, working);
          return lines.join('\n');
        });
        report.applied = working.applied;
        report.failed = working.failed;
        failedEdits.push(...failed);
      } catch {
        report.failed.push(
          ...pathEdits.map((edit) => ({
            path,
            line: edit.line,
            reference: edit.reference,
            reason: 'The note could not be written.',
          })),
        );
        failedEdits.push(...pathEdits);
      }
    }

    return { reports, failedEdits };
  }

  private rewriteLines(
    lines: string[],
    path: string,
    edits: readonly TaskReferenceEdit[],
    report: TaskReferenceRepairReport,
  ): TaskReferenceEdit[] {
    const failed: TaskReferenceEdit[] = [];
    for (const edit of edits) {
      const original = lines[edit.line];
      if (typeof original !== 'string' || !original.includes(edit.reference)) {
        report.failed.push({
          path,
          line: edit.line,
          reference: edit.reference,
          reason: 'The reference is no longer at its recorded location.',
        });
        failed.push(edit);
        continue;
      }
      lines[edit.line] = original.replace(edit.reference, edit.replacement);
      report.applied++;
    }
    return failed;
  }

  private listTextFiles(): TFile[] {
    const files = this.app.vault.getFiles?.() ?? [];
    return files.filter(
      (file) =>
        /\.(md|org)$/i.test(file.path) && !file.path.startsWith('.obsidian/'),
    );
  }

  private getEditor(file: TFile): Editor | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.file?.path !== file.path) return null;
    return view.editor ?? null;
  }

  private async readText(file: TFile, fresh = false): Promise<string> {
    try {
      const editor = this.getEditor(file);
      if (editor) {
        const lines: string[] = [];
        for (let i = 0; i < editor.lineCount(); i++) {
          lines.push(editor.getLine(i));
        }
        return lines.join('\n');
      }
      if (fresh) return await this.app.vault.read(file);
      return await (this.app.vault.cachedRead
        ? this.app.vault.cachedRead(file)
        : this.app.vault.read(file));
    } catch {
      return '';
    }
  }

  private resolvesTo(
    linkTarget: string,
    linkSourcePath: string,
    expectedPath: string,
  ): boolean {
    const cache = this.app.metadataCache as
      | {
          getFirstLinkpathDest?: (
            linkpath: string,
            sourcePath: string,
          ) => { path: string } | null;
        }
      | undefined;
    const resolved = cache?.getFirstLinkpathDest?.(
      linkTarget,
      linkSourcePath,
    );
    if (resolved?.path) return resolved.path === expectedPath;

    const target = normalizePath(linkTarget);
    const expected = normalizePath(expectedPath);
    if (target === expected) return true;
    const basename = expected.split('/').pop() ?? expected;
    return target === basename || expected.endsWith(`/${target}`);
  }
}
