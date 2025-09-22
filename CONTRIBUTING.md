# Contributing to hledger-mcp

Thanks for your interest in improving the hledger MCP server!

## Local Setup

- Clone the repository to your machine. We assume contributions originate from a local clone rather than the GitHub web editor so that tests, lint, and debug tools can be exercised.
- Use `nvm use` (or install the Node version from `.nvmrc`) to match the runtime the project expects. This avoids version-specific issues with TypeScript, Jest, or the MCP SDK.

## Development Workflow

- Format changes with `npm run format` and keep the linter happy with `npm run lint`. Both scripts are required for the CI pipeline, so running them locally saves time.
- Add or update unit tests that cover your changes. Then run the full suite with `npm test` before sending the patch.
- When you need to inspect behaviour interactively, launch the server with `npm run debug`. This starts the MCP inspector so you can poke at tools and confirm responses without leaving the local environment.

## Issues and Support

- GitHub Issues are open for bug reports, feature requests, and general discussion. Feel free to file new tickets or pick up existing ones—just leave a short note so others know the issue is in progress.

Thanks again for contributing! Thoughtful tests, tidy lint, and clear issues help keep the project healthy for everyone.
