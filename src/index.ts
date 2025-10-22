#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { existsSync } from "fs";
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
import { FindEntryTool } from "./tools/find-entry.js";
import { AddTransactionTool } from "./tools/add.js";
import { ImportTransactionsTool } from "./tools/import.js";
import { RewriteTransactionsTool } from "./tools/rewrite.js";
import { RemoveEntryTool } from "./tools/remove-entry.js";
import { ReplaceEntryTool } from "./tools/replace-entry.js";
import { CloseTool } from "./tools/close.js";
import { WebTool } from "./tools/web.js";
import { WebListTool } from "./tools/web-list.js";
import { WebStopTool } from "./tools/web-stop.js";
import { MoveFileTool } from "./tools/move-file.js";
import { registerJournalResources } from "./resource-loader.js";
import { checkHledgerInstallation } from "./hledger-path.js";

// Parse command line arguments and environment variables
const cliArgs = process.argv.slice(2);
let journalFilePath: string | undefined;
let readOnlyMode = false;
let skipBackup = false;
let allowFileOperations = false;

// Check environment variables first (from MCP config)
if (process.env.HLEDGER_READ_ONLY === "true") {
  readOnlyMode = true;
}
if (process.env.HLEDGER_SKIP_BACKUP === "true") {
  skipBackup = true;
}
if (process.env.HLEDGER_ALLOW_FILE_OPERATIONS === "true") {
  allowFileOperations = true;
}

// Parse command line arguments (CLI flags override env vars)
for (const arg of cliArgs) {
  if (arg === "--read-only") {
    readOnlyMode = true;
  } else if (arg === "--skip-backup") {
    skipBackup = true;
  } else if (arg === "--allow-file-operations") {
    allowFileOperations = true;
  } else if (!arg.startsWith("--") && !journalFilePath) {
    journalFilePath = arg;
  } else {
    console.error(`Error: Unrecognized argument '${arg}'`);
    console.error(
      "Usage: hledger-mcp <path-to-journal-file> [--read-only] [--skip-backup] [--allow-file-operations]",
    );
    process.exit(1);
  }
}

if (!journalFilePath || journalFilePath.trim() === "") {
  console.error("Error: Journal file path is required");
  console.error(
    "Please configure the journal path in your MCP client settings",
  );
  console.error(
    "Usage: hledger-mcp <path-to-journal-file> [--read-only] [--skip-backup] [--allow-file-operations]",
  );
  process.exit(1);
}

// Check if journal file exists
if (!existsSync(journalFilePath)) {
  console.error(`Error: Journal file does not exist: ${journalFilePath}`);
  console.error("Please check the journal path in your MCP client settings");
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
const findEntryTool = new FindEntryTool(journalFilePath);
const webTool = new WebTool(journalFilePath, { readOnly: readOnlyMode });
const webListTool = new WebListTool(journalFilePath);
const webStopTool = new WebStopTool(journalFilePath);
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
const removeEntryTool = new RemoveEntryTool(journalFilePath, {
  readOnly: readOnlyMode,
  skipBackup,
});
const replaceEntryTool = new ReplaceEntryTool(journalFilePath, {
  readOnly: readOnlyMode,
  skipBackup,
});
const closeTool = new CloseTool(journalFilePath, {
  readOnly: readOnlyMode,
  skipBackup,
});
const moveFileTool = new MoveFileTool(journalFilePath, {
  allowFileOperations,
});

// Create server instance
const server = new McpServer({
  name: "hledger-mcp",
  version: "1.0.5",
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
  findEntryTool.metadata.name,
  findEntryTool.metadata.description,
  findEntryTool.metadata.schema.shape,
  async (args) => {
    const result = await findEntryTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  webTool.metadata.name,
  webTool.metadata.description,
  webTool.metadata.schema.shape,
  async (args) => {
    const result = await webTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  webListTool.metadata.name,
  webListTool.metadata.description,
  webListTool.metadata.schema.shape,
  async (args) => {
    const result = await webListTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  webStopTool.metadata.name,
  webStopTool.metadata.description,
  webStopTool.metadata.schema.shape,
  async (args) => {
    const result = await webStopTool.execute(args);
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
  removeEntryTool.metadata.name,
  removeEntryTool.metadata.description,
  removeEntryTool.metadata.schema.shape,
  async (args) => {
    const result = await removeEntryTool.execute(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.tool(
  replaceEntryTool.metadata.name,
  replaceEntryTool.metadata.description,
  replaceEntryTool.metadata.schema.shape,
  async (args) => {
    const result = await replaceEntryTool.execute(args);
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

server.tool(
  moveFileTool.metadata.name,
  moveFileTool.metadata.description,
  moveFileTool.metadata.schema.shape,
  async (args) => {
    const result = await moveFileTool.execute(args);
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
