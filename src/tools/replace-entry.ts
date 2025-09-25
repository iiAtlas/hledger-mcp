import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ToolMetadata } from "../base-tool.js";
import { BaseTool } from "../base-tool.js";
import { HLedgerExecutor } from "../executor.js";
import {
  createJournalWorkspace,
  cleanupJournalWorkspace,
  finalizeJournalWorkspace,
} from "../journal-writer.js";
import {
  JournalFileEditor,
  normalizeEntryForComparison,
} from "../utils/journal-file.js";
import { FilePathSchema, ValidationError } from "../types.js";

const EntryLocationSchema = z.object({
  file: FilePathSchema,
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
});

const ReplaceEntryInputSchema = z.object({
  original: z.string().min(1, "Original entry text is required"),
  replacement: z.string().min(1, "Replacement entry text is required"),
  location: EntryLocationSchema,
  dryRun: z
    .boolean()
    .optional()
    .describe("If true, validate replacement without writing changes"),
});

interface ReplaceEntryOptions {
  readOnly?: boolean;
  skipBackup?: boolean;
}

export class ReplaceEntryTool extends BaseTool<typeof ReplaceEntryInputSchema> {
  readonly metadata: ToolMetadata<typeof ReplaceEntryInputSchema> = {
    name: "hledger_replace_entry",
    description: "Replace a complete journal entry with new content",
    schema: ReplaceEntryInputSchema,
  };

  private readonly readOnly: boolean;
  private readonly skipBackup: boolean;

  constructor(journalFilePath?: string, options: ReplaceEntryOptions = {}) {
    super(journalFilePath);
    this.readOnly = options.readOnly ?? false;
    this.skipBackup = options.skipBackup ?? false;
  }

  protected supportsOutputFormat(): boolean {
    return false;
  }

  protected async run(input: z.infer<typeof ReplaceEntryInputSchema>) {
    const dryRun = input.dryRun ?? false;

    if (this.readOnly && !dryRun) {
      throw new ValidationError(
        "Replace entry is disabled while the server is running in read-only mode",
      );
    }

    const { file, startLine, endLine } = input.location;
    const resolvedPath = await this.resolveTargetFile(file);

    const workspace = await createJournalWorkspace(resolvedPath);

    try {
      const content = await fs.readFile(workspace.tempPath, "utf8");
      const editor = new JournalFileEditor(content);

      const existingEntry = normalizeEntryForComparison(
        editor.extract(startLine, endLine),
      );
      const expectedOriginal = normalizeEntryForComparison(input.original);

      if (existingEntry !== expectedOriginal) {
        throw new ValidationError(
          "Original entry text does not match the content at the specified location",
        );
      }

      const { insertedText } = editor.replace(
        startLine,
        endLine,
        input.replacement,
      );

      await fs.writeFile(workspace.tempPath, editor.toString(), "utf8");

      const checkResult = await HLedgerExecutor.execute("check", [
        "--file",
        workspace.tempPath,
      ]);

      if (dryRun) {
        await cleanupJournalWorkspace(workspace);
        return {
          success: true,
          stdout: JSON.stringify({
            applied: false,
            journalPath: resolvedPath,
            insertedEntry: insertedText,
            checkOutput: checkResult.stdout,
          }),
          stderr: checkResult.stderr,
          exitCode: 0,
          command: `replace-entry --dry-run ${resolvedPath}`,
          duration: checkResult.duration,
        };
      }

      const backupPath = await finalizeJournalWorkspace(workspace, {
        skipBackup: this.skipBackup,
      });
      await cleanupJournalWorkspace(workspace);

      return {
        success: true,
        stdout: JSON.stringify({
          applied: true,
          journalPath: resolvedPath,
          backupPath,
          insertedEntry: insertedText,
          checkOutput: checkResult.stdout,
        }),
        stderr: checkResult.stderr,
        exitCode: 0,
        command: `replace-entry ${resolvedPath}`,
        duration: checkResult.duration,
      };
    } catch (error) {
      await cleanupJournalWorkspace(workspace).catch(() => undefined);
      throw error;
    }
  }

  private async resolveTargetFile(file: string): Promise<string> {
    if (path.isAbsolute(file)) {
      return file;
    }

    if (this.journalFilePath) {
      const baseDir = path.dirname(await fs.realpath(this.journalFilePath));
      return path.resolve(baseDir, file);
    }

    return path.resolve(file);
  }
}
