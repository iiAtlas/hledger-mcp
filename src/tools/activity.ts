import { z } from "zod";
import { SimpleReportTool, ToolMetadata } from "../base-tool.js";
import { CommonOptionsSchema, OutputFormatSchema } from "../types.js";

const ActivityInputSchema = CommonOptionsSchema.extend({
  interval: z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]).optional().describe("Reporting interval"),
  cumulative: z.boolean().optional().describe("Show cumulative activity"),
});

export class ActivityTool extends SimpleReportTool<typeof ActivityInputSchema> {
  readonly metadata: ToolMetadata<typeof ActivityInputSchema> = {
    name: "hledger_activity",
    description: "Show posting activity counts as a bar chart",
    schema: ActivityInputSchema,
  };

  constructor(journalFilePath?: string) {
    super(journalFilePath);
  }

  protected getCommand(): string {
    return "activity";
  }

  protected buildArgs(input: z.infer<typeof ActivityInputSchema>): string[] {
    const args = this.buildCommonArgs(input);

    if (input.interval) args.push(`--${input.interval}`);
    if (input.cumulative) args.push('--cumulative');

    return args;
  }
}
