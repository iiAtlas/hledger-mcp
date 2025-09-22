import { z } from "zod";
import path from "node:path";
import { BaseTool, ToolMetadata } from "../base-tool.js";
import { appendTransactionSafely } from "../journal-writer.js";
import { DateSchema, FilePathSchema, ValidationError } from "../types.js";

const PostingSchema = z.object({
  account: z.string().min(1, "Account is required"),
  amount: z.string().min(1, "Amount is required").optional(),
  comment: z.string().optional(),
  tags: z.record(z.string()).optional(),
});

const AddTransactionInputSchema = z.object({
  file: FilePathSchema.optional(),
  date: DateSchema.describe("Transaction date (YYYY, YYYY-MM, or YYYY-MM-DD)"),
  status: z.enum(["*", "!"]).optional().describe("Transaction status: cleared (*) or pending (!)"),
  code: z.string().optional().describe("Optional transaction code"),
  description: z.string().min(1, "Description is required"),
  comment: z.string().optional().describe("Optional comment for the transaction header"),
  postings: z.array(PostingSchema).min(2, "At least two postings are required"),
  notes: z.array(z.string()).optional().describe("Additional comment lines to append after postings"),
  dryRun: z.boolean().optional().describe("If true, validates without modifying the journal"),
});

interface AddTransactionOptions {
  readOnly?: boolean;
  skipBackup?: boolean;
}

export class AddTransactionTool extends BaseTool<typeof AddTransactionInputSchema> {
  readonly metadata: ToolMetadata<typeof AddTransactionInputSchema> = {
    name: "hledger_add_transaction",
    description: "Add a new transaction to the journal file using structured input",
    schema: AddTransactionInputSchema,
  };

  private readonly readOnly: boolean;
  private readonly skipBackup: boolean;

  constructor(journalFilePath?: string, options: AddTransactionOptions = {}) {
    super(journalFilePath);
    this.readOnly = options.readOnly ?? false;
    this.skipBackup = options.skipBackup ?? false;
  }

  protected async run(input: z.infer<typeof AddTransactionInputSchema>) {
    if (this.readOnly) {
      throw new ValidationError("Add transactions are disabled while the server is running in read-only mode");
    }

    const start = Date.now();
    const targetFile = input.file ?? this.journalFilePath;

    if (!targetFile) {
      throw new ValidationError("No journal file specified");
    }

    const transactionText = this.buildTransaction(input);
    const result = await appendTransactionSafely({
      journalPath: path.resolve(targetFile),
      transaction: transactionText,
      dryRun: input.dryRun ?? false,
      skipBackup: this.skipBackup,
    });

    const duration = Date.now() - start;

    return {
      success: true,
      stdout: JSON.stringify({
        applied: result.applied,
        journalPath: result.journalPath,
        backupPath: result.backupPath,
        transaction: result.transaction,
        checkOutput: result.checkResult.stdout,
      }),
      stderr: result.checkResult.stderr,
      exitCode: 0,
      command: result.applied ? `append-transaction ${result.journalPath}` : `dry-run-append ${result.journalPath}`,
      duration,
    };
  }

  protected supportsOutputFormat(): boolean {
    return false;
  }

  private buildTransaction(input: z.infer<typeof AddTransactionInputSchema>): string {
    const headerParts: string[] = [input.date];

    if (input.status) {
      headerParts.push(input.status);
    }

    if (input.code) {
      headerParts.push(`(${input.code})`);
    }

    if (input.description) {
      headerParts.push(input.description);
    }

    let header = headerParts.join(" ");

    if (input.comment) {
      header += `  ; ${input.comment}`;
    }

    const lines = [header];

    input.postings.forEach((posting) => {
      let line = `  ${posting.account}`;
      if (posting.amount) {
        line += `  ${posting.amount}`;
      }

      if (posting.comment) {
        line += `  ; ${posting.comment}`;
      }

      if (posting.tags) {
        const tagComments = Object.entries(posting.tags).map(([key, value]) => `${key}: ${value}`);
        if (tagComments.length > 0) {
          line += `  ; ${tagComments.join(", ")}`;
        }
      }

      lines.push(line);
    });

    if (input.notes) {
      input.notes.forEach((note) => {
        lines.push(`  ; ${note}`);
      });
    }

    return lines.join("\n");
  }
}
