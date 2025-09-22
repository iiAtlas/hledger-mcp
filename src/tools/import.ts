import path from "node:path";
import { z } from "zod";
import { BaseTool, ToolMetadata } from "../base-tool.js";
import { HLedgerExecutor } from "../executor.js";
import {
  createJournalWorkspace,
  cleanupJournalWorkspace,
  finalizeJournalWorkspace,
  JournalWorkspace,
} from "../journal-writer.js";
import { FilePathSchema, ValidationError } from "../types.js";

const ImportInputSchema = z.object({
  file: FilePathSchema.optional(),
  dataFiles: z.array(FilePathSchema).nonempty("At least one data file is required"),
  rulesFile: FilePathSchema.optional(),
  catchup: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  auto: z.boolean().optional(),
  forecast: z.string().optional().describe("Optional forecast period value"),
  ignoreAssertions: z.boolean().optional(),
  strict: z.boolean().optional(),
  verboseTags: z.boolean().optional(),
});

interface ImportToolOptions {
  readOnly?: boolean;
  skipBackup?: boolean;
}

export class ImportTransactionsTool extends BaseTool<typeof ImportInputSchema> {
  readonly metadata: ToolMetadata<typeof ImportInputSchema> = {
    name: "hledger_import",
    description: "Import transactions from external data files using hledger's import command",
    schema: ImportInputSchema,
  };

  private readonly readOnly: boolean;
  private readonly skipBackup: boolean;

  constructor(journalFilePath?: string, options: ImportToolOptions = {}) {
    super(journalFilePath);
    this.readOnly = options.readOnly ?? false;
    this.skipBackup = options.skipBackup ?? false;
  }

  protected supportsOutputFormat(): boolean {
    return false;
  }

  protected async run(input: z.infer<typeof ImportInputSchema>) {
    const dryRun = input.dryRun ?? false;

    if (this.readOnly && !dryRun) {
      throw new ValidationError("Import operations are disabled while the server is running in read-only mode");
    }

    const targetFile = input.file ?? this.journalFilePath;
    if (!targetFile) {
      throw new ValidationError("No journal file specified");
    }

    const workspace = await createJournalWorkspace(path.resolve(targetFile));
    const args = this.buildImportArgs(input, workspace);

    try {
      const importResult = await HLedgerExecutor.execute("import", args);

      if (dryRun) {
        await cleanupJournalWorkspace(workspace);
        return {
          success: true,
          stdout: JSON.stringify({
            applied: false,
            command: importResult.command,
            importOutput: importResult.stdout,
          }),
          stderr: importResult.stderr,
          exitCode: importResult.exitCode,
          command: importResult.command,
          duration: importResult.duration,
        };
      }

      const checkResult = await HLedgerExecutor.execute("check", ["--file", workspace.tempPath]);
      const backupPath = await finalizeJournalWorkspace(workspace, { skipBackup: this.skipBackup });

      return {
        success: true,
        stdout: JSON.stringify({
          applied: true,
          journalPath: workspace.journalPath,
          backupPath,
          command: importResult.command,
          importOutput: importResult.stdout,
          checkOutput: checkResult.stdout,
        }),
        stderr: [importResult.stderr, checkResult.stderr].filter(Boolean).join("\n"),
        exitCode: 0,
        command: importResult.command,
        duration: importResult.duration + checkResult.duration,
      };
    } catch (error) {
      await cleanupJournalWorkspace(workspace).catch(() => undefined);
      throw error;
    }
  }

  private buildImportArgs(
    input: z.infer<typeof ImportInputSchema>,
    workspace: JournalWorkspace
  ): string[] {
    const args: string[] = ["--file", workspace.tempPath];

    if (input.rulesFile) {
      args.push("--rules", path.resolve(input.rulesFile));
    }

    if (input.catchup) {
      args.push("--catchup");
    }

    if (input.auto) {
      args.push("--auto");
    }

    if (input.forecast) {
      args.push(`--forecast=${input.forecast}`);
    }

    if (input.ignoreAssertions) {
      args.push("--ignore-assertions");
    }

    if (input.strict) {
      args.push("--strict");
    }

    if (input.verboseTags) {
      args.push("--verbose-tags");
    }

    if (input.dryRun) {
      args.push("--dry-run");
    }

    for (const dataFile of input.dataFiles) {
      args.push(path.resolve(dataFile));
    }

    return args;
  }
}
