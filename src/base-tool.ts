import { z } from "zod";
import { HLedgerExecutor } from "./executor.js";
import { CommonOptionsSchema, CommandResult, OutputFormatSchema, ValidationError } from "./types.js";

export interface ToolMetadata<TSchema extends z.AnyZodObject> {
  name: string;
  description: string;
  schema: TSchema;
}

export abstract class BaseTool<TSchema extends z.AnyZodObject> {
  abstract readonly metadata: ToolMetadata<TSchema>;
  protected readonly journalFilePath?: string;

  constructor(journalFilePath?: string) {
    this.journalFilePath = journalFilePath;
  }

  /**
   * Execute the tool with validated input
   */
  async execute(input: unknown): Promise<any> {
    const validatedInput = this.metadata.schema.parse(input);

    try {
      const result = await this.run(validatedInput);
      return this.formatResponse(result);
    } catch (error) {
      return this.formatError(error);
    }
  }

  /**
   * Abstract method to be implemented by concrete tools
   */
  protected abstract run(input: z.infer<TSchema>): Promise<CommandResult>;

  /**
   * Format successful response
   */
  protected formatResponse(result: CommandResult): any {
    return {
      success: true,
      data: result.stdout,
      metadata: {
        command: result.command,
        duration: result.duration,
        exitCode: result.exitCode,
      },
    };
  }

  /**
   * Format error response
   */
  protected formatError(error: unknown): any {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Validation error",
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      };
    }

    if (error instanceof Error) {
      return {
        success: false,
        error: error.name,
        message: error.message,
      };
    }

    return {
      success: false,
      error: "Unknown error",
      message: String(error),
    };
  }

  /**
   * Build command arguments from common options
   */
  protected buildCommonArgs(options: unknown): string[] {
    const normalized = CommonOptionsSchema.parse(options ?? {});
    const args: string[] = [];

    // Use file from options, or fall back to constructor-provided journal file path
    const fileToUse = normalized.file || this.journalFilePath;
    if (fileToUse) args.push('--file', fileToUse);
    if (normalized.begin) args.push('--begin', normalized.begin);
    if (normalized.end) args.push('--end', normalized.end);
    if (normalized.period) args.push('--period', normalized.period);
    if (normalized.daily) args.push('--daily');
    if (normalized.weekly) args.push('--weekly');
    if (normalized.monthly) args.push('--monthly');
    if (normalized.quarterly) args.push('--quarterly');
    if (normalized.yearly) args.push('--yearly');
    if (normalized.depth) args.push('--depth', normalized.depth.toString());
    if (normalized.real) args.push('--real');
    if (normalized.empty) args.push('--empty');
    if (normalized.cost) args.push('--cost');
    if (normalized.market) args.push('--market');
    if (normalized.exchange) args.push('--exchange', normalized.exchange);
    if (normalized.cleared) args.push('--cleared');
    if (normalized.pending) args.push('--pending');
    if (normalized.unmarked) args.push('--unmarked');

    return args;
  }

  /**
   * Add output format argument
   */
  protected addOutputFormat(args: string[], format?: z.infer<typeof OutputFormatSchema>): void {
    if (!this.supportsOutputFormat()) {
      if (format) {
        throw new ValidationError('outputFormat is not supported for this tool');
      }
      return;
    }

    const effectiveFormat = format ?? this.defaultOutputFormat();
    if (effectiveFormat && effectiveFormat !== 'txt') {
      args.push('--output-format', effectiveFormat);
    }
  }

  /**
   * Whether this tool supports hledger's --output-format flag.
   */
  protected supportsOutputFormat(): boolean {
    return true;
  }

  /**
   * Default output format to request when supported.
   */
  protected defaultOutputFormat(): z.infer<typeof OutputFormatSchema> | undefined {
    return 'csv';
  }
}

/**
 * Base class for simple reporting tools
 */
export abstract class SimpleReportTool<TSchema extends z.AnyZodObject> extends BaseTool<TSchema> {
  protected async run(input: z.infer<TSchema>): Promise<CommandResult> {
    const args = this.buildArgs(input);
    return await HLedgerExecutor.execute(this.getCommand(), args);
  }

  protected abstract getCommand(): string;
  protected abstract buildArgs(input: z.infer<TSchema>): string[];
}

/**
 * Base class for tools that support queries
 */
export abstract class QueryableTool<TSchema extends z.AnyZodObject> extends SimpleReportTool<TSchema> {
  protected addQueryArgs(args: string[], query?: string): void {
    if (query) {
      // Split query on spaces but respect quotes
      const queryParts = this.parseQuery(query);
      args.push(...queryParts);
    }
  }

  private parseQuery(query: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < query.length; i++) {
      const char = query[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
      } else if (char === ' ' && !inQuotes) {
        if (current.trim()) {
          parts.push(current.trim());
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts;
  }
}
