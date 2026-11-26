import fs from 'node:fs';
import path from 'node:path';
import { computeScenarioHash } from '../scripts/screenshots/manifest';
import {
  SEED_MODULES,
  buildScenarioHashInput,
  mergeSeedModules,
  resolveScenarioSeeds,
} from '../scripts/screenshots/scenario-inputs';
import { SCENARIOS } from '../scripts/screenshots/registry';

const SCENARIOS_DIR = path.resolve(
  __dirname,
  '..',
  'scripts',
  'screenshots',
  'scenarios',
);

/** The real pipeline reader: scenario-relative path → file contents. */
function realReader(rel: string): string {
  return fs.readFileSync(path.join(SCENARIOS_DIR, rel), 'utf8');
}

/** A reader that replaces one file's text and otherwise reads the repo. */
function readerWith(rel: string, text: string) {
  return (requested: string): string =>
    requested === rel ? text : realReader(requested);
}

/**
 * Narrowing the seed hash is only worth anything if the dependency set is
 * exact: a scenario must be invalidated by its own seeds and sources, and by
 * nothing else. These tests use the builder capture.ts calls, so the seam
 * cannot drift from the driver.
 */
describe('scenario hash inputs', () => {
  it('hashes the script, the shared helpers, and exactly the declared seed modules', () => {
    const input = buildScenarioHashInput('docs-editor', realReader);
    expect(Object.keys(input.sources).sort()).toEqual([
      'editor.ts',
      'helpers.ts',
      'seeds/demo.ts',
      'seeds/editor.ts',
    ]);
    expect(input.seed).toEqual(resolveScenarioSeeds('docs-editor'));
  });

  it('leaves a scenario unchanged when another scenario’s seed source changes', () => {
    const base = buildScenarioHashInput('docs-task-list', realReader);
    const changed = buildScenarioHashInput(
      'docs-task-list',
      readerWith('seeds/search-filter.ts', 'export const EDITED = true;'),
    );
    expect(computeScenarioHash(changed)).toBe(computeScenarioHash(base));
  });

  it('leaves a scenario unchanged when another scenario’s seed content changes', () => {
    const edited = {
      ...SEED_MODULES,
      'search-filter': {
        ...SEED_MODULES['search-filter'],
        'Backlog.md': 'edited elsewhere',
      },
    };
    expect(resolveScenarioSeeds('docs-task-list', edited)).toEqual(
      resolveScenarioSeeds('docs-task-list'),
    );
  });

  it('invalidates a scenario when its own seed source changes', () => {
    const base = buildScenarioHashInput('docs-task-list', realReader);
    const changed = buildScenarioHashInput(
      'docs-task-list',
      readerWith('seeds/demo.ts', 'export const DEMO_SEEDS = {};'),
    );
    expect(computeScenarioHash(changed)).not.toBe(computeScenarioHash(base));
  });

  it('invalidates a scenario when its own resolved seed content changes', () => {
    const base = buildScenarioHashInput('docs-task-list', realReader);
    const changed = {
      ...base,
      seed: { ...base.seed, 'Project Phoenix.md': 'changed seed text' },
    };
    expect(computeScenarioHash(changed)).not.toBe(computeScenarioHash(base));
  });

  it('invalidates every scenario when the shared helpers change', () => {
    const edited = readerWith(
      'helpers.ts',
      realReader('helpers.ts') + '\nexport const EDITED = true;\n',
    );
    for (const scenarioId of Object.keys(SCENARIOS)) {
      const base = computeScenarioHash(
        buildScenarioHashInput(scenarioId, realReader),
      );
      const changed = computeScenarioHash(
        buildScenarioHashInput(scenarioId, edited),
      );
      expect({ scenarioId, changed }).not.toEqual({
        scenarioId,
        changed: base,
      });
    }
  });

  it('detects a relative-offset edit even when the resolved dates are identical', () => {
    // The regression that date normalization alone cannot catch: orgDate(1)
    // and orgDate(2) resolve to different ISO strings today, but both collapse
    // to the same placeholder. The source text is what carries the offset.
    const one = buildScenarioHashInput(
      'docs-task-list',
      readerWith(
        'seeds/demo.ts',
        "export const DEMO_SEEDS = { 'A.md': orgDate(1) };",
      ),
    );
    const two = buildScenarioHashInput(
      'docs-task-list',
      readerWith(
        'seeds/demo.ts',
        "export const DEMO_SEEDS = { 'A.md': orgDate(2) };",
      ),
    );
    expect(one.seed).toEqual(two.seed);
    expect(computeScenarioHash(one)).not.toBe(computeScenarioHash(two));
  });

  it('does not drift when resolved dates advance with the calendar', () => {
    const today = buildScenarioHashInput('docs-task-list', realReader);
    const tomorrow = {
      ...today,
      seed: Object.fromEntries(
        Object.entries(today.seed).map(([p, content]) => [
          p,
          content.replace(/\d{4}-\d{2}-\d{2}/g, '2099-01-01'),
        ]),
      ),
    };
    expect(computeScenarioHash(tomorrow)).toBe(computeScenarioHash(today));
  });

  it('is order-independent over source and seed keys', () => {
    const input = buildScenarioHashInput('docs-editor', realReader);
    const reversed = {
      ...input,
      sources: Object.fromEntries(Object.entries(input.sources).reverse()),
      seed: Object.fromEntries(Object.entries(input.seed).reverse()),
    };
    expect(computeScenarioHash(reversed)).toBe(computeScenarioHash(input));
  });

  it('rejects an unknown scenario instead of hashing nothing', () => {
    expect(() => buildScenarioHashInput('docs-nope', realReader)).toThrow(
      /docs-nope/,
    );
  });

  it('rejects a declared seed module that does not exist', () => {
    expect(() =>
      mergeSeedModules(['demo', 'not-a-module'], SEED_MODULES),
    ).toThrow(/not-a-module/);
  });

  it('rejects conflicting content for the same vault path', () => {
    expect(() =>
      mergeSeedModules(['a', 'b'], {
        a: { 'Note.md': 'one' },
        b: { 'Note.md': 'two' },
      }),
    ).toThrow(/Note\.md/);
  });

  it('accepts duplicate vault paths when the content agrees', () => {
    expect(
      mergeSeedModules(['a', 'b'], {
        a: { 'Note.md': 'same' },
        b: { 'Note.md': 'same' },
      }),
    ).toEqual({ 'Note.md': 'same' });
  });
});
