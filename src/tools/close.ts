import path from "node:path";
import { z } from "zod";
import { BaseTool, ToolMetadata } from "../base-tool.js";
import { appendTransactionSafely } from "../journal-writer.js";
import { CommonOptionsSchema, FilePathSchema, ValidationError } from "../types.js";
import { HLedgerExecutor } from "../executor.js";

const CloseModeSchema = z.enum(["close", "open", "clopen", "assign", "assert", "retain"]);
const AssertionTypeSchema = z.enum(["=", "==", "=*", "==*"]);
const RoundTypeSchema = z.enum(["none", "soft", "hard", "all"]);

const CloseInputSchema = CommonOptionsSchema.extend({
  file: FilePathSchema.optional(),
  mode: CloseModeSchema.optional().describe("Which closing transaction(s) to generate"),
  tagValue: z.string().optional().describe("Optional tag value for the generated transactions"),
  explicit: z.boolean().optional().describe("Show all amounts explicitly"),
  showCosts: z.boolean().optional().describe("Separate postings with different costs"),
  interleaved: z.boolean().optional().describe("Interleave source and destination postings"),
  assertionType: AssertionTypeSchema.optional().describe("Balance assertion strictness"),
  closeDescription: z.string().optional().describe("Custom description for the closing transaction"),
  closeAccount: z.string().optional().describe("Destination account for closing balances"),
  openDescription: z.string().optional().describe("Custom description for the opening transaction"),
  openAccount: z.string().optional().describe("Source account for opening balances"),
  round: RoundTypeSchema.optional().describe("Rounding style for displayed amounts"),
  query: z.string().optional().describe("Account query to select accounts to close"),
  dryRun: z.boolean().optional().describe("If true, preview the generated entries without writing them"),
});

interface CloseToolOptions {
  readOnly?: boolean;
  skipBackup?: boolean;
}

export class CloseTool extends BaseTool<typeof CloseInputSchema> {
  readonly metadata: ToolMetadata<typeof CloseInputSchema> = {
    name: "hledger_close",
    description: "Generate and optionally append closing/opening transactions to the journal",
    schema: CloseInputSchema,
  };

  private readonly readOnly: boolean;
  private readonly skipBackup: boolean;

  constructor(journalFilePath?: string, options: CloseToolOptions = {}) {
    super(journalFilePath);
    this.readOnly = options.readOnly ?? false;
    this.skipBackup = options.skipBackup ?? false;
  }

  protected supportsOutputFormat(): boolean {
    return false;
  }

  protected async run(input: z.infer<typeof CloseInputSchema>) {
    const dryRun = input.dryRun ?? false;

    if (this.readOnly && !dryRun) {
      throw new ValidationError("Close operations are disabled while the server is running in read-only mode");
    }

    const targetFile = input.file ?? this.journalFilePath;
    if (!targetFile) {
      throw new ValidationError("No journal file specified");
    }

    const args = this.buildCloseArgs(input, path.resolve(targetFile));
    const closeResult = await HLedgerExecutor.execute("close", args);
    const generated = closeResult.stdout.trim();

    if (dryRun) {
      return {
        success: true,
        stdout: JSON.stringify({
          applied: false,
          command: closeResult.command,
          generatedTransactions: generated || undefined,
        }),
        stderr: closeResult.stderr,
        exitCode: closeResult.exitCode,
        command: closeResult.command,
        duration: closeResult.duration,
      };
    }

    if (!generated) {
      return {
        success: true,
        stdout: JSON.stringify({
          applied: false,
          command: closeResult.command,
          generatedTransactions: undefined,
        }),
        stderr: closeResult.stderr,
        exitCode: closeResult.exitCode,
        command: closeResult.command,
        duration: closeResult.duration,
      };
    }

    const appendResult = await appendTransactionSafely({
      journalPath: path.resolve(targetFile),
      transaction: generated,
      skipBackup: this.skipBackup,
    });

    return {
      success: true,
      stdout: JSON.stringify({
        applied: true,
        command: closeResult.command,
        generatedTransactions: generated,
        journalPath: appendResult.journalPath,
        backupPath: appendResult.backupPath,
        checkOutput: appendResult.checkResult.stdout,
      }),
      stderr: [closeResult.stderr, appendResult.checkResult.stderr].filter(Boolean).join("\n"),
      exitCode: 0,
      command: closeResult.command,
      duration: closeResult.duration + appendResult.checkResult.duration,
    };
  }

  private buildCloseArgs(input: z.infer<typeof CloseInputSchema>, resolvedFile: string): string[] {
    const args = this.buildCommonArgs(input);

    const mode = input.mode ?? "clopen";
    const modeFlag = `--${mode}`;
    if (input.tagValue) {
      args.push(`${modeFlag}=${input.tagValue}`);
    } else {
      args.push(modeFlag);
    }

    if (input.explicit) args.push("--explicit");
    if (input.showCosts) args.push("--show-costs");
    if (input.interleaved) args.push("--interleaved");
    if (input.assertionType) args.push(`--assertion-type=${input.assertionType}`);
    if (input.closeDescription) args.push("--close-desc", input.closeDescription);
    if (input.closeAccount) args.push("--close-acct", input.closeAccount);
    if (input.openDescription) args.push("--open-desc", input.openDescription);
    if (input.openAccount) args.push("--open-acct", input.openAccount);
    if (input.round) args.push(`--round=${input.round}`);

    // Ensure we operate on the resolved file first in the list
    if (!args.includes("--file") && !args.includes("-f")) {
      args.unshift("--file", resolvedFile);
    }

    if (input.query) {
      args.push(...this.parseQuery(input.query));
    }

    return args;
  }

  private parseQuery(query: string): string[] {
    const parts: string[] = [];
    let current = "";
    let inQuotes = false;
    let quoteChar = "";

    for (let i = 0; i < query.length; i++) {
      const char = query[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = "";
      } else if (char === ' ' && !inQuotes) {
        if (current.trim()) {
          parts.push(current.trim());
          current = "";
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
