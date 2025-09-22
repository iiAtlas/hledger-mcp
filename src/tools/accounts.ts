import { z } from "zod";
import { QueryableTool, ToolMetadata } from "../base-tool.js";
import { CommonOptionsSchema, OutputFormatSchema } from "../types.js";

const AccountsInputSchema = CommonOptionsSchema.extend({
  query: z.string().optional().describe("Account pattern or query to filter accounts"),
  outputFormat: OutputFormatSchema.optional().describe("Output format (txt, csv, json, etc.)"),
  flat: z.boolean().optional().describe("Show accounts as flat list"),
  tree: z.boolean().optional().describe("Show accounts as tree (default)"),
  drop: z.number().int().min(0).max(5).optional().describe("Omit N leading account name parts"),
  declared: z.boolean().optional().describe("Include declared accounts even if unused")
});

export class AccountsTool extends QueryableTool<typeof AccountsInputSchema> {
  readonly metadata: ToolMetadata<typeof AccountsInputSchema> = {
    name: "hledger_accounts",
    description: "List account names from the journal, with optional filtering and formatting",
    schema: AccountsInputSchema,
  };

  constructor(journalFilePath?: string) {
    super(journalFilePath);
  }

  protected getCommand(): string {
    return "accounts";
  }

  protected buildArgs(input: z.infer<typeof AccountsInputSchema>): string[] {
    const args = this.buildCommonArgs(input);

    // Add accounts-specific options
    if (input.flat) args.push('--flat');
    if (input.tree) args.push('--tree');
    if (input.drop !== undefined) args.push('--drop', input.drop.toString());
    if (input.declared) args.push('--declared');

    // Add query if provided
    this.addQueryArgs(args, input.query);

    return args;
  }

  protected supportsOutputFormat(): boolean {
    return false;
  }
}
