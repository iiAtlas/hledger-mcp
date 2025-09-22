import { z } from "zod";
import { BaseTool, QueryableTool } from "../src/base-tool.js";
import type { CommandResult } from "../src/types.js";
import {
  DateSchema,
  OutputFormatSchema,
  CommonOptionsSchema,
} from "../src/types.js";

const Schema = z.object({
  begin: DateSchema.optional(),
  outputFormat: OutputFormatSchema.optional(),
  query: z.string().optional(),
});

class TestTool extends BaseTool<typeof Schema> {
  readonly metadata = {
    name: "test",
    description: "test tool",
    schema: Schema,
  } as const;

  constructor(journalFilePath?: string) {
    super(journalFilePath);
  }

  protected async run(input: z.infer<typeof Schema>): Promise<CommandResult> {
    const args = this.buildCommonArgs({ begin: input.begin });
    this.addOutputFormat(args, input.outputFormat);
    if (input.query) args.push(input.query);
    return {
      success: true,
      stdout: args.join(" "),
      stderr: "",
      exitCode: 0,
      command: `hledger test ${args.join(" ")}`,
      duration: 1,
    };
  }
}

class NoFormatTool extends TestTool {
  protected supportsOutputFormat(): boolean {
    return false;
  }
}

const ExtendedSchema = CommonOptionsSchema.extend({
  outputFormat: OutputFormatSchema.optional(),
});

class FullOptionsTool extends BaseTool<typeof ExtendedSchema> {
  readonly metadata = {
    name: "full",
    description: "full options",
    schema: ExtendedSchema,
  } as const;

  protected async run(
    input: z.infer<typeof ExtendedSchema>,
  ): Promise<CommandResult> {
    const args = this.buildCommonArgs(input);
    this.addOutputFormat(args, input.outputFormat);
    return {
      success: true,
      stdout: args.join(" "),
      stderr: "",
      exitCode: 0,
      command: `hledger full ${args.join(" ")}`,
      duration: 1,
    };
  }
}

describe("BaseTool", () => {
  it("adds default output format and common args", async () => {
    const tool = new TestTool("/default.journal");
    const result = await tool.execute({ begin: "2025-01-01" });

    expect(result.success).toBe(true);
    expect(result.data).toContain("--file /default.journal");
    expect(result.data).toContain("--begin 2025-01-01");
    expect(result.data).toContain("--output-format csv");
  });

  it("respects explicit output format override", async () => {
    const tool = new TestTool();
    const result = await tool.execute({ outputFormat: "json" });

    expect(result.success).toBe(true);
    expect(result.data).toContain("--output-format json");
  });

  it("rejects when initial parse fails", async () => {
    const tool = new TestTool();
    await expect(tool.execute({ begin: "not-a-date" })).rejects.toThrow();
  });

  it("formats Zod errors thrown during run", async () => {
    class ZodFailTool extends TestTool {
      protected async run(): Promise<CommandResult> {
        Schema.parse({ begin: "not-a-date" });
        return {
          success: true,
          stdout: "",
          stderr: "",
          exitCode: 0,
          command: "",
          duration: 0,
        };
      }
    }

    const tool = new ZodFailTool();
    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toBe("Validation error");
    expect(result.details?.[0].path).toBe("begin");
  });

  it("handles runtime errors", async () => {
    class FailingTool extends TestTool {
      protected async run(): Promise<CommandResult> {
        throw new Error("boom");
      }
    }

    const tool = new FailingTool();
    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toBe("Error");
    expect(result.message).toBe("boom");
  });

  it("handles unknown error types", async () => {
    class WeirdTool extends TestTool {
      protected async run(): Promise<CommandResult> {
        throw "weird";
      }
    }

    const tool = new WeirdTool();
    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unknown error");
    expect(result.message).toBe("weird");
  });

  it("reports unsupported output format", async () => {
    const tool = new NoFormatTool();
    const result = await tool.execute({ outputFormat: "csv" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("ValidationError");
    expect(result.message).toContain("outputFormat");
  });

  it("skips output format when not requested", async () => {
    const tool = new NoFormatTool("/default.journal");
    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.data).toContain("--file /default.journal");
    expect(result.data).not.toContain("--output-format");
  });

  it("builds all common option flags", async () => {
    const tool = new FullOptionsTool();
    const result = await tool.execute({
      file: "ledger.journal",
      begin: "2025-01-01",
      end: "2025-02-01",
      period: "monthly",
      daily: true,
      weekly: true,
      monthly: true,
      quarterly: true,
      yearly: true,
      depth: 3,
      real: true,
      empty: true,
      cost: true,
      market: true,
      exchange: "USD",
      cleared: true,
      pending: true,
      unmarked: true,
      outputFormat: "csv",
    });

    const cmd = result.metadata.command;
    [
      "--file ledger.journal",
      "--begin 2025-01-01",
      "--end 2025-02-01",
      "--period monthly",
      "--daily",
      "--weekly",
      "--monthly",
      "--quarterly",
      "--yearly",
      "--depth 3",
      "--real",
      "--empty",
      "--cost",
      "--market",
      "--exchange USD",
      "--cleared",
      "--pending",
      "--unmarked",
      "--output-format csv",
    ].forEach((flag) => {
      expect(cmd).toContain(flag);
    });
  });

  it("omits end flag when provided as null", async () => {
    const tool = new FullOptionsTool();
    const result = await tool.execute({ end: null });

    expect(result.success).toBe(true);
    expect(result.metadata.command).not.toContain("--end");
  });
});

describe("QueryableTool", () => {
  it("parses queries with quoted segments", () => {
    class QueryTool extends QueryableTool<typeof Schema> {
      readonly metadata = {
        name: "query",
        description: "",
        schema: Schema,
      } as const;

      protected getCommand(): string {
        return "print";
      }

      protected buildArgs(input: z.infer<typeof Schema>): string[] {
        const args: string[] = [];
        this.addQueryArgs(args, input.query);
        return args;
      }

      public exposeBuildArgs(input: z.infer<typeof Schema>): string[] {
        return this.buildArgs(input);
      }
    }

    const tool = new QueryTool();
    const args = tool.exposeBuildArgs({
      query: 'tag:"foo bar" status:pending',
    });

    expect(args).toEqual(["tag:foo bar", "status:pending"]);
  });
});
