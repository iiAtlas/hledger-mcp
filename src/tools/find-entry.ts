import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ToolMetadata } from "../base-tool.js";
import { BaseTool } from "../base-tool.js";
import { HLedgerExecutor } from "../executor.js";
import { FilePathSchema, ValidationError } from "../types.js";
import { JournalFileEditor } from "../utils/journal-file.js";

const FindEntryInputSchema = z.object({
  file: FilePathSchema.optional(),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

interface RawPrintEntry {
  tdate: string;
  tstatus: string;
  tdescription: string;
  tcomment?: string;
  tprecedingcomment?: string;
  tindex: number;
  ttags?: Array<{ tag: string; value?: string }>;
  tsourcepos?: Array<{ sourceName: string; sourceLine: number }>;
}

interface FindEntryResultEntry {
  date: string;
  status: string;
  description: string;
  index: number;
  comment?: string;
  tags?: Array<{ tag: string; value?: string }>;
  entryText: string;
  location: {
    absolutePath: string;
    relativePath: string;
    startLine: number;
    endLine: number;
  };
}

export class FindEntryTool extends BaseTool<typeof FindEntryInputSchema> {
  readonly metadata: ToolMetadata<typeof FindEntryInputSchema> = {
    name: "hledger_find_entry",
    description: "Find complete journal entries matching a query",
    schema: FindEntryInputSchema,
  };

  protected supportsOutputFormat(): boolean {
    return false;
  }

  protected async run(input: z.infer<typeof FindEntryInputSchema>) {
    const targetFile = input.file ?? this.journalFilePath;
    if (!targetFile) {
      throw new ValidationError("No journal file specified");
    }

    const resolvedTarget = await fs.realpath(targetFile);
    const rootDir = path.dirname(resolvedTarget);

    const args = [
      "--file",
      resolvedTarget,
      "--output-format",
      "json",
      "--location",
    ];
    if (input.query) {
      args.push(...this.parseQuery(input.query));
    }

    const result = await HLedgerExecutor.execute("print", args);

    let parsed: RawPrintEntry[] = [];
    if (result.stdout.trim()) {
      try {
        parsed = JSON.parse(result.stdout) as RawPrintEntry[];
      } catch (error) {
        throw new ValidationError(
          `Failed to parse hledger output as JSON: ${(error as Error).message}`,
        );
      }
    }

    if (input.limit) {
      parsed = parsed.slice(0, input.limit);
    }

    const editors = new Map<string, JournalFileEditor>();
    const files = new Map<string, string>();

    const entries: FindEntryResultEntry[] = [];

    for (const entry of parsed) {
      if (!entry.tsourcepos || entry.tsourcepos.length === 0) {
        continue;
      }

      const uniquePaths = new Set(
        entry.tsourcepos.map((pos) => pos.sourceName),
      );
      if (uniquePaths.size !== 1) {
        throw new ValidationError(
          "Encountered a transaction spanning multiple files, which is not supported",
        );
      }

      const sourceName = entry.tsourcepos[0]?.sourceName;
      if (!sourceName) {
        continue;
      }

      const resolvedSource = await this.resolveFilePath(sourceName);
      let relative = path.relative(rootDir, resolvedSource);
      if (relative.includes("..")) {
        relative = path.basename(resolvedSource);
      }
      files.set(resolvedSource, relative);

      let editor = editors.get(resolvedSource);
      if (!editor) {
        const content = await fs.readFile(resolvedSource, "utf8");
        editor = new JournalFileEditor(content);
        editors.set(resolvedSource, editor);
      }

      const lines = entry.tsourcepos.map((pos) => pos.sourceLine);
      const startLine = Math.min(...lines);
      const rawEnd = Math.max(...lines);
      const endLine = rawEnd > startLine ? rawEnd - 1 : rawEnd;

      const entryText = editor.extract(startLine, endLine);

      entries.push({
        date: entry.tdate,
        status: entry.tstatus,
        description: entry.tdescription,
        index: entry.tindex,
        comment: entry.tcomment?.trim() || undefined,
        tags: entry.ttags,
        entryText,
        location: {
          absolutePath: resolvedSource,
          relativePath:
            files.get(resolvedSource) ?? path.basename(resolvedSource),
          startLine,
          endLine,
        },
      });
    }

    const payload = {
      total: entries.length,
      entries,
    };

    return {
      success: true,
      stdout: JSON.stringify(payload),
      stderr: result.stderr,
      exitCode: 0,
      command: result.command,
      duration: result.duration,
    };
  }

  private parseQuery(query: string): string[] {
    const parts: string[] = [];
    let current = "";
    let inQuotes = false;
    let quoteChar = "";

    for (let index = 0; index < query.length; index += 1) {
      const char = query[index];

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

  private async resolveFilePath(filePath: string): Promise<string> {
    try {
      return await fs.realpath(filePath);
    } catch {
      // hledger may emit relative paths; resolve them relative to current working directory
      return path.resolve(filePath);
    }
  }
}
