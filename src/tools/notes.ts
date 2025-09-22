import { z } from "zod";
import type { ToolMetadata } from "../base-tool.js";
import { QueryableTool } from "../base-tool.js";
import { CommonOptionsSchema } from "../types.js";

const NotesInputSchema = CommonOptionsSchema.extend({
  query: z
    .string()
    .optional()
    .describe("Optional query to filter transactions"),
});

export class NotesTool extends QueryableTool<typeof NotesInputSchema> {
  readonly metadata: ToolMetadata<typeof NotesInputSchema> = {
    name: "hledger_notes",
    description: "List unique transaction notes, optionally filtered by query",
    schema: NotesInputSchema,
  };

  constructor(journalFilePath?: string) {
    super(journalFilePath);
  }

  protected getCommand(): string {
    return "notes";
  }

  protected buildArgs(input: z.infer<typeof NotesInputSchema>): string[] {
    const args = this.buildCommonArgs(input);
    this.addQueryArgs(args, input.query);
    return args;
  }

  protected supportsOutputFormat(): boolean {
    return false;
  }
}
