/**
 * Dependency-complete hash inputs for one screenshot scenario.
 *
 * capture.ts originally hashed the scenario script plus the shared helpers
 * module, and the helpers held every seed map — so editing the dashboard notes
 * marked the settings screenshot stale too. This module narrows that: seed
 * maps live in scenarios/seeds/<id>.ts and a scenario hashes only the modules
 * it declares in registry.ts, plus their resolved vault content.
 *
 * Kept free of capture.ts's module-level `main()` so tests exercise the same
 * builder the driver calls.
 */
import type { ScenarioHashInput } from './manifest.ts';
import { HELPERS_FILE, SCENARIOS, type SeedModuleId } from './registry.ts';
import { ARCHIVE_SEEDS } from './scenarios/seeds/archive.ts';
import { COLLAPSE_SEEDS } from './scenarios/seeds/collapse.ts';
import { DASHBOARD_SEEDS } from './scenarios/seeds/dashboard.ts';
import { DEMO_SEEDS } from './scenarios/seeds/demo.ts';
import { EDITOR_SEEDS } from './scenarios/seeds/editor.ts';
import { EMBED_SEEDS } from './scenarios/seeds/embed.ts';
import { SEARCH_FILTER_SEEDS } from './scenarios/seeds/search-filter.ts';
import { TASK_ENTRY_SEEDS } from './scenarios/seeds/task-entry.ts';
import { WARNING_PERIOD_SEEDS } from './scenarios/seeds/warning-period.ts';

/** Vault path → note content. */
export type SeedContent = Record<string, string>;

/** Every seed module, keyed by the id registry.ts declares. */
export const SEED_MODULES: Record<SeedModuleId, SeedContent> = {
  demo: DEMO_SEEDS,
  'search-filter': SEARCH_FILTER_SEEDS,
  editor: EDITOR_SEEDS,
  embed: EMBED_SEEDS,
  'task-entry': TASK_ENTRY_SEEDS,
  dashboard: DASHBOARD_SEEDS,
  archive: ARCHIVE_SEEDS,
  'warning-period': WARNING_PERIOD_SEEDS,
  collapse: COLLAPSE_SEEDS,
};

/**
 * Source path of each module, relative to scenarios/.
 *
 * These are hash-input keys, so they are stable names rather than absolute
 * paths; the scenario script's own file uses its basename for the same reason.
 */
export const SEED_MODULE_SOURCE_PATHS: Record<SeedModuleId, string> = {
  demo: 'seeds/demo.ts',
  'search-filter': 'seeds/search-filter.ts',
  editor: 'seeds/editor.ts',
  embed: 'seeds/embed.ts',
  'task-entry': 'seeds/task-entry.ts',
  dashboard: 'seeds/dashboard.ts',
  archive: 'seeds/archive.ts',
  'warning-period': 'seeds/warning-period.ts',
  collapse: 'seeds/collapse.ts',
};

/** Source path for a module id, rejecting ids the registry does not know. */
export function seedModuleSourcePath(moduleId: string): string {
  const rel = (SEED_MODULE_SOURCE_PATHS as Record<string, string>)[moduleId];
  if (!rel) throw new Error(`Unknown seed module "${moduleId}".`);
  return rel;
}

/**
 * Merge seed maps the way a scenario stages them.
 *
 * Rejects a module that does not exist, and two modules contributing different
 * content for the same vault path: either would make the hash describe
 * something other than what the capture stages. Identical content is fine,
 * because the staged vault would be unchanged.
 */
export function mergeSeedModules(
  moduleIds: readonly string[],
  modules: Record<string, SeedContent> = SEED_MODULES,
): SeedContent {
  const merged: SeedContent = {};
  for (const moduleId of moduleIds) {
    const map = modules[moduleId];
    if (!map) throw new Error(`Unknown seed module "${moduleId}".`);
    for (const [vaultPath, content] of Object.entries(map)) {
      const existing = merged[vaultPath];
      if (existing !== undefined && existing !== content) {
        throw new Error(
          `Conflicting seed content for "${vaultPath}" in seed modules ${moduleIds.join(', ')}.`,
        );
      }
      merged[vaultPath] = content;
    }
  }
  return merged;
}

/** The resolved seed vault a scenario's declared modules stage. */
export function resolveScenarioSeeds(
  scenarioId: string,
  modules: Record<string, SeedContent> = SEED_MODULES,
): SeedContent {
  const def = SCENARIOS[scenarioId];
  if (!def) throw new Error(`Unknown scenario "${scenarioId}".`);
  return mergeSeedModules(def.seeds, modules);
}

/**
 * Build the manifest hash input for a scenario.
 *
 * Sources are the scenario script, the shared helpers, and exactly the seed
 * modules the scenario declares. The resolved seed content carries the dates
 * the capture day produces; the source text carries the relative offset
 * arguments, which date normalization would otherwise erase (`orgDate(1)` and
 * `orgDate(2)` normalize to the same placeholder).
 */
export function buildScenarioHashInput(
  scenarioId: string,
  readScenarioSource: (relativePath: string) => string,
): ScenarioHashInput {
  const def = SCENARIOS[scenarioId];
  if (!def) throw new Error(`Unknown scenario "${scenarioId}".`);

  const sources: Record<string, string> = {
    [def.script]: readScenarioSource(def.script),
    [HELPERS_FILE]: readScenarioSource(HELPERS_FILE),
  };
  for (const moduleId of def.seeds) {
    const rel = seedModuleSourcePath(moduleId);
    sources[rel] = readScenarioSource(rel);
  }

  return {
    id: scenarioId,
    sources,
    seed: resolveScenarioSeeds(scenarioId),
  };
}
