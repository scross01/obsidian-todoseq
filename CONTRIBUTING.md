# Contributing to TODOseq

## Development

**Requirements**: Node.js and npm

**Scripts**:

- `npm run dev` — Run esbuild bundler in watch mode for development
- `npm run build` — Type-check and build for production
- `npm run test` — Run unit tests
- `npm run lint` — Run ESLint to check code style
- `npm run format` — Format code using Prettier
- `npm run docs:dev` — Run dynamic docs site for development
- `npm run docs:build` — Run VitePress to build production docs  
- `npm run docs:preview` — Preview static production docs

**Git Hooks**:

This project includes a pre-commit hook that automatically runs the following checks:

- `npm run build` — Ensures the project builds successfully
- `npm run lint` — Checks for code style issues
- `npm run test` — Runs all unit tests
- `npm run format` — Verifies code formatting is correct

The hook only runs when relevant files (TypeScript, JavaScript, JSON) are staged for commit.

## GitHub Actions Workflow for VitePress

The workflow automates the entire process: installing dependencies, building the VitePress site, and deploying it to GitHub Pages.

## Contributing

Issues and pull requests are welcome. Please describe changes clearly and include steps to reproduce when filing bugs.

## AI

Multiple AI tools have been used with human guidance and oversight to assist in the development, documentation, and review of this plugin.

AI generated contributions are accepted, but should adhere to existing project structure and code style and must be fully tested and reviewed before submission.

## License

TODOseq is released under the [MIT License](LICENSE).
