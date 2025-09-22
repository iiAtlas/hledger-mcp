# HLedger MCP Server

A Model Context Protocol (MCP) server that provides AI assistants with direct access to HLedger accounting data and functionality. This server enables AI applications to query account balances, generate financial reports, and analyze accounting data through a standardized protocol.

## Features

The HLedger MCP server provides comprehensive access to HLedger's financial reporting capabilities through the following tools:

### Core Accounting
- **Accounts** - List and query account names and structures
- **Balance** - Generate balance reports with extensive customization options
- **Register** - View transaction registers and posting details
- **Print** - Output journal entries and transactions

### Financial Reports
- **Balance Sheet** - Generate balance sheet reports
- **Balance Sheet Equity** - Balance sheet reports with equity details
- **Income Statement** - Profit & loss statements
- **Cash Flow** - Cash flow analysis and reports

### Data Analysis
- **Stats** - Statistical analysis of journal data
- **Activity** - Account activity and transaction frequency analysis
- **Payees** - List and analyze transaction payees
- **Descriptions** - Transaction description analysis
- **Tags** - Query and analyze transaction tags
- **Files** - Information about journal files

### Journal Updates
- **Add Transaction** - Append new, validated journal entries with optional dry-run support
- **Import Transactions** - Safely ingest batches of entries from external journal files or other supported formats
- **Rewrite Transactions** - Add synthesized postings to matching entries using hledger's rewrite command

## Prerequisites

- **HLedger** must be installed and accessible in your system PATH
  - Install from [hledger.org](https://hledger.org/)
  - Verify installation: `hledger --version`
- **Node.js** v18 or higher

## Installation

Install the HLedger MCP server globally using npx:

```bash
npx hledger-mcp
```

Or install locally in your project:

```bash
npm install hledger-mcp
```

## Usage

### Claude Desktop Configuration

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "hledger": {
      "command": "npx",
      "args": ["hledger-mcp", "/path/to/your/journal.ledger"]
    }
  }
}
```

Replace `/path/to/your/journal.ledger` with the actual path to your HLedger journal file.

### Other MCP Clients

For other MCP-compatible applications, run the server with:

```bash
npx hledger-mcp /path/to/your/journal.ledger
```

The server communicates via stdio and expects the journal file path as the first argument.

#### Command line options

You can toggle write behaviour with optional flags:

- `--read-only` &mdash; disables the add-transaction tool entirely; all write attempts return an error.
- `--skip-backup` &mdash; prevents the server from creating `.bak` files before appending to an existing journal.

Example:

```bash
npx hledger-mcp --read-only /path/to/journal.ledger
```

Flags may appear before or after the journal path. Both options default to `false`.

### Write tools

When the server is not in `--read-only` mode, two tools can modify the primary journal:

- `hledger_add_transaction` accepts structured postings and appends a new transaction after validating with `hledger check`. Enable `dryRun` to preview the entry without writing.
- `hledger_import` wraps `hledger import`, running the command against a temporary copy of the journal. Provide one or more `dataFiles` (journal, csv, etc.) and an optional `rulesFile`; set `dryRun` to inspect the diff before committing. Successful imports create timestamped `.bak` files unless `--skip-backup` is active.
- `hledger_rewrite` runs `hledger rewrite` on a temporary copy, letting you specify one or more `addPostings` instructions for matching transactions. Use `dryRun` for a diff-only preview or `diff: true` to include the patch output alongside the applied change.

## Example Queries

Once configured, you can ask Claude natural language questions about your financial data:

- "What's my current account balance?"
- "Show me a balance sheet for last quarter"
- "What were my expenses in the food category last month?"
- "Generate an income statement for 2024"
- "Who are my top payees by transaction volume?"
- "Show me cash flow for the past 6 months"

## Tool Parameters

Most tools support common HLedger options including:

- **Date ranges**: `--begin`, `--end`, `--period`
- **Output formats**: `txt`, `csv`, `json`, `html`
- **Account filtering**: Pattern matching and regex support
- **Calculation modes**: Historical, cumulative, change analysis
- **Display options**: Flat vs tree view, sorting, percentages

## Development

### Building from Source

```bash
# Clone the repository
git clone <repository-url>
cd hledger-mcp

# Install dependencies
npm install

# Build the server
npm run build

# Run locally
./build/index.js /path/to/journal.ledger
```

### Project Structure

```
src/
├── index.ts              # Main server entry point
├── base-tool.ts          # Base tool classes and utilities
├── types.ts              # Shared type definitions
└── tools/                # Individual tool implementations
    ├── accounts.ts
    ├── balance.ts
    ├── register.ts
    └── ...
```

## Troubleshooting

### "hledger CLI is not installed"
Ensure HLedger is installed and available in your PATH:
```bash
hledger --version
```

### "Journal file path is required"
The server requires a journal file path as an argument:
```bash
npx hledger-mcp /path/to/your/journal.ledger
```

### Claude Desktop Connection Issues
1. Verify the journal file path is correct and accessible
2. Check that the configuration file syntax is valid JSON
3. Restart Claude Desktop after configuration changes

## License

ISC License

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## Related Projects

- [HLedger](https://hledger.org/) - The underlying accounting software
- [Model Context Protocol](https://modelcontextprotocol.io/) - The protocol specification
- [Claude Desktop](https://claude.ai/) - AI assistant that supports MCP servers
