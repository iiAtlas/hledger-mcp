import { z } from "zod";
import type { ToolMetadata } from "../base-tool.js";
import { SimpleReportTool } from "../base-tool.js";
import { CommonOptionsSchema, OutputFormatSchema } from "../types.js";

const IncomeStatementInputSchema = CommonOptionsSchema.extend({
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
  average: z.boolean().optional().describe("Show average column"),
  noTotal: z.boolean().optional().describe("Omit final total row"),
  percent: z.boolean().optional().describe("Show percentage columns"),
  layout: z
    .enum(["wide", "tall", "bare", "tidy"])
    .optional()
    .describe("Layout for multi-commodity amounts"),
});

export class IncomeStatementTool extends SimpleReportTool<
  typeof IncomeStatementInputSchema
> {
  readonly metadata: ToolMetadata<typeof IncomeStatementInputSchema> = {
    name: "hledger_incomestatement",
    description: "Income statement summarizing revenues and expenses",
    schema: IncomeStatementInputSchema,
  };

  constructor(journalFilePath?: string) {
    super(journalFilePath);
  }

  protected getCommand(): string {
    return "incomestatement";
  }

  protected buildArgs(
    input: z.infer<typeof IncomeStatementInputSchema>,
  ): string[] {
    const args = this.buildCommonArgs(input);

    if (input.flat) args.push("--flat");
    if (input.tree) args.push("--tree");
    if (input.drop !== undefined) args.push("--drop", input.drop.toString());
    if (input.declared) args.push("--declared");
    if (input.average) args.push("--average");
    if (input.noTotal) args.push("--no-total");
    if (input.percent) args.push("--percent");
    if (input.layout) args.push("--layout", input.layout);

    this.addOutputFormat(args, input.outputFormat);

    return args;
  }
}
