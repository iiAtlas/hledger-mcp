import { z } from "zod";
import { QueryableTool, ToolMetadata } from "../base-tool.js";
import { CommonOptionsSchema, OutputFormatSchema } from "../types.js";

const PrintInputSchema = CommonOptionsSchema.extend({
  query: z.string().optional().describe("Filter transactions using hledger query syntax"),
  outputFormat: OutputFormatSchema.optional().describe("Output format (txt, csv, json, etc.)"),
  format: z.string().optional().describe("Custom line format for each transaction"),
  explicit: z.boolean().optional().describe("Show only explicit amounts"),
  match: z.string().optional().describe("Highlight matches for the supplied regex"),
  pretty: z.boolean().optional().describe("Use pretty output if supported"),
});

export class PrintTool extends QueryableTool<typeof PrintInputSchema> {
  readonly metadata: ToolMetadata<typeof PrintInputSchema> = {
    name: "hledger_print",
    description: "Print full transactions from the journal with optional filtering and formatting",
    schema: PrintInputSchema,
  };

  constructor(journalFilePath?: string) {
    super(journalFilePath);
  }

  protected getCommand(): string {
    return "print";
  }

  protected buildArgs(input: z.infer<typeof PrintInputSchema>): string[] {
    const args = this.buildCommonArgs(input);

    if (input.format) args.push('--format', input.format);
    if (input.explicit) args.push('--explicit');
    if (input.match) args.push('--match', input.match);
    if (input.pretty) args.push('--pretty');

    this.addOutputFormat(args, input.outputFormat);
    this.addQueryArgs(args, input.query);

    return args;
  }
}
