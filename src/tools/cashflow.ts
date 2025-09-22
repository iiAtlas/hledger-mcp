import { z } from "zod";
import type { ToolMetadata } from "../base-tool.js";
import { SimpleReportTool } from "../base-tool.js";
import { CommonOptionsSchema, OutputFormatSchema } from "../types.js";

const CashFlowInputSchema = CommonOptionsSchema.extend({
  outputFormat: OutputFormatSchema.optional().describe(
    "Output format (txt, csv, etc.)",
  ),
  flat: z.boolean().optional().describe("Show accounts as flat list"),
  tree: z.boolean().optional().describe("Show accounts as tree"),
  drop: z
    .number()
    .int()
    .min(0)
    .max(5)
    .optional()
    .describe("Omit N leading account name parts"),
  declared: z.boolean().optional().describe("Include declared accounts"),
  layout: z
    .enum(["wide", "tall", "bare", "tidy"])
    .optional()
    .describe("Layout for multi-commodity amounts"),
  noTotal: z.boolean().optional().describe("Omit final total row"),
});

export class CashFlowTool extends SimpleReportTool<typeof CashFlowInputSchema> {
  readonly metadata: ToolMetadata<typeof CashFlowInputSchema> = {
    name: "hledger_cashflow",
    description: "Cash flow statement showing liquidity changes",
    schema: CashFlowInputSchema,
  };

  constructor(journalFilePath?: string) {
    super(journalFilePath);
  }

  protected getCommand(): string {
    return "cashflow";
  }

  protected buildArgs(input: z.infer<typeof CashFlowInputSchema>): string[] {
    const args = this.buildCommonArgs(input);

    if (input.flat) args.push("--flat");
    if (input.tree) args.push("--tree");
    if (input.drop !== undefined) args.push("--drop", input.drop.toString());
    if (input.declared) args.push("--declared");
    if (input.layout) args.push("--layout", input.layout);
    if (input.noTotal) args.push("--no-total");

    this.addOutputFormat(args, input.outputFormat);

    return args;
  }
}
