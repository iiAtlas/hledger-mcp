import { z } from "zod";
import type { ToolMetadata } from "../base-tool.js";
import { SimpleReportTool } from "../base-tool.js";
import { CommonOptionsSchema } from "../types.js";

const DescriptionsInputSchema = CommonOptionsSchema.extend({
  query: z
    .string()
    .optional()
    .describe("Filter descriptions using query syntax"),
  sort: z
    .enum(["name", "count", "amount"])
    .optional()
    .describe("Sorting order"),
});

export class DescriptionsTool extends SimpleReportTool<
  typeof DescriptionsInputSchema
> {
  readonly metadata: ToolMetadata<typeof DescriptionsInputSchema> = {
    name: "hledger_descriptions",
    description: "List transaction descriptions from the journal",
    schema: DescriptionsInputSchema,
  };

  constructor(journalFilePath?: string) {
    super(journalFilePath);
  }

  protected getCommand(): string {
    return "descriptions";
  }

  protected buildArgs(
    input: z.infer<typeof DescriptionsInputSchema>,
  ): string[] {
    const args = this.buildCommonArgs(input);

    if (input.sort) args.push("--sort", input.sort);
    if (input.query) args.push(input.query);

    return args;
  }
}
