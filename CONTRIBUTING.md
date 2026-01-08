# Contributing to TODOseq

## Development

**Requirements**: Node.js and npm

**Scripts**:

- `npm run dev` — Run esbuild bundler in watch mode for development
- `npm run build` — Type-check and build for production
- `npm run test` — Run unit tests
- `npm run lint` — Run ESLint to check code style
- `npm run format` — Format code using Prettier

**Git Hooks**:

This project includes a pre-commit hook that automatically runs the following checks:

- `npm run build` — Ensures the project builds successfully
- `npm run lint` — Checks for code style issues
- `npm run test` — Runs all unit tests
- `npm run format` — Verifies code formatting is correct

The hook only runs when relevant files (TypeScript, JavaScript, JSON) are staged for commit.

**Contributing**: Issues and pull requests are welcome. Please describe changes clearly and include steps to reproduce when filing bugs.

## AI

Multiple AI tools have been used with human guidance and oversight to assist in the development, documentation, and review of this plugin.

AI coded Pull Requiests should adhere to existing project structure and code style and should be full ytested before submission.

## License

TODOseq is released under the [MIT License](LICENSE).
