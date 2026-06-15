#!/usr/bin/env node

/**
 * Coverage gap analysis: compare unit test and integration test coverage
 * to identify which code paths are covered by each test type.
 *
 * Uses unit test function coverage as the primary metric since it's accurate.
 * Integration test V8 coverage in Electron lacks block-level detail, so line
 * coverage from integration tests is approximate (tends toward 100%).
 *
 * Usage: node scripts/coverage-gap.mjs
 *
 * Reads:
 *   coverage/coverage-final.json              (Jest unit test coverage)
 *   coverage/integration-coverage-final.json   (Playwright integration coverage)
 *
 * Outputs a text table showing per-file coverage breakdown.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import istanbulLibCoverage from 'istanbul-lib-coverage';

const { createCoverageMap } = istanbulLibCoverage;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const UNIT_COVERAGE_PATH = path.join(
  REPO_ROOT,
  'coverage',
  'coverage-final.json',
);
const INTEGRATION_COVERAGE_PATH = path.join(
  REPO_ROOT,
  'coverage',
  'integration-coverage-final.json',
);

function loadCoverage(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  // Filter out node_modules
  const filtered = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.includes('/node_modules/')) {
      filtered[key] = value;
    }
  }
  return createCoverageMap(filtered);
}

function analyze() {
  const unitCoverage = loadCoverage(UNIT_COVERAGE_PATH);
  const integrationCoverage = loadCoverage(INTEGRATION_COVERAGE_PATH);

  if (!unitCoverage && !integrationCoverage) {
    console.error('No coverage files found. Run tests first.');
    process.exit(1);
  }

  // Get all files from both coverage maps (src/ only)
  const allFiles = new Set();
  if (unitCoverage) {
    for (const file of unitCoverage.files()) {
      allFiles.add(file);
    }
  }
  if (integrationCoverage) {
    for (const file of integrationCoverage.files()) {
      allFiles.add(file);
    }
  }

  const srcFiles = [...allFiles]
    .filter((f) => f.includes('/src/') && !f.includes('/node_modules/'))
    .sort();

  if (srcFiles.length === 0) {
    console.log('No source files found in coverage data.');
    return;
  }

  console.log('\n' + '='.repeat(90));
  console.log('COVERAGE GAP ANALYSIS: Unit Tests vs Integration Tests');
  console.log('='.repeat(90));
  console.log('');
  console.log(
    'NOTE: Integration test line coverage is approximate (V8 in Electron',
  );
  console.log(
    'lacks block-level detail). Unit test function coverage is accurate.',
  );
  console.log('');

  let totalUnitFuncs = 0;
  let totalUnitFuncsCovered = 0;
  let totalUnitStmts = 0;
  let totalUnitStmtsCovered = 0;
  let totalIntStmts = 0;
  let totalIntStmtsCovered = 0;

  for (const file of srcFiles) {
    const unitHasFile = unitCoverage && unitCoverage.files().includes(file);
    const intHasFile =
      integrationCoverage && integrationCoverage.files().includes(file);

    const unitData = unitHasFile
      ? unitCoverage.fileCoverageFor(file)?.data
      : null;
    const intData = intHasFile
      ? integrationCoverage.fileCoverageFor(file)?.data
      : null;

    // Unit test: accurate function and statement coverage
    const unitFnMap = unitData?.fnMap || {};
    const unitF = unitData?.f || {};
    const unitS = unitData?.s || {};

    const unitFnTotal = Object.keys(unitFnMap).length;
    const unitFnCovered = Object.values(unitF).filter((v) => v > 0).length;
    const unitStmtTotal = Object.keys(unitS).length;
    const unitStmtCovered = Object.values(unitS).filter((v) => v > 0).length;

    // Integration test: approximate statement coverage
    const intS = intData?.s || {};
    const intStmtTotal = Object.keys(intS).length;
    const intStmtCovered = Object.values(intS).filter((v) => v > 0).length;

    totalUnitFuncs += unitFnTotal;
    totalUnitFuncsCovered += unitFnCovered;
    totalUnitStmts += unitStmtTotal;
    totalUnitStmtsCovered += unitStmtCovered;
    totalIntStmts += intStmtTotal;
    totalIntStmtsCovered += intStmtCovered;

    const shortPath = file.replace(/^.*\/src\//, 'src/');
    const unitFnPct =
      unitFnTotal > 0 ? ((unitFnCovered / unitFnTotal) * 100).toFixed(0) : '-';
    const unitStPct =
      unitStmtTotal > 0
        ? ((unitStmtCovered / unitStmtTotal) * 100).toFixed(0)
        : '-';
    const intStPct =
      intStmtTotal > 0
        ? ((intStmtCovered / intStmtTotal) * 100).toFixed(0)
        : '-';

    console.log(
      `  ${shortPath.padEnd(50)} Unit: ${unitFnPct.padStart(3)}% fn / ${unitStPct.padStart(3)}% st  |  Int: ${intStPct.padStart(3)}% st`,
    );
  }

  console.log('\n' + '-'.repeat(90));
  console.log('SUMMARY');
  console.log('-'.repeat(90));
  const unitFnPct =
    totalUnitFuncs > 0
      ? ((totalUnitFuncsCovered / totalUnitFuncs) * 100).toFixed(1)
      : '0.0';
  const unitStPct =
    totalUnitStmts > 0
      ? ((totalUnitStmtsCovered / totalUnitStmts) * 100).toFixed(1)
      : '0.0';
  const intStPct =
    totalIntStmts > 0
      ? ((totalIntStmtsCovered / totalIntStmts) * 100).toFixed(1)
      : '0.0';
  console.log(
    `  Unit test:        ${totalUnitFuncsCovered}/${totalUnitFuncs} functions (${unitFnPct}%)  |  ${totalUnitStmtsCovered}/${totalUnitStmts} statements (${unitStPct}%)`,
  );
  console.log(
    `  Integration test: ~${totalIntStmtsCovered}/${totalIntStmts} statements (~${intStPct}%)  (approximate)`,
  );
  console.log('='.repeat(90) + '\n');
}

analyze();
