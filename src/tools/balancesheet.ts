import { z } from "zod";
import { SimpleReportTool, ToolMetadata } from "../base-tool.js";
import { CommonOptionsSchema, OutputFormatSchema } from "../types.js";

export const BalanceSheetInputSchema = CommonOptionsSchema.extend({
  outputFormat: OutputFormatSchema.optional().describe("Output format (txt, csv, json, etc.)"),
  flat: z.boolean().optional().describe("Show accounts as a flat list"),
  tree: z.boolean().optional().describe("Show accounts as a tree (default)"),
  drop: z.number().int().min(0).max(5).optional().describe("Omit N leading account name parts"),
  declared: z.boolean().optional().describe("Include declared accounts even if unused"),
  noTotal: z.boolean().optional().describe("Omit final total row"),
  layout: z.enum(["wide", "tall", "bare", "tidy"]).optional().describe("Layout for multi-commodity amounts"),
});

export class BalanceSheetTool extends SimpleReportTool<typeof BalanceSheetInputSchema> {
  readonly metadata: ToolMetadata<typeof BalanceSheetInputSchema> = {
    name: "hledger_balancesheet",
    description: "Summarize assets and liabilities with balance sheet layout",
    schema: BalanceSheetInputSchema,
  };

  constructor(journalFilePath?: string) {
    super(journalFilePath);
  }

  protected getCommand(): string {
    return "balancesheet";
  }

  protected buildArgs(input: z.infer<typeof BalanceSheetInputSchema>): string[] {
    const args = this.buildCommonArgs(input);

    if (input.flat) args.push('--flat');
    if (input.tree) args.push('--tree');
    if (input.drop !== undefined) args.push('--drop', input.drop.toString());
    if (input.declared) args.push('--declared');
    if (input.noTotal) args.push('--no-total');
    if (input.layout) args.push('--layout', input.layout);

    this.addOutputFormat(args, input.outputFormat);

    return args;
  }
}
