import { z } from "zod";
import { SimpleReportTool, ToolMetadata } from "../base-tool.js";
import { CommonOptionsSchema } from "../types.js";

const PayeesInputSchema = CommonOptionsSchema.extend({
  query: z.string().optional().describe("Filter payees using query syntax"),
  sort: z.enum(["name", "count", "amount"]).optional().describe("Sorting order"),
});

export class PayeesTool extends SimpleReportTool<typeof PayeesInputSchema> {
  readonly metadata: ToolMetadata<typeof PayeesInputSchema> = {
    name: "hledger_payees",
    description: "List payee names from the journal, optionally filtered and sorted",
    schema: PayeesInputSchema,
  };

  constructor(journalFilePath?: string) {
    super(journalFilePath);
  }

  protected getCommand(): string {
    return "payees";
  }

  protected buildArgs(input: z.infer<typeof PayeesInputSchema>): string[] {
    const args = this.buildCommonArgs(input);

    if (input.sort) args.push('--sort', input.sort);
    if (input.query) args.push(input.query);

    return args;
  }
}
