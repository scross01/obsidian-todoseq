# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Build & Test

- **Build command**: `npm run build` runs TypeScript compilation + esbuild bundling in sequence (not parallel)
- **Single test**: `npm test -- --testNamePattern="pattern"` (Jest with regex match)
- **Coverage excludes**: `src/main.ts` excluded from coverage (line 9 in jest.config.json)
- **Test console**: Tests mock console methods to reduce noise (lines 21-28 in tests/test-setup.ts)

## Architecture

- **Single source of truth**: `TaskStateManager` maintains tasks; all views subscribe to changes
- **Parser lifecycle**: Parser created once in `VaultScanner` and reused; `recreateParser()` only called when settings change (lines 147-158 in src/main.ts)
- **Event-driven**: `VaultScannerEvents` interface defines events; listeners stored in Map (lines 12-18 in src/services/vault-scanner.ts)
- **Embedded lists**: `TodoseqCodeBlockProcessor` registers as markdown processor; separate from main plugin lifecycle
- **Update coordination**: `TaskUpdateCoordinator` provides single entry point for all state updates with optimistic UI updates (lines 27-50 in src/services/task-update-coordinator.ts)

## Critical Patterns

- **Yield to event loop**: `yieldToEventLoop()` called during vault scans to prevent UI freezing (lines 125-126 in src/services/vault-scanner.ts)
- **Task ordering**: `taskComparator` sorts by path then line; used consistently across all views (lines 173-176 in src/utils/task-utils.ts)
- **Editor refresh**: `refreshVisibleEditorDecorations()` uses `requestMeasure()` + `dispatch()` + `setTimeout` sequence to force decoration updates (lines 243-260 in src/main.ts)
- **Reader view refresh**: `refreshReaderViewFormatter()` iterates leaves and calls `previewMode.rerender(true)` (lines 167-182 in src/main.ts)

## Code Style

- **TypeScript rootDir**: "src" with test files explicitly excluded (line 18 in tsconfig.json)
- **ESLint exceptions**: `@typescript-eslint/no-explicit-any` is "warn" (not error) for all files (line 48 in .eslintrc)
- **Prettier**: Single quotes, 2-space tabs, 80 char width, trailing commas (lines 2-7 in .prettierrc)
- **Import order**: Circular dependency handled between main plugin and parsers
