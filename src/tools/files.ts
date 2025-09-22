import type { z } from "zod";
import type { ToolMetadata } from "../base-tool.js";
import { SimpleReportTool } from "../base-tool.js";
import { CommonOptionsSchema, OutputFormatSchema } from "../types.js";

const FilesInputSchema = CommonOptionsSchema.extend({
  outputFormat: OutputFormatSchema.optional().describe(
    "Output format (txt, csv, etc.)",
  ),
});

export class FilesTool extends SimpleReportTool<typeof FilesInputSchema> {
  readonly metadata: ToolMetadata<typeof FilesInputSchema> = {
    name: "hledger_files",
    description: "List data files in use by hledger",
    schema: FilesInputSchema,
  };

  constructor(journalFilePath?: string) {
    super(journalFilePath);
  }

  protected getCommand(): string {
    return "files";
  }

  protected buildArgs(input: z.infer<typeof FilesInputSchema>): string[] {
    const args = this.buildCommonArgs(input);
    return args;
  }

  protected supportsOutputFormat(): boolean {
    return false;
  }
}
