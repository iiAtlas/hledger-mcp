import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create server instance
const server = new McpServer({
  name: "hledger-mcp",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});