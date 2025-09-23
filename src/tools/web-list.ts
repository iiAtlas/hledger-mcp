import { z } from "zod";
import type { ToolMetadata } from "../base-tool.js";
import { BaseTool } from "../base-tool.js";
import type { CommandResult } from "../types.js";
import { webProcessRegistry } from "./web-process-registry.js";

const WebListInputSchema = z
  .object({})
  .strict()
  .describe("List all running hledger web server instances");

export class WebListTool extends BaseTool<typeof WebListInputSchema> {
  readonly metadata: ToolMetadata<typeof WebListInputSchema> = {
    name: "hledger_web_list",
    description: "List active hledger web instances started by this MCP server",
    schema: WebListInputSchema,
  };

  protected supportsOutputFormat(): boolean {
    return false;
  }

  protected async run(_input: z.infer<typeof WebListInputSchema>): Promise<CommandResult> {
    const start = Date.now();
    const instances = webProcessRegistry.list();
    const stdout = JSON.stringify({ instances }, null, 2);

    return {
      success: true,
      stdout,
      stderr: "",
      exitCode: 0,
      command: "list-running-hledger-web-instances",
      duration: Date.now() - start,
    };
  }
}
