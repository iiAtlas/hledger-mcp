#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execSync } from "child_process";
import { AccountsTool } from "./tools/accounts.js";
import { BalanceTool } from "./tools/balance.js";
import { BalanceSheetEquityTool } from "./tools/balancesheetequity.js";
import { PrintTool } from "./tools/print.js";
import { RegisterTool } from "./tools/register.js";
import { BalanceSheetTool } from "./tools/balancesheet.js";
import { IncomeStatementTool } from "./tools/incomestatement.js";
import { CashFlowTool } from "./tools/cashflow.js";
import { PayeesTool } from "./tools/payees.js";
import { DescriptionsTool } from "./tools/descriptions.js";
import { TagsTool } from "./tools/tags.js";
import { FilesTool } from "./tools/files.js";
import { StatsTool } from "./tools/stats.js";
import { ActivityTool } from "./tools/activity.js";
import { NotesTool } from "./tools/notes.js";
import { AddTransactionTool } from "./tools/add.js";
import { ImportTransactionsTool } from "./tools/import.js";
import { RewriteTransactionsTool } from "./tools/rewrite.js";
import { CloseTool } from "./tools/close.js";
import { registerJournalResources } from "./resource-loader.js";

// Check if hledger CLI is installed
function checkHledgerInstallation(): boolean {
  try {
    execSync("hledger --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// Parse command line arguments
const cliArgs = process.argv.slice(2);
let journalFilePath: string | undefined;
let readOnlyMode = false;
let skipBackup = false;

for (const arg of cliArgs) {
  if (arg === "--read-only") {
    readOnlyMode = true;
  } else if (arg === "--skip-backup") {
    skipBackup = true;
  } else if (!arg.startsWith("--") && !journalFilePath) {
    journalFilePath = arg;
  } else {
    console.error(`Error: Unrecognized argument '${arg}'`);
    console.error(
      "Usage: hledger-mcp <path-to-journal-file> [--read-only] [--skip-backup]",
    );
    process.exit(1);
  }
}

if (!journalFilePath) {
  console.error("Error: Journal file path is required");
  console.error(
    "Usage: hledger-mcp <path-to-journal-file> [--read-only] [--skip-backup]",
  );
  process.exit(1);
}

// Initialize tools with journal file path
const accountsTool = new AccountsTool(journalFilePath);
const balanceTool = new BalanceTool(journalFilePath);
const printTool = new PrintTool(journalFilePath);
const registerTool = new RegisterTool(journalFilePath);
const balanceSheetTool = new BalanceSheetTool(journalFilePath);
const balanceSheetEquityTool = new BalanceSheetEquityTool(journalFilePath);
const incomeStatementTool = new IncomeStatementTool(journalFilePath);
const cashFlowTool = new CashFlowTool(journalFilePath);
const payeesTool = new PayeesTool(journalFilePath);
const descriptionsTool = new DescriptionsTool(journalFilePath);
const tagsTool = new TagsTool(journalFilePath);
const filesTool = new FilesTool(journalFilePath);
const statsTool = new StatsTool(journalFilePath);
const activityTool = new ActivityTool(journalFilePath);
const notesTool = new NotesTool(journalFilePath);
const addTransactionTool = new AddTransactionTool(journalFilePath, {
  readOnly: readOnlyMode,
  skipBackup,
});
const importTool = new ImportTransactionsTool(journalFilePath, {
  readOnly: readOnlyMode,
  skipBackup,
});
const rewriteTool = new RewriteTransactionsTool(journalFilePath, {
  readOnly: readOnlyMode,
  skipBackup,
});
const closeTool = new CloseTool(journalFilePath, {
  readOnly: readOnlyMode,
  skipBackup,
});

// Create server instance
const server = new McpServer({
  name: "hledger-mcp",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Register tool handlers
server.tool(
  accountsTool.metadata.name,
  accountsTool.metadata.description,
  accountsTool.metadata.schema.shape,
  async (args) => {
    const result = await accountsTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  balanceTool.metadata.name,
  balanceTool.metadata.description,
  balanceTool.metadata.schema.shape,
  async (args) => {
    const result = await balanceTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  printTool.metadata.name,
  printTool.metadata.description,
  printTool.metadata.schema.shape,
  async (args) => {
    const result = await printTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  registerTool.metadata.name,
  registerTool.metadata.description,
  registerTool.metadata.schema.shape,
  async (args) => {
    const result = await registerTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  balanceSheetTool.metadata.name,
  balanceSheetTool.metadata.description,
  balanceSheetTool.metadata.schema.shape,
  async (args) => {
    const result = await balanceSheetTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  balanceSheetEquityTool.metadata.name,
  balanceSheetEquityTool.metadata.description,
  balanceSheetEquityTool.metadata.schema.shape,
  async (args) => {
    const result = await balanceSheetEquityTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  incomeStatementTool.metadata.name,
  incomeStatementTool.metadata.description,
  incomeStatementTool.metadata.schema.shape,
  async (args) => {
    const result = await incomeStatementTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  cashFlowTool.metadata.name,
  cashFlowTool.metadata.description,
  cashFlowTool.metadata.schema.shape,
  async (args) => {
    const result = await cashFlowTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  payeesTool.metadata.name,
  payeesTool.metadata.description,
  payeesTool.metadata.schema.shape,
  async (args) => {
    const result = await payeesTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  descriptionsTool.metadata.name,
  descriptionsTool.metadata.description,
  descriptionsTool.metadata.schema.shape,
  async (args) => {
    const result = await descriptionsTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  tagsTool.metadata.name,
  tagsTool.metadata.description,
  tagsTool.metadata.schema.shape,
  async (args) => {
    const result = await tagsTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  filesTool.metadata.name,
  filesTool.metadata.description,
  filesTool.metadata.schema.shape,
  async (args) => {
    const result = await filesTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  statsTool.metadata.name,
  statsTool.metadata.description,
  statsTool.metadata.schema.shape,
  async (args) => {
    const result = await statsTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  activityTool.metadata.name,
  activityTool.metadata.description,
  activityTool.metadata.schema.shape,
  async (args) => {
    const result = await activityTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  notesTool.metadata.name,
  notesTool.metadata.description,
  notesTool.metadata.schema.shape,
  async (args) => {
    const result = await notesTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  addTransactionTool.metadata.name,
  addTransactionTool.metadata.description,
  addTransactionTool.metadata.schema.shape,
  async (args) => {
    const result = await addTransactionTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  importTool.metadata.name,
  importTool.metadata.description,
  importTool.metadata.schema.shape,
  async (args) => {
    const result = await importTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  rewriteTool.metadata.name,
  rewriteTool.metadata.description,
  rewriteTool.metadata.schema.shape,
  async (args) => {
    const result = await rewriteTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  closeTool.metadata.name,
  closeTool.metadata.description,
  closeTool.metadata.schema.shape,
  async (args) => {
    const result = await closeTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

async function main() {
  // Check if hledger is installed before starting the server
  if (!checkHledgerInstallation()) {
    console.error(
      "Error: hledger CLI is not installed or not accessible in PATH",
    );
    console.error("Please install hledger from https://hledger.org/");
    process.exit(1);
  }

  if (journalFilePath) {
    await registerJournalResources(server, journalFilePath);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HLedger MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
