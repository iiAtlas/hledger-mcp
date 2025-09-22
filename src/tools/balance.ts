import { z } from "zod";
import type { ToolMetadata } from "../base-tool.js";
import { QueryableTool } from "../base-tool.js";
import { CommonOptionsSchema, OutputFormatSchema } from "../types.js";

const BalanceInputSchema = CommonOptionsSchema.extend({
  query: z
    .string()
    .optional()
    .describe("Account pattern or query to filter accounts"),
  outputFormat: OutputFormatSchema.optional().describe(
    "Output format (txt, csv, json, etc.)",
  ),

  // Calculation modes
  sum: z.boolean().optional().describe("Show sum of posting amounts (default)"),
  budget: z.boolean().optional().describe("Show budget goals and performance"),
  valuechange: z.boolean().optional().describe("Show change in balance values"),
  gain: z.boolean().optional().describe("Show unrealized capital gains/losses"),
  count: z.boolean().optional().describe("Show count of postings"),

  // Accumulation modes
  change: z.boolean().optional().describe("Show changes per period (default)"),
  cumulative: z
    .boolean()
    .optional()
    .describe("Show cumulative changes from report start"),
  historical: z.boolean().optional().describe("Show historical end balances"),

  // Display options
  flat: z.boolean().optional().describe("Show accounts as flat list"),
  tree: z.boolean().optional().describe("Show accounts as tree (default)"),
  drop: z
    .number()
    .int()
    .min(0)
    .max(5)
    .optional()
    .describe("Omit N leading account name parts"),
  declared: z.boolean().optional().describe("Include declared accounts"),
  average: z
    .boolean()
    .optional()
    .describe("Show average column in multi-period reports"),
  rowTotal: z.boolean().optional().describe("Show row total column"),
  noTotal: z.boolean().optional().describe("Omit final total row"),
  sortAmount: z
    .boolean()
    .optional()
    .describe("Sort by amount instead of account name"),
  percent: z.boolean().optional().describe("Show percentages of column totals"),
  invert: z.boolean().optional().describe("Display amounts with reversed sign"),
  transpose: z.boolean().optional().describe("Switch rows and columns"),

  // Layout options
  layout: z
    .enum(["wide", "tall", "bare", "tidy"])
    .optional()
    .describe("How to layout multi-commodity amounts"),
  noElide: z
    .boolean()
    .optional()
    .describe("Don't compress boring parent accounts"),
  format: z
    .string()
    .optional()
    .describe("Custom line format for single-period reports"),
});

export class BalanceTool extends QueryableTool<typeof BalanceInputSchema> {
  readonly metadata: ToolMetadata<typeof BalanceInputSchema> = {
    name: "hledger_balance",
    description:
      "Show account balances, balance changes, or other balance-related reports with extensive customization options",
    schema: BalanceInputSchema,
  };

  constructor(journalFilePath?: string) {
    super(journalFilePath);
  }

  protected getCommand(): string {
    return "balance";
  }

  protected buildArgs(input: z.infer<typeof BalanceInputSchema>): string[] {
    const args = this.buildCommonArgs(input);

    // Calculation modes (mutually exclusive, but let hledger handle conflicts)
    if (input.sum) args.push("--sum");
    if (input.budget) args.push("--budget");
    if (input.valuechange) args.push("--valuechange");
    if (input.gain) args.push("--gain");
    if (input.count) args.push("--count");

    // Accumulation modes
    if (input.change) args.push("--change");
    if (input.cumulative) args.push("--cumulative");
    if (input.historical) args.push("--historical");

    // Display options
    if (input.flat) args.push("--flat");
    if (input.tree) args.push("--tree");
    if (input.drop !== undefined) args.push("--drop", input.drop.toString());
    if (input.declared) args.push("--declared");
    if (input.average) args.push("--average");
    if (input.rowTotal) args.push("--row-total");
    if (input.noTotal) args.push("--no-total");
    if (input.sortAmount) args.push("--sort-amount");
    if (input.percent) args.push("--percent");
    if (input.invert) args.push("--invert");
    if (input.transpose) args.push("--transpose");

    // Layout options
    if (input.layout) args.push("--layout", input.layout);
    if (input.noElide) args.push("--no-elide");
    if (input.format) args.push("--format", input.format);

    // Add output format
    this.addOutputFormat(args, input.outputFormat);

    // Add query if provided
    this.addQueryArgs(args, input.query);

    return args;
  }
}
