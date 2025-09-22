import { z } from "zod";
import { SimpleReportTool, ToolMetadata } from "../base-tool.js";
import { CommonOptionsSchema, OutputFormatSchema } from "../types.js";

const TagsInputSchema = CommonOptionsSchema.extend({
  query: z.string().optional().describe("Filter tags using query syntax"),
});

export class TagsTool extends SimpleReportTool<typeof TagsInputSchema> {
  readonly metadata: ToolMetadata<typeof TagsInputSchema> = {
    name: "hledger_tags",
    description: "List tag names used in transactions",
    schema: TagsInputSchema,
  };

  constructor(journalFilePath?: string) {
    super(journalFilePath);
  }

  protected getCommand(): string {
    return "tags";
  }

  protected buildArgs(input: z.infer<typeof TagsInputSchema>): string[] {
    const args = this.buildCommonArgs(input);

    if (input.query) args.push(input.query);

    return args;
  }
}
