import { z } from "zod";
import type { ToolMetadata } from "../base-tool.js";
import { QueryableTool } from "../base-tool.js";
import { CommonOptionsSchema, OutputFormatSchema } from "../types.js";

const RegisterInputSchema = CommonOptionsSchema.extend({
  query: z
    .string()
    .optional()
    .describe("Filter postings using hledger query syntax"),
  outputFormat: OutputFormatSchema.optional().describe(
    "Output format (txt, csv, json, etc.)",
  ),
  average: z.boolean().optional().describe("Show average posting amount"),
  format: z
    .string()
    .optional()
    .describe("Custom line format for register entries"),
  related: z.boolean().optional().describe("Show related postings"),
});

export class RegisterTool extends QueryableTool<typeof RegisterInputSchema> {
  readonly metadata: ToolMetadata<typeof RegisterInputSchema> = {
    name: "hledger_register",
    description:
      "Show postings with running totals, filtered by query or account",
    schema: RegisterInputSchema,
  };

  constructor(journalFilePath?: string) {
    super(journalFilePath);
  }

  protected getCommand(): string {
    return "register";
  }

  protected buildArgs(input: z.infer<typeof RegisterInputSchema>): string[] {
    const args = this.buildCommonArgs(input);

    if (input.average) args.push("--average");
    if (input.format) args.push("--format", input.format);
    if (input.related) args.push("--related");

    this.addOutputFormat(args, input.outputFormat);
    this.addQueryArgs(args, input.query);

    return args;
  }
}
