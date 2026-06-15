# Contributing to TODOseq

## Development

**Requirements**: Node.js and npm

**Scripts**:

- `npm run dev` — Run esbuild bundler in watch mode for development
- `npm run build` — Type-check and build for production
- `npm run test` — Run unit tests (Jest)
- `npm run test:integration` — Run integration tests (Playwright + real Obsidian instance)
- `npm run test:integration:fast` — Run integration tests without rebuild
- `npm run lint` — Run ESLint to check code style
- `npm run format` — Format code using Prettier
- `npm run docs:dev` — Run dynamic docs site for development
- `npm run docs:build` — Run VitePress to build production docs
- `npm run docs:preview` — Preview static production docs

## Integration Tests

Integration tests launch a real isolated Obsidian instance via Electron, connect over CDP (Chrome DevTools Protocol), and run Playwright tests against the actual plugin.

```bash
npm run test:integration       # build + run all tests
npm run test:integration:fast  # run without rebuild
npx playwright test --config=tests/integration/playwright.config.ts -g "test name"  # single test
```

Key details:

- Obsidian is launched with `--user-data-dir` pointing at an ephemeral fixtures directory for full isolation.
- A single Obsidian instance is shared across all test files via CDP on port 9333.
- The `obsidian-restart` project tests settings persistence across a real process restart.
- **No keyboard shortcuts** — all Obsidian commands are invoked via `page.evaluate(() => app.commands.executeCommandById(...))` to avoid triggering unintended actions.
- DOM selectors are version-specific (e.g. Obsidian 1.12+ uses `.vertical-tab-nav-item`, not `.vertical-tab-list-item`).

See `AGENTS.md` for the full list of critical gotchas and live debugging via CDP.

## GitHub Actions Workflow for VitePress

The workflow automates the entire process: installing dependencies, building the VitePress site, and deploying it to GitHub Pages.

## Contributing

Issues and pull requests are welcome. Please describe changes clearly and include steps to reproduce when filing bugs.

## AI

Multiple AI tools have been used with human guidance and oversight to assist in the development, documentation, and review of this plugin.

AI generated contributions are accepted, but should adhere to existing project structure and code style and must be fully tested and reviewed before submission.

## License

TODOseq is released under the [MIT License](LICENSE).
