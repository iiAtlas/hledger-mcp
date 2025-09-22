import type { z } from "zod";
import type { ToolMetadata } from "../base-tool.js";
import { SimpleReportTool } from "../base-tool.js";
import { BalanceSheetInputSchema } from "./balancesheet.js";

const BalanceSheetEquityInputSchema = BalanceSheetInputSchema;

export class BalanceSheetEquityTool extends SimpleReportTool<
  typeof BalanceSheetEquityInputSchema
> {
  readonly metadata: ToolMetadata<typeof BalanceSheetEquityInputSchema> = {
    name: "hledger_balancesheetequity",
    description: "Balance sheet including equity accounts",
    schema: BalanceSheetEquityInputSchema,
  };

  constructor(journalFilePath?: string) {
    super(journalFilePath);
  }

  protected getCommand(): string {
    return "balancesheetequity";
  }

  protected buildArgs(
    input: z.infer<typeof BalanceSheetEquityInputSchema>,
  ): string[] {
    const args = this.buildCommonArgs(input);

    if (input.flat) args.push("--flat");
    if (input.tree) args.push("--tree");
    if (input.drop !== undefined) args.push("--drop", input.drop.toString());
    if (input.declared) args.push("--declared");
    if (input.noTotal) args.push("--no-total");
    if (input.layout) args.push("--layout", input.layout);

    this.addOutputFormat(args, input.outputFormat);

    return args;
  }
}
