import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import type { ToolMetadata } from "../base-tool.js";
import { BaseTool } from "../base-tool.js";
import { HLedgerExecutor } from "../executor.js";
import { FilePathSchema, ValidationError } from "../types.js";

const PostingInstructionSchema = z.object({
  account: z.string().min(1, "Account is required"),
  amount: z.string().min(1, "Amount expression is required"),
});

const RewriteInputSchema = z.object({
  file: FilePathSchema.optional(),
  query: z.string().optional(),
  addPostings: z
    .array(PostingInstructionSchema)
    .min(1, "At least one add-posting instruction is required"),
  diff: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

interface RewriteToolOptions {
  readOnly?: boolean;
  skipBackup?: boolean;
}

interface RewriteWorkspace {
  rootDir: string;
  workspaceRoot: string;
  targetOriginal: string;
  targetCopy: string;
  fileMap: Map<string, string>;
  copyToOriginal: Map<string, string>;
}

interface FilePatch {
  filePath: string;
  hunks: Hunk[];
}

interface Hunk {
  oldStart: number;
  oldLength: number;
  newStart: number;
  newLength: number;
  lines: HunkLine[];
}

interface HunkLine {
  type: "context" | "add" | "remove";
  content: string;
}

export class RewriteTransactionsTool extends BaseTool<
  typeof RewriteInputSchema
> {
  readonly metadata: ToolMetadata<typeof RewriteInputSchema> = {
    name: "hledger_rewrite",
    description:
      "Rewrite matching transactions by adding postings using hledger's rewrite command",
    schema: RewriteInputSchema,
  };

  private readonly readOnly: boolean;
  private readonly skipBackup: boolean;

  constructor(journalFilePath?: string, options: RewriteToolOptions = {}) {
    super(journalFilePath);
    this.readOnly = options.readOnly ?? false;
    this.skipBackup = options.skipBackup ?? false;
  }

  protected supportsOutputFormat(): boolean {
    return false;
  }

  protected async run(input: z.infer<typeof RewriteInputSchema>) {
    const dryRun = input.dryRun ?? false;

    if (this.readOnly && !dryRun) {
      throw new ValidationError(
        "Rewrite operations are disabled while the server is running in read-only mode",
      );
    }

    const targetFile = input.file ?? this.journalFilePath;
    if (!targetFile) {
      throw new ValidationError("No journal file specified");
    }

    const workspace = await this.createRewriteWorkspace(
      path.resolve(targetFile),
    );
    const args = this.buildRewriteArgs(input, workspace);

    try {
      const rewriteResult = await HLedgerExecutor.execute("rewrite", args);
      const rawDiff = rewriteResult.stdout ?? "";
      const normalizedDiff = rawDiff
        ? rawDiff.split(workspace.workspaceRoot).join(workspace.rootDir)
        : rawDiff;

      if (dryRun) {
        await this.cleanupRewriteWorkspace(workspace);
        return {
          success: true,
          stdout: JSON.stringify({
            applied: false,
            command: rewriteResult.command,
            diff: normalizedDiff || undefined,
          }),
          stderr: rewriteResult.stderr,
          exitCode: rewriteResult.exitCode,
          command: rewriteResult.command,
          duration: rewriteResult.duration,
        };
      }

      if (!rawDiff.trim()) {
        await this.cleanupRewriteWorkspace(workspace);
        return {
          success: true,
          stdout: JSON.stringify({
            applied: false,
            command: rewriteResult.command,
            diff: undefined,
            changedFiles: [],
          }),
          stderr: rewriteResult.stderr,
          exitCode: rewriteResult.exitCode,
          command: rewriteResult.command,
          duration: rewriteResult.duration,
        };
      }

      const patches = this.parseUnifiedDiff(rawDiff, workspace.workspaceRoot);
      await this.applyPatchesToWorkspace(patches);

      const checkResult = await HLedgerExecutor.execute("check", [
        "--file",
        workspace.targetCopy,
      ]);

      const changedFiles = new Set<string>();
      for (const patch of patches) {
        changedFiles.add(patch.filePath);
      }

      const backupMap = await this.finalizeRewrite(workspace, changedFiles);
      await this.cleanupRewriteWorkspace(workspace);

      const changedOriginalFiles = Array.from(
        changedFiles,
        (file) => workspace.copyToOriginal.get(file) ?? file,
      );
      const changedFilesForOutput = changedOriginalFiles.map((file) =>
        path.relative(workspace.rootDir, file),
      );
      const formattedBackupMap: Record<string, string | undefined> = {};
      for (const [originalPath, backupPath] of Object.entries(backupMap)) {
        const relativeKey = path.relative(workspace.rootDir, originalPath);
        formattedBackupMap[relativeKey] = backupPath;
      }

      return {
        success: true,
        stdout: JSON.stringify({
          applied: true,
          command: rewriteResult.command,
          diff: normalizedDiff || undefined,
          changedFiles: changedFilesForOutput,
          backupPaths: formattedBackupMap,
          checkOutput: checkResult.stdout,
        }),
        stderr: [rewriteResult.stderr, checkResult.stderr]
          .filter(Boolean)
          .join("\n"),
        exitCode: 0,
        command: rewriteResult.command,
        duration: rewriteResult.duration + checkResult.duration,
      };
    } catch (error) {
      await this.cleanupRewriteWorkspace(workspace).catch(() => undefined);
      throw error;
    }
  }

  private buildRewriteArgs(
    input: z.infer<typeof RewriteInputSchema>,
    workspace: RewriteWorkspace,
  ): string[] {
    const args: string[] = ["--file", workspace.targetCopy, "--diff"];

    for (const posting of input.addPostings) {
      args.push("--add-posting", `${posting.account}  ${posting.amount}`);
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
      } else if (char === " " && !inQuotes) {
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

  private async createRewriteWorkspace(
    targetOriginal: string,
  ): Promise<RewriteWorkspace> {
    const originalReal = await fs.realpath(targetOriginal);
    const rootDir = path.dirname(originalReal);
    const workspaceTemp = await fs.mkdtemp(
      path.join(os.tmpdir(), "hledger-rewrite-"),
    );
    const workspaceRoot = await fs.realpath(workspaceTemp);
    const fileMap = new Map<string, string>();
    const copyToOriginal = new Map<string, string>();
    const visited = new Set<string>();

    await this.copyWithIncludes(
      originalReal,
      rootDir,
      workspaceRoot,
      fileMap,
      copyToOriginal,
      visited,
    );

    const targetCopy = fileMap.get(originalReal);
    if (!targetCopy) {
      throw new Error("Failed to prepare rewrite workspace");
    }

    return {
      rootDir,
      workspaceRoot,
      targetOriginal: originalReal,
      targetCopy,
      fileMap,
      copyToOriginal,
    };
  }

  private async copyWithIncludes(
    filePath: string,
    rootDir: string,
    workspaceRoot: string,
    fileMap: Map<string, string>,
    copyToOriginal: Map<string, string>,
    visited: Set<string>,
  ): Promise<void> {
    const resolved = await fs.realpath(filePath);
    if (visited.has(resolved)) {
      return;
    }
    visited.add(resolved);

    let relative = path.relative(rootDir, resolved);
    if (relative.startsWith("..")) {
      const sanitized = resolved.replace(/[:\\/]/g, "_");
      relative = path.join("__external__", sanitized);
    }

    const destination = path.join(workspaceRoot, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(resolved, destination);
    fileMap.set(resolved, destination);
    copyToOriginal.set(destination, resolved);

    const content = await fs.readFile(destination, "utf8");
    const includeRegex = /^\s*!include\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = includeRegex.exec(content)) !== null) {
      let includeTarget = match[1].trim();
      if (!includeTarget) continue;
      const semicolonIndex = includeTarget.indexOf(";");
      if (semicolonIndex >= 0) {
        includeTarget = includeTarget.slice(0, semicolonIndex).trim();
      }
      includeTarget = includeTarget.replace(/^['"]|['"]$/g, "");
      const includePaths = await this.expandIncludePaths(
        path.dirname(resolved),
        includeTarget,
      );
      for (const includePath of includePaths) {
        await this.copyWithIncludes(
          includePath,
          rootDir,
          workspaceRoot,
          fileMap,
          copyToOriginal,
          visited,
        );
      }
    }
  }

  private async expandIncludePaths(
    baseDir: string,
    pattern: string,
  ): Promise<string[]> {
    const hasGlob = /[*?]/.test(pattern);
    if (!hasGlob) {
      const resolved = path.resolve(baseDir, pattern);
      return [await fs.realpath(resolved)];
    }

    const absolutePattern = path.resolve(baseDir, pattern);
    const dir = path.dirname(absolutePattern);
    const regex = this.globToRegExp(path.basename(absolutePattern));
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const matches = entries
      .filter((entry) => entry.isFile() && regex.test(entry.name))
      .map((entry) => path.join(dir, entry.name));
    return Promise.all(matches.map((matchPath) => fs.realpath(matchPath)));
  }

  private globToRegExp(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const regexString = `^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`;
    return new RegExp(regexString);
  }

  private parseUnifiedDiff(diff: string, workspaceRoot: string): FilePatch[] {
    const patches: FilePatch[] = [];
    const lines = diff.split("\n");
    let currentPatch: FilePatch | undefined;
    let currentHunk: Hunk | undefined;

    for (const line of lines) {
      if (line.startsWith("--- ")) {
        currentPatch = undefined;
        currentHunk = undefined;
        continue;
      }

      if (line.startsWith("+++ ")) {
        const filePath = line.slice(4).trim();
        if (!filePath.startsWith(workspaceRoot)) {
          throw new Error(
            `Diff references path outside workspace: ${filePath}`,
          );
        }
        currentPatch = { filePath, hunks: [] };
        patches.push(currentPatch);
        continue;
      }

      if (line.startsWith("@@")) {
        const match = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
        if (!match || !currentPatch) {
          continue;
        }
        currentHunk = {
          oldStart: Number(match[1]),
          oldLength: match[2] ? Number(match[2]) : 1,
          newStart: Number(match[3]),
          newLength: match[4] ? Number(match[4]) : 1,
          lines: [],
        };
        currentPatch.hunks.push(currentHunk);
        continue;
      }

      if (!currentHunk) {
        continue;
      }

      const prefix = line[0];
      const content = line.slice(1);
      if (prefix === " ") {
        currentHunk.lines.push({ type: "context", content });
      } else if (prefix === "+") {
        currentHunk.lines.push({ type: "add", content });
      } else if (prefix === "-") {
        currentHunk.lines.push({ type: "remove", content });
      }
    }

    return patches;
  }

  private async applyPatchesToWorkspace(patches: FilePatch[]): Promise<void> {
    for (const patch of patches) {
      const originalContent = await fs.readFile(patch.filePath, "utf8");
      const hasTrailingNewline = originalContent.endsWith("\n");
      let lines = hasTrailingNewline
        ? originalContent.slice(0, -1).split("\n")
        : originalContent.split("\n");
      if (lines.length === 1 && lines[0] === "") {
        lines = [];
      }

      let updatedLines = lines;
      for (const hunk of patch.hunks) {
        updatedLines = this.applyHunk(updatedLines, hunk);
      }

      const newContent =
        updatedLines.join("\n") + (hasTrailingNewline ? "\n" : "");
      await fs.writeFile(patch.filePath, newContent, "utf8");
    }
  }

  private applyHunk(lines: string[], hunk: Hunk): string[] {
    const result: string[] = [];
    const startIndex = Math.max(0, hunk.oldStart - 1);
    result.push(...lines.slice(0, startIndex));

    let pointer = startIndex;
    for (const change of hunk.lines) {
      if (change.type === "context") {
        const currentLine = lines[pointer] ?? "";
        if (currentLine !== change.content) {
          throw new Error(
            `Patch mismatch on context line: expected "${change.content}" got "${currentLine}"`,
          );
        }
        result.push(currentLine);
        pointer++;
      } else if (change.type === "remove") {
        const currentLine = lines[pointer] ?? "";
        if (currentLine !== change.content) {
          throw new Error(
            `Patch mismatch on removed line: expected "${change.content}" got "${currentLine}"`,
          );
        }
        pointer++;
      } else if (change.type === "add") {
        result.push(change.content);
      }
    }

    result.push(...lines.slice(pointer));
    return result;
  }

  private async finalizeRewrite(
    workspace: RewriteWorkspace,
    changedFiles: Set<string>,
  ): Promise<Record<string, string | undefined>> {
    const backupMap: Record<string, string | undefined> = {};
    if (changedFiles.size === 0) {
      return backupMap;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    for (const workspacePath of changedFiles) {
      const originalPath = workspace.copyToOriginal.get(workspacePath);
      if (!originalPath) {
        continue;
      }

      const originalExists = await this.fileExists(originalPath);
      if (originalExists && !this.skipBackup) {
        const backupPath = `${originalPath}.bak-${timestamp}`;
        await fs.copyFile(originalPath, backupPath);
        backupMap[originalPath] = backupPath;
      }

      await fs.mkdir(path.dirname(originalPath), { recursive: true });
      await fs.copyFile(workspacePath, originalPath);
    }

    return backupMap;
  }

  private async cleanupRewriteWorkspace(
    workspace: RewriteWorkspace,
  ): Promise<void> {
    await fs.rm(workspace.workspaceRoot, { recursive: true, force: true });
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
