import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execSync } from "child_process";
import { AccountsTool } from "./tools/accounts.js";
import { BalanceTool } from "./tools/balance.js";

// Check if hledger CLI is installed
function checkHledgerInstallation(): boolean {
  try {
    execSync("hledger --version", { stdio: "pipe" });
    return true;
  } catch (error) {
    return false;
  }
}

// Get journal file path from command line arguments
const journalFilePath = process.argv[2];

if (!journalFilePath) {
  console.error("Error: Journal file path is required");
  console.error("Usage: hledger-mcp <path-to-journal-file>");
  process.exit(1);
}

// Initialize tools with journal file path
const accountsTool = new AccountsTool(journalFilePath);
const balanceTool = new BalanceTool(journalFilePath);

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
  }
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
  }
);

async function main() {
  // Check if hledger is installed before starting the server
  if (!checkHledgerInstallation()) {
    console.error("Error: hledger CLI is not installed or not accessible in PATH");
    console.error("Please install hledger from https://hledger.org/");
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HLedger MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
