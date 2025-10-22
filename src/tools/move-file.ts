import { z } from "zod";
import { promises as fs } from "fs";
import path from "node:path";
import type { ToolMetadata } from "../base-tool.js";
import { BaseTool } from "../base-tool.js";
import { ValidationError, type CommandResult } from "../types.js";

// Allowed file extensions for receipts (PDF and common image formats)
const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
  ".tiff",
  ".tif",
] as const;

const MoveFileInputSchema = z.object({
  sourcePath: z
    .string()
    .min(1, "Source path is required")
    .describe("The current path to the file to move or rename"),
  destinationPath: z
    .string()
    .min(1, "Destination path is required")
    .describe(
      "The new path for the file (can be a new directory, a new filename, or both)",
    ),
  overwrite: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, overwrite the destination file if it exists"),
});

interface MoveFileOptions {
  allowFileOperations?: boolean;
}

export class MoveFileTool extends BaseTool<typeof MoveFileInputSchema> {
  readonly metadata: ToolMetadata<typeof MoveFileInputSchema> = {
    name: "hledger_move_file",
    description:
      "Move or rename receipt files (PDFs and images only). Useful for organizing receipts and documentation. Only enabled when --allow-file-operations flag is set.",
    schema: MoveFileInputSchema,
  };

  private readonly allowFileOperations: boolean;

  constructor(journalFilePath?: string, options: MoveFileOptions = {}) {
    super(journalFilePath);
    this.allowFileOperations = options.allowFileOperations ?? false;
  }

  protected async run(
    input: z.infer<typeof MoveFileInputSchema>,
  ): Promise<CommandResult> {
    if (!this.allowFileOperations) {
      throw new ValidationError(
        "File operations are disabled. Enable with --allow-file-operations flag.",
      );
    }

    const start = Date.now();

    // Validate and normalize paths
    const sourcePath = path.resolve(input.sourcePath);
    const destinationPath = path.resolve(input.destinationPath);

    // Validate file extension
    const sourceExt = path.extname(sourcePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(sourceExt as any)) {
      throw new ValidationError(
        `File type not allowed. Only PDF and image files can be moved. Allowed extensions: ${ALLOWED_EXTENSIONS.join(", ")}`,
      );
    }

    // Check if source file exists
    try {
      const stats = await fs.stat(sourcePath);
      if (!stats.isFile()) {
        throw new ValidationError(
          `Source path is not a file: ${sourcePath}`,
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ValidationError(`Source file not found: ${sourcePath}`);
      }
      throw error;
    }

    // Check if destination exists
    let destinationExists = false;
    let destIsDirectory = false;
    try {
      const destStats = await fs.stat(destinationPath);
      destinationExists = true;
      destIsDirectory = destStats.isDirectory();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    // Determine the final destination path
    let finalDestPath = destinationPath;
    if (destIsDirectory) {
      // If destination is a directory, keep the same filename
      finalDestPath = path.join(destinationPath, path.basename(sourcePath));
    }

    // Ensure destination directory exists
    const destDir = path.dirname(finalDestPath);
    try {
      await fs.mkdir(destDir, { recursive: true });
    } catch (error) {
      throw new ValidationError(
        `Failed to create destination directory: ${destDir}`,
      );
    }

    // Check if final destination file exists
    let finalDestExists = false;
    try {
      await fs.stat(finalDestPath);
      finalDestExists = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    if (finalDestExists && !input.overwrite) {
      throw new ValidationError(
        `Destination file already exists: ${finalDestPath}. Use overwrite: true to replace it.`,
      );
    }

    // Validate destination extension matches source
    const destExt = path.extname(finalDestPath).toLowerCase();
    if (destExt !== sourceExt) {
      throw new ValidationError(
        `Destination file extension (${destExt}) must match source extension (${sourceExt})`,
      );
    }

    // Perform the move operation
    try {
      await fs.rename(sourcePath, finalDestPath);
    } catch (error) {
      // If rename fails (e.g., across file systems), try copy + delete
      try {
        await fs.copyFile(sourcePath, finalDestPath);
        await fs.unlink(sourcePath);
      } catch (fallbackError) {
        throw new ValidationError(
          `Failed to move file: ${(fallbackError as Error).message}`,
        );
      }
    }

    const duration = Date.now() - start;

    return {
      success: true,
      stdout: JSON.stringify(
        {
          moved: true,
          sourcePath,
          destinationPath: finalDestPath,
          overwritten: finalDestExists,
        },
        null,
        2,
      ),
      stderr: "",
      exitCode: 0,
      command: `move-file ${sourcePath} -> ${finalDestPath}`,
      duration,
    };
  }

  protected supportsOutputFormat(): boolean {
    return false;
  }
}
