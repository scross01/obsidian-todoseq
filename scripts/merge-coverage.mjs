#!/usr/bin/env node

/**
 * Merge Jest (unit) and Playwright (integration) Istanbul coverage files,
 * then generate combined reports.
 *
 * Usage: node scripts/merge-coverage.mjs
 *
 * Reads:
 *   coverage/coverage-final.json              (Jest unit test coverage)
 *   coverage/integration-coverage-final.json   (Playwright integration coverage)
 *
 * Writes:
 *   coverage/merged-coverage-final.json        (merged Istanbul data)
 *   coverage/combined/                         (HTML + text + lcov reports)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import istanbulLibCoverage from 'istanbul-lib-coverage';
import istanbulLibReport from 'istanbul-lib-report';
import istanbulReports from 'istanbul-reports';

const { createCoverageMap } = istanbulLibCoverage;
const { createContext } = istanbulLibReport;

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
const MERGED_OUTPUT_PATH = path.join(
  REPO_ROOT,
  'coverage',
  'merged-coverage-final.json',
);
const REPORT_DIR = path.join(REPO_ROOT, 'coverage', 'combined');

function loadCoverage(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Coverage file not found (skipping): ${filePath}`);
    return null;
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  // Filter out node_modules — only keep our src/ files
  const filtered = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.includes('/node_modules/')) {
      filtered[key] = value;
    }
  }
  return createCoverageMap(filtered);
}

function merge() {
  const unitCoverage = loadCoverage(UNIT_COVERAGE_PATH);
  const integrationCoverage = loadCoverage(INTEGRATION_COVERAGE_PATH);

  if (!unitCoverage && !integrationCoverage) {
    console.error('No coverage files found. Run tests first.');
    process.exit(1);
  }

  // Create a fresh copy to avoid mutating the original maps
  const base = unitCoverage || integrationCoverage;
  const merged = createCoverageMap(base.toJSON());

  // Merge the other if present
  if (unitCoverage && integrationCoverage) {
    merged.merge(integrationCoverage);
  }

  // Write merged JSON
  fs.mkdirSync(path.dirname(MERGED_OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(
    MERGED_OUTPUT_PATH,
    JSON.stringify(merged.toJSON(), null, 2),
  );
  console.log(`Merged coverage → ${MERGED_OUTPUT_PATH}`);

  // Generate reports — clean previous run first
  fs.rmSync(REPORT_DIR, { recursive: true, force: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const context = createContext({
    dir: REPORT_DIR,
    coverageMap: merged,
    watermarks: {
      statements: [50, 80],
      functions: [50, 80],
      branches: [50, 80],
      lines: [50, 80],
    },
    sourceFinder: null,
  });

  // Text report for terminal
  const textReport = istanbulReports.create('text');
  textReport.execute(context);
  console.log('');

  // HTML report
  const htmlReport = istanbulReports.create('html');
  htmlReport.execute(context);

  // LCOV report
  const lcovReport = istanbulReports.create('lcov');
  lcovReport.execute(context);

  // JSON summary
  const jsonReport = istanbulReports.create('json');
  jsonReport.execute(context);

  console.log(`Combined reports → ${REPORT_DIR}/`);
}

merge();
