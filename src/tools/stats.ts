import { z } from "zod";
import { SimpleReportTool, ToolMetadata } from "../base-tool.js";
import { CommonOptionsSchema } from "../types.js";

const StatsInputSchema = CommonOptionsSchema.extend({
  summary: z.boolean().optional().describe("Show only the summary section"),
});

export class StatsTool extends SimpleReportTool<typeof StatsInputSchema> {
  readonly metadata: ToolMetadata<typeof StatsInputSchema> = {
    name: "hledger_stats",
    description: "Show journal statistics and health metrics",
    schema: StatsInputSchema,
  };

  constructor(journalFilePath?: string) {
    super(journalFilePath);
  }

  protected getCommand(): string {
    return "stats";
  }

  protected buildArgs(input: z.infer<typeof StatsInputSchema>): string[] {
    const args = this.buildCommonArgs(input);

    if (input.summary) args.push('--summary');

    return args;
  }

  protected supportsOutputFormat(): boolean {
    return false;
  }
}
