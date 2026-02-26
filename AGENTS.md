# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## IMPORTANT

- **ALWAYS** consider the performance impact of any changes and prioritise performance without sacrificing functionality
- **REMEMBER** this is an Obsidian plugin and should be treated as such, it is not a generic web app.
- **DO NOT** use Unsafe assignment of an `any` value.
- **TEST DRIVEN DEVELOPMENT** write or update unit tests before making changes to the codebase.
- **DO NOT** use `console.log` for debugging, use `console.debug` instead.

## Build & Test

- **Build**: `npm run build`
- **Test**: `npm test`
- **Format**: `npm run format` - runs prettier on all files.
- **Lint**: `npm run lint` - run format first to reduce lint errors.
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
- **Task ordering**: `taskComparator` sorts by path then line; used consistently across all views (lines 173-176 in src/utils/task-sort.ts)
- **Editor refresh**: `refreshVisibleEditorDecorations()` uses `requestMeasure()` + `dispatch()` + `setTimeout` sequence to force decoration updates (lines 243-260 in src/main.ts)
- **Reader view refresh**: `refreshReaderViewFormatter()` iterates leaves and calls `previewMode.rerender(true)` (lines 167-182 in src/main.ts)
- **Regex caching**: `RegexCache` utility caches compiled regex patterns to avoid repeated compilation during vault scans and searches (src/utils/regex-cache.ts)

## Code Style

- **ESLint exceptions**: `@typescript-eslint/no-explicit-any` is "warn" (not error) for all files (line 48 in .eslintrc)
- **Import order**: Circular dependency handled between main plugin and parsers
