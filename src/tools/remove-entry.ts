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
import { normalizeEntryForComparison, JournalFileEditor } from "../utils/journal-file.js";
import { FilePathSchema, ValidationError } from "../types.js";

const EntryLocationSchema = z.object({
  file: FilePathSchema,
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
});

const RemoveEntryInputSchema = z.object({
  entry: z.string().min(1, "Entry text is required"),
  location: EntryLocationSchema,
  dryRun: z
    .boolean()
    .optional()
    .describe("If true, validate removal without writing changes"),
  collapseWhitespace: z
    .boolean()
    .optional()
    .describe(
      "If true, also remove a following blank line to keep spacing consistent",
    ),
});

interface RemoveEntryOptions {
  readOnly?: boolean;
  skipBackup?: boolean;
}

export class RemoveEntryTool extends BaseTool<typeof RemoveEntryInputSchema> {
  readonly metadata: ToolMetadata<typeof RemoveEntryInputSchema> = {
    name: "hledger_remove_entry",
    description: "Remove a complete journal entry by exact match",
    schema: RemoveEntryInputSchema,
  };

  private readonly readOnly: boolean;
  private readonly skipBackup: boolean;

  constructor(journalFilePath?: string, options: RemoveEntryOptions = {}) {
    super(journalFilePath);
    this.readOnly = options.readOnly ?? false;
    this.skipBackup = options.skipBackup ?? false;
  }

  protected supportsOutputFormat(): boolean {
    return false;
  }

  protected async run(input: z.infer<typeof RemoveEntryInputSchema>) {
    const dryRun = input.dryRun ?? false;

    if (this.readOnly && !dryRun) {
      throw new ValidationError(
        "Remove entry is disabled while the server is running in read-only mode",
      );
    }

    const { file, startLine, endLine } = input.location;
    const normalizedEntry = normalizeEntryForComparison(input.entry);

    const resolvedPath = await this.resolveTargetFile(file);
    const workspace = await createJournalWorkspace(resolvedPath);

    try {
      const content = await fs.readFile(workspace.tempPath, "utf8");
      const editor = new JournalFileEditor(content);

      const existingEntry = normalizeEntryForComparison(
        editor.extract(startLine, endLine),
      );

      if (normalizedEntry !== existingEntry) {
        throw new ValidationError(
          "Entry text does not match the content at the specified location",
        );
      }

      const { removedText, trailingBlankRemoved } = editor.remove(
        startLine,
        endLine,
        input.collapseWhitespace ?? true,
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
            removedEntry: removedText,
            trailingBlankRemoved,
            checkOutput: checkResult.stdout,
          }),
          stderr: checkResult.stderr,
          exitCode: 0,
          command: `remove-entry --dry-run ${resolvedPath}`,
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
          removedEntry: removedText,
          trailingBlankRemoved,
          checkOutput: checkResult.stdout,
        }),
        stderr: checkResult.stderr,
        exitCode: 0,
        command: `remove-entry ${resolvedPath}`,
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
