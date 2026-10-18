/**
 * Bundle-size budget guard (report-only baseline with a generous ceiling).
 *
 * Obsidian loads the whole plugin bundle on every app start, so bundle size
 * is a startup-cost input. The ceiling is deliberately generous (~+24%
 * headroom over the recorded baseline) so this stays silent unless something
 * genuinely large lands — the same "quiet unless actually wrong" principle
 * the repo's screenshot staleness check uses.
 *
 * Skips quietly when no build artifact exists (fresh checkout without
 * `npm run build`); CI builds before running unit tests, so the guard is
 * active there. Re-measure with: gzip -c main.js | wc -c
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const REPO_ROOT = path.resolve(__dirname, '..');
const MAIN_JS = path.join(REPO_ROOT, 'main.js');
const STYLES_CSS = path.join(REPO_ROOT, 'styles.css');

/** ~+24% headroom over the recorded baseline gzip (see failure message). */
const GZIP_CEILING_BYTES = 175 * 1024;

function gzipBytes(file: string): number {
  return zlib.gzipSync(fs.readFileSync(file)).length;
}

const hasBuild = fs.existsSync(MAIN_JS);

(hasBuild ? describe : describe.skip)('bundle size budget', () => {
  it('gzip(main.js) stays under the ceiling', () => {
    const gz = gzipBytes(MAIN_JS);
    // Custom-message pattern: the failure names size, ceiling, and command.
    expect(
      gz > GZIP_CEILING_BYTES
        ? `FAIL gzip(main.js)=${gz}B exceeds ceiling=${GZIP_CEILING_BYTES}B ` +
            `(raw=${fs.statSync(MAIN_JS).size}B). ` +
            `Re-measure: gzip -c main.js | wc -c. ` +
            `If the growth is intentional, review it and raise the ceiling ` +
            `in tests/bundle-size.test.ts.`
        : 'ok',
    ).toBe('ok');
  });

  it('gzip(styles.css) stays under its ceiling', () => {
    const gz = gzipBytes(STYLES_CSS);
    const ceiling = 30 * 1024;
    expect(
      gz > ceiling
        ? `FAIL gzip(styles.css)=${gz}B exceeds ceiling=${ceiling}B. ` +
            `Re-measure: gzip -c styles.css | wc -c.`
        : 'ok',
    ).toBe('ok');
  });
});
