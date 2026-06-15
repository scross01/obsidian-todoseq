#!/usr/bin/env node

/**
 * Convert V8 coverage output from Playwright integration tests to Istanbul format.
 *
 * Usage: node scripts/convert-v8-to-istanbul.mjs
 *
 * Reads:  coverage/integration-v8.json  (from Profiler.takePreciseCoverage)
 * Writes: coverage/integration-coverage-final.json (Istanbul coverage-final.json format)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import v8toIstanbul from 'v8-to-istanbul';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const V8_COVERAGE_PATH = path.join(
  REPO_ROOT,
  'coverage',
  'integration-v8.json',
);
const BUNDLE_PATH = path.join(REPO_ROOT, 'main.js');
const MANIFEST_PATH = path.join(REPO_ROOT, 'manifest.json');
const OUTPUT_PATH = path.join(
  REPO_ROOT,
  'coverage',
  'integration-coverage-final.json',
);

/**
 * Read the plugin ID from manifest.json to avoid hardcoding.
 */
function getPluginId() {
  try {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    return manifest.id;
  } catch {
    console.warn(
      '[convert] Could not read manifest.json, using fallback plugin ID',
    );
    return 'todoseq';
  }
}

/**
 * Extract inline source map from a JS file.
 * Returns null if the source map is missing or malformed.
 */
function extractInlineSourceMap(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(
      /\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)\s*$/,
    );
    if (!match) return null;
    return JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
  } catch (err) {
    console.error(
      `[convert] Failed to parse source map from ${filePath}: ${err.message}`,
    );
    return null;
  }
}

async function convert() {
  if (!fs.existsSync(V8_COVERAGE_PATH)) {
    console.error(
      `V8 coverage file not found: ${V8_COVERAGE_PATH}\nRun integration tests first.`,
    );
    process.exit(1);
  }

  if (!fs.existsSync(BUNDLE_PATH)) {
    console.error(
      `Bundle file not found: ${BUNDLE_PATH}\nRun build:debug first.`,
    );
    process.exit(1);
  }

  const v8Coverage = JSON.parse(fs.readFileSync(V8_COVERAGE_PATH, 'utf8'));
  const sourceMap = extractInlineSourceMap(BUNDLE_PATH);
  const bundleSource = fs.readFileSync(BUNDLE_PATH, 'utf8');
  const pluginId = getPluginId();
  const pluginUrl = `plugin:${pluginId}`;

  // CDP format: { result: [...] }, Playwright format: [...]
  const scripts = Array.isArray(v8Coverage)
    ? v8Coverage
    : v8Coverage.result || v8Coverage;

  const istanbulCoverage = {};
  let matchedScripts = 0;

  for (const script of scripts) {
    const url = script.url || '';

    // Only process the plugin bundle
    const isPlugin = url === pluginUrl || url.includes('main.js');
    if (!isPlugin) {
      continue;
    }
    matchedScripts++;

    const source = script.source || bundleSource;

    const converter = v8toIstanbul(BUNDLE_PATH, 0, {
      source,
      ...(sourceMap ? { sourceMap: { sourcemap: sourceMap } } : {}),
    });

    await converter.load();
    converter.applyCoverage(script.functions || []);
    const istanbulData = converter.toIstanbul();

    // Merge into single coverage object, excluding node_modules
    for (const [filePath, coverage] of Object.entries(istanbulData)) {
      if (!filePath.includes('/node_modules/')) {
        istanbulCoverage[filePath] = coverage;
      }
    }
    converter.destroy();
  }

  if (matchedScripts === 0) {
    console.warn(
      `[convert] No scripts matched plugin URL "${pluginUrl}" or "main.js". ` +
        `Available URLs: ${scripts
          .slice(0, 5)
          .map((s) => s.url)
          .join(', ')}...`,
    );
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(istanbulCoverage, null, 2));

  const fileCount = Object.keys(istanbulCoverage).length;
  console.log(
    `Converted V8 coverage → Istanbul: ${fileCount} source file(s) → ${OUTPUT_PATH}`,
  );
}

convert().catch((err) => {
  console.error('V8-to-Istanbul conversion failed:', err);
  process.exit(1);
});
