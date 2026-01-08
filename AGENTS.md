# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project-Specific Non-Obvious Information

### Build System

- **Custom build process**: `npm run build` runs `tsc --noEmit src/main.ts --skipLibCheck && node esbuild.config.mjs production`
- **TypeScript compilation**: Uses `--noEmit` flag to skip output generation, relying on esbuild for final bundle
- **Development mode**: `npm run dev` uses esbuild.config.mjs without production optimizations

### Testing

- **Jest configuration**: Tests are in `/tests` directory with `.test.ts` extension
- **Test utilities**: Global test setup in `tests/test-setup.ts` provides shared registry and regex builder
- **Coverage**: Excludes `src/main.ts` from coverage reporting (line 19 in jest.config.json)
- **Mock console**: Tests mock console methods to reduce noise (lines 14-20 in tests/test-setup.ts)

### Architecture

- **Obsidian plugin structure**: Main plugin class in `src/main.ts` extends `Plugin`
- **Task parsing**: Complex regex-based parsing in `src/parser/` with language-aware handling
- **State management**: Tasks use state transitions defined in `NEXT_STATE` map in `src/task.ts`
- **Event handling**: File changes trigger incremental updates, not full rescans

### Critical Patterns

- **Parser recreation**: Parser must be recreated when settings change via `recreateParser()` method
- **Task comparator**: Shared `taskComparator` ensures consistent task ordering across views
- **Yielding**: `yieldToEventLoop()` prevents UI freezing during large vault scans
- **Error handling**: File operations wrapped in try/catch with fallback UI refreshes

### Code Style (Non-Standard)

- **Prettier config**: include `.prettierrc` for specific formatting rules
- **Editor config**: include `.editorconfig` for indentation and spacing settings
- **ESLint exceptions**: `@typescript-eslint/no-explicit-any`: "warn" (not error)
- **TypeScript config**: `rootDir`: "src" with explicit exclusion of test files
- **Import structure**: Circular dependency handling between main plugin and parsers

### Documentation

- **User documentation**: `README.md` and `/docs/` contains user-facing guides for features and usage patterns
- **Technical documentation**: Inline code comments and README files in subdirectories

### Gotchas

- **Task state parsing**: Priority extraction uses regex `[#ABC]` pattern with specific spacing rules
- **File scanning**: Only processes `.md` files, skips other extensions
- **View refresh**: Uses "lighter refresh" pattern to avoid focus stealing in Obsidian UI
