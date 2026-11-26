import fs from 'node:fs';
import path from 'node:path';
import {
  SEED_MODULES,
  SEED_MODULE_SOURCE_PATHS,
  buildScenarioHashInput,
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

function readScenario(script: string): string {
  return fs.readFileSync(path.join(SCENARIOS_DIR, script), 'utf8');
}

/** Seed modules a scenario script imports, by id. */
function importedSeedModules(script: string): Set<string> {
  const ids = new Set<string>();
  const pattern = /from\s+'\.\/seeds\/([a-z-]+)(?:\.ts)?'/g;
  for (const match of script.matchAll(pattern)) ids.add(match[1]);
  return ids;
}

/** Seed maps a scenario script stages through Object.entries(...). */
function stagedSeedImports(script: string): Set<string> {
  const importedNames = new Set<string>();
  for (const match of script.matchAll(
    /import\s*\{([^}]*)\}\s*from\s+'\.\/seeds\/[a-z-]+(?:\.ts)?'/g,
  )) {
    for (const raw of match[1].split(',')) {
      const name = raw.trim();
      if (name) importedNames.add(name);
    }
  }

  const staged = new Set<string>();
  for (const match of script.matchAll(/Object\.entries\(\s*([^)]*?)\s*\)/g)) {
    const arg = match[1].trim();
    // The staging expressions are all `Object.entries(SOME_SEEDS)`. Anything
    // else (a slice, a spread with an inline map) would silently escape this
    // guard, so fail loudly instead of guessing.
    if (!/^[A-Za-z_$][\w$]*$/.test(arg)) {
      throw new Error(
        `Unrecognized seed staging expression: Object.entries(${arg})`,
      );
    }
    staged.add(arg);
  }

  // Only seed imports count; helpers are staged elsewhere or not at all.
  return new Set([...staged].filter((name) => importedNames.has(name)));
}

describe('seed module registry', () => {
  it('claims every exported seed module in at least one scenario', () => {
    const claimed = new Set(
      Object.values(SCENARIOS).flatMap((def) => [...def.seeds]),
    );
    expect([...claimed].sort()).toEqual(Object.keys(SEED_MODULES).sort());
  });

  it('gives every seed module a source path that exists', () => {
    for (const [id, rel] of Object.entries(SEED_MODULE_SOURCE_PATHS)) {
      expect({
        id,
        exists: fs.existsSync(path.join(SCENARIOS_DIR, rel)),
      }).toEqual({ id, exists: true });
    }
  });

  it('declares at least one seed module per scenario', () => {
    for (const [id, def] of Object.entries(SCENARIOS)) {
      expect({ id, seeds: def.seeds.length > 0 }).toEqual({ id, seeds: true });
    }
  });

  it('hashes exactly the seed sources the scenario declares', () => {
    for (const [id, def] of Object.entries(SCENARIOS)) {
      const input = buildScenarioHashInput(id, (rel) =>
        fs.readFileSync(path.join(SCENARIOS_DIR, rel), 'utf8'),
      );
      const declared = def.seeds
        .map((seedId) => SEED_MODULE_SOURCE_PATHS[seedId])
        .sort();
      expect({
        id,
        seedSources: Object.keys(input.sources)
          .filter((rel) => rel.startsWith('seeds/'))
          .sort(),
      }).toEqual({ id, seedSources: declared });
    }
  });

  it('stages exactly the seed modules each scenario declares', () => {
    for (const [id, def] of Object.entries(SCENARIOS)) {
      const script = readScenario(def.script);
      expect({ id, imported: [...importedSeedModules(script)].sort() }).toEqual(
        {
          id,
          imported: [...def.seeds].sort(),
        },
      );
    }
  });

  it('characterizes the semantic staged vault for every scenario', () => {
    // A content record, not the generated images: dates normalized so the
    // snapshot is stable across capture days, paths sorted so key order cannot
    // masquerade as a change. Any staged note edit shows up here even when the
    // hash tests would still pass.
    const records: Record<string, Record<string, string>> = {};
    for (const id of Object.keys(SCENARIOS)) {
      const seeds = resolveScenarioSeeds(id);
      records[id] = Object.fromEntries(
        Object.keys(seeds)
          .sort()
          .map((vaultPath) => [
            vaultPath,
            seeds[vaultPath]
              // `orgClosedDate` writes the weekday beside the date, and that
              // weekday follows the capture day — normalize both or the
              // snapshot fails tomorrow.
              .replace(
                /\[(\d{4}-\d{2}-\d{2}) (Sun|Mon|Tue|Wed|Thu|Fri|Sat)\]/g,
                '[YYYY-MM-DD Ddd]',
              )
              .replace(/\d{4}-\d{2}-\d{2}/g, 'YYYY-MM-DD'),
          ]),
      );
    }
    const serialized = JSON.stringify(records);
    expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(serialized).not.toMatch(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\]/);
    expect(records).toMatchSnapshot();
  });

  it('stages every seed map it imports, and imports every map it stages', () => {
    for (const [id, def] of Object.entries(SCENARIOS)) {
      const script = readScenario(def.script);
      expect({
        id,
        staged: stagedSeedImports(script).size,
        imports: importedSeedModules(script).size,
      }).toEqual({ id, staged: def.seeds.length, imports: def.seeds.length });
    }
  });
});
