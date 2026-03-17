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
- **Timezone independence**: Always use local time methods (`getFullYear()`, `getMonth()`, `getDate()`) when working with dates in tests. Never use `toISOString()` which returns UTC and causes test failures in timezones ahead of UTC.

## Architecture

- **REVIEW ARCHITECTURE.md** before making changes significant changes the codebase.
- **Single source of truth**: `TaskStateManager` maintains tasks; all views subscribe to changes
- **Parser lifecycle**: All parsers created in `PluginLifecycleManager` and registered with `ParserRegistry`; `VaultScanner` receives fully configured `ParserRegistry` via constructor
- **Event-driven**: `VaultScannerEvents` interface defines events; listeners stored in Map
- **Embedded lists**: `TodoseqCodeBlockProcessor` registers as markdown processor; separate from main plugin lifecycle
- **Update coordination**: `TaskUpdateCoordinator` provides single entry point for all state updates with optimistic UI updates
- **Recurrence management**: `RecurrenceCoordinator` coordinates delayed recurrence updates (3-second delay); `RecurrenceManager` handles recurrence date calculations
- **State transitions**: `TransitionParser` parses declarative state transition syntax; `TaskStateTransitionManager` manages state cycling
- **Context menus**: `TaskContextMenu` provides right-click task actions (priority, scheduled date, deadline, copy/move to today)

## Critical Patterns

- **Yield to event loop**: `yieldToEventLoop()` called during vault scans to prevent UI freezing
- **Task ordering**: `taskComparator` sorts by path then line; used consistently across all views
- **Editor refresh**: `refreshVisibleEditorDecorations()` uses `requestMeasure()` + `dispatch()` + `setTimeout` sequence to force decoration updates
- **Reader view refresh**: `refreshReaderViewFormatter()` iterates leaves and calls `previewMode.rerender(true)`
- **Regex caching**: `RegexCache` utility caches compiled regex patterns to avoid repeated compilation during vault scans and searches

## Mobile Compatibility

- **Optimistic update first**: When updating task state, always call `taskStateManager.optimisticUpdate()` SYNCHRONOUSLY before any async operations. This ensures UI updates even if mobile context is destroyed (e.g., command palette closes).
- **Bypass coordinator for mobile**: Use `taskEditor.updateTaskState()` directly instead of `taskUpdateCoordinator.updateTaskState()` for mobile-compatible state updates. The coordinator has a ChangeTracker that reads file content BEFORE the optimistic update - this await breaks on mobile.
- **Pattern to follow**: Use the same pattern as `handleSetPriorityAtLine` - synchronous optimistic update + async TaskEditor call.

## Code Style

- **ESLint exceptions**: `@typescript-eslint/no-explicit-any` is "warn" (not error) for all files (line 48 in .eslintrc)
- **Import order**: Circular dependency handled between main plugin and parsers
