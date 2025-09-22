# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an HLedger MCP (Model Context Protocol) server implementation built with TypeScript. The project creates a bridge between HLedger accounting software and MCP-compatible applications using the Model Context Protocol SDK.

## Commands

### Building
- `npm run build` - Compiles TypeScript to JavaScript and makes the output executable

### Development
- Node.js version: v24.7.0 (specified in .nvmrc)
- Use `nvm use` to set correct Node version

## Architecture

### Core Structure
- **Entry Point**: `src/index.ts` - Main server implementation
- **Output**: `build/index.js` - Compiled executable with shebang
- **Binary**: Available as `hledger-mcp` command after build

### Key Components
- **MCP Server**: Uses `@modelcontextprotocol/sdk` for Model Context Protocol implementation
- **Transport**: StdioServerTransport for stdio-based communication
- **Validation**: Zod library for schema validation
- **Configuration**: Currently configured with empty resources and tools capabilities

### Server Structure
The server is configured as:
- Name: "hledger-mcp"
- Version: "1.0.0"
- Capabilities: Currently empty resources and tools objects (ready for extension)
- Transport: Stdio-based communication

The server runs on stdio and logs startup message to stderr to avoid interfering with the MCP protocol communication on stdout.