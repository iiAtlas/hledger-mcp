# Changelog

All notable changes to this project will be documented in this file.

## [1.0.5]

- Added `hledger_find_entry`, `hledger_remove_entry`, and `hledger_replace_entry` tools for locating and editing journal transactions

## [1.0.4]

- Changed license to MIT. Enjoy!

## [1.0.3]

- Added the ability to open/close HLedger web UI instances with three new commands: `hledger_web`, `hledger_web_list` and `hledger_web_stop`
- Added the `HLEDGER_WEB_EXECUTABLE_PATH` environment variable for setting the `hledger-web` executable path

## [1.0.2]

- Added glama.json for Glama MCP server registry
- Added `.mcpb` packaging assets and scripts for distributing the MCP bundle
- Added `HLEDGER_READ_ONLY`, `HLEDGER_SKIP_BACKUP`, and `HLEDGER_EXECUTABLE_PATH` environment variables for MCP configuration

## [1.0.1]

- Update package metadata links to point at the correct GitHub repository.
- Fix the CLI binary so `npx @iiatlas/hledger-mcp` runs under Node without shell errors.

## [1.0.0]

- The initial release of `hledger-mcp` !
