import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FindEntryTool } from "../src/tools/find-entry.js";
import { RemoveEntryTool } from "../src/tools/remove-entry.js";
import { ReplaceEntryTool } from "../src/tools/replace-entry.js";

interface FoundEntry {
  description: string;
  entryText: string;
  location: {
    absolutePath: string;
    relativePath: string;
    startLine: number;
    endLine: number;
  };
}

interface FindPayload {
  total: number;
  entries: FoundEntry[];
}

interface TempWorkspace {
  dir: string;
  journalPath: string;
}

const OPENAI_DESCRIPTION = "OpenAI Credits";
const JULY_FILE = "07-jul.journal";

async function setupWorkspace(): Promise<TempWorkspace> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hledger-entry-"));
  const resourcesDir = path.resolve("test/resources");
  const entries = await fs.readdir(resourcesDir);

  await Promise.all(
    entries
      .filter((file) => file.endsWith(".journal"))
      .map((file) =>
        fs.copyFile(path.join(resourcesDir, file), path.join(dir, file)),
      ),
  );

  return {
    dir,
    journalPath: path.join(dir, "master.journal"),
  };
}

async function readJournalFile(
  tempDir: string,
  fileName: string,
): Promise<string> {
  return await fs.readFile(path.join(tempDir, fileName), "utf8");
}

async function journalBackups(
  tempDir: string,
  baseName: string,
): Promise<string[]> {
  const files = await fs.readdir(tempDir);
  return files.filter((file) => file.startsWith(`${baseName}.bak-`));
}

async function findOpenAIEntry(journalPath: string): Promise<FoundEntry> {
  const findTool = new FindEntryTool(journalPath);
  const result = await findTool.execute({ query: OPENAI_DESCRIPTION });

  if (!result.success) {
    throw new Error("Expected find tool to succeed");
  }

  const payload = JSON.parse(result.data) as FindPayload;
  const target = payload.entries.find((entry) =>
    entry.description.includes(OPENAI_DESCRIPTION),
  );

  if (!target) {
    throw new Error(
      `Expected to locate entry containing '${OPENAI_DESCRIPTION}'`,
    );
  }

  return target;
}

describe("Entry tools", () => {
  let tempDir: string;
  let journalPath: string;

  beforeEach(async () => {
    const workspace = await setupWorkspace();
    tempDir = workspace.dir;
    journalPath = workspace.journalPath;
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("finds entries with location metadata", async () => {
    const tool = new FindEntryTool(journalPath);
    const result = await tool.execute({ query: "expenses:software:openai" });

    if (!result.success) {
      throw new Error("Expected find tool to succeed");
    }

    const payload = JSON.parse(result.data) as FindPayload;
    expect(payload.total).toBeGreaterThan(0);
    const first = payload.entries[0];
    expect(first.location.relativePath).toBe("07-jul.journal");
    expect(first.entryText).toContain("expenses:software:openai");
    expect(first.location.startLine).toBeGreaterThan(0);
    expect(first.location.endLine).toBeGreaterThanOrEqual(
      first.location.startLine,
    );
  });

  it("removes an entry and creates a backup", async () => {
    const target = await findOpenAIEntry(journalPath);

    const removeTool = new RemoveEntryTool(journalPath);
    const removeResult = await removeTool.execute({
      entry: target.entryText,
      location: {
        file: target.location.absolutePath,
        startLine: target.location.startLine,
        endLine: target.location.endLine,
      },
    });

    expect(removeResult.success).toBe(true);
    if (!removeResult.success) {
      throw new Error("Expected removal to succeed");
    }

    const payload = JSON.parse(removeResult.data) as {
      applied: boolean;
      journalPath: string;
      backupPath?: string;
      removedEntry: string;
      trailingBlankRemoved: boolean;
    };

    expect(payload.applied).toBe(true);
    expect(payload.trailingBlankRemoved).toBe(true);
    expect(payload.removedEntry).toEqual(target.entryText);
    expect(payload.journalPath).toBe(target.location.absolutePath);
    expect(payload.backupPath).toBeDefined();

    const julyContents = await readJournalFile(tempDir, JULY_FILE);
    expect(julyContents).not.toContain(OPENAI_DESCRIPTION);

    const backups = await journalBackups(tempDir, JULY_FILE);
    expect(backups.length).toBeGreaterThan(0);
  });

  it("respects collapseWhitespace=false when removing an entry", async () => {
    const target = await findOpenAIEntry(journalPath);
    const removeTool = new RemoveEntryTool(journalPath);

    const result = await removeTool.execute({
      entry: target.entryText,
      location: {
        file: target.location.absolutePath,
        startLine: target.location.startLine,
        endLine: target.location.endLine,
      },
      collapseWhitespace: false,
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected removal to succeed");
    }

    const payload = JSON.parse(result.data) as {
      trailingBlankRemoved: boolean;
      removedEntry: string;
    };

    expect(payload.trailingBlankRemoved).toBe(false);
    expect(payload.removedEntry).toEqual(target.entryText);

    const julyContents = await readJournalFile(tempDir, JULY_FILE);
    expect(julyContents).toContain("\n\n2025-07-14 *");
  });

  it("rejects removal when entry text mismatches the journal", async () => {
    const target = await findOpenAIEntry(journalPath);
    const removeTool = new RemoveEntryTool(journalPath);

    const failure = await removeTool.execute({
      entry: target.entryText.replace("$5.00", "$4.99"),
      location: {
        file: target.location.absolutePath,
        startLine: target.location.startLine,
        endLine: target.location.endLine,
      },
    });

    expect(failure.success).toBe(false);
    if (failure.success) {
      throw new Error("Expected removal to fail on mismatched entry");
    }

    expect(failure.error).toBe("ValidationError");
    expect(failure.message).toContain("does not match");

    const julyContents = await readJournalFile(tempDir, JULY_FILE);
    expect(julyContents).toContain(OPENAI_DESCRIPTION);

    const backups = await journalBackups(tempDir, JULY_FILE);
    expect(backups.length).toBe(0);
  });

  it("skips backup creation when configured for removal", async () => {
    const target = await findOpenAIEntry(journalPath);
    const removeTool = new RemoveEntryTool(journalPath, { skipBackup: true });

    const result = await removeTool.execute({
      entry: target.entryText,
      location: {
        file: target.location.absolutePath,
        startLine: target.location.startLine,
        endLine: target.location.endLine,
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected removal to succeed");
    }

    const backups = await journalBackups(tempDir, JULY_FILE);
    expect(backups.length).toBe(0);
  });

  it("replaces an entry with new content", async () => {
    const target = await findOpenAIEntry(journalPath);

    const replacement = target.entryText
      .replace("$5.00", "$6.50")
      .replace("-$5.00", "-$6.50");

    const replaceTool = new ReplaceEntryTool(journalPath);
    const replaceResult = await replaceTool.execute({
      original: target.entryText,
      replacement,
      location: {
        file: target.location.absolutePath,
        startLine: target.location.startLine,
        endLine: target.location.endLine,
      },
    });

    expect(replaceResult.success).toBe(true);
    if (!replaceResult.success) {
      throw new Error("Expected replacement to succeed");
    }

    const payload = JSON.parse(replaceResult.data) as {
      applied: boolean;
      journalPath: string;
      backupPath?: string;
      insertedEntry: string;
    };

    expect(payload.applied).toBe(true);
    expect(payload.insertedEntry).toContain("$6.50");
    expect(payload.journalPath).toBe(target.location.absolutePath);
    expect(payload.backupPath).toBeDefined();

    const julyContents = await readJournalFile(tempDir, JULY_FILE);
    expect(julyContents).toContain("$6.50");
    expect(julyContents).not.toContain("$5.00");

    const backups = await journalBackups(tempDir, JULY_FILE);
    expect(backups.length).toBeGreaterThan(0);
  });

  it("rejects replacement when original text mismatches the journal", async () => {
    const target = await findOpenAIEntry(journalPath);
    const replaceTool = new ReplaceEntryTool(journalPath);

    const failure = await replaceTool.execute({
      original: target.entryText.replace("$5.00", "$4.99"),
      replacement: target.entryText,
      location: {
        file: target.location.absolutePath,
        startLine: target.location.startLine,
        endLine: target.location.endLine,
      },
    });

    expect(failure.success).toBe(false);
    if (failure.success) {
      throw new Error("Expected replacement to fail on mismatched entry");
    }

    expect(failure.error).toBe("ValidationError");
    expect(failure.message).toContain("does not match");

    const julyContents = await readJournalFile(tempDir, JULY_FILE);
    expect(julyContents).toContain("$5.00");

    const backups = await journalBackups(tempDir, JULY_FILE);
    expect(backups.length).toBe(0);
  });

  it("skips backup creation when configured for replacement", async () => {
    const target = await findOpenAIEntry(journalPath);
    const replacement = target.entryText
      .replace("$5.00", "$7.25")
      .replace("-$5.00", "-$7.25");

    const replaceTool = new ReplaceEntryTool(journalPath, { skipBackup: true });
    const result = await replaceTool.execute({
      original: target.entryText,
      replacement,
      location: {
        file: target.location.absolutePath,
        startLine: target.location.startLine,
        endLine: target.location.endLine,
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected replacement to succeed");
    }

    const payload = JSON.parse(result.data) as { backupPath?: string };
    expect(payload.backupPath).toBeUndefined();

    const backups = await journalBackups(tempDir, JULY_FILE);
    expect(backups.length).toBe(0);
  });

  it("rejects replacement in read-only mode without dry run", async () => {
    const target = await findOpenAIEntry(journalPath);
    const replacement = target.entryText
      .replace("$5.00", "$8.00")
      .replace("-$5.00", "-$8.00");

    const replaceTool = new ReplaceEntryTool(journalPath, { readOnly: true });
    const failure = await replaceTool.execute({
      original: target.entryText,
      replacement,
      location: {
        file: target.location.absolutePath,
        startLine: target.location.startLine,
        endLine: target.location.endLine,
      },
    });

    expect(failure.success).toBe(false);
    if (failure.success) {
      throw new Error("Expected replacement to be rejected in read-only mode");
    }

    expect(failure.error).toBe("ValidationError");
    expect(failure.message).toContain("read-only mode");

    const julyContents = await readJournalFile(tempDir, JULY_FILE);
    expect(julyContents).toContain("$5.00");
    const backups = await journalBackups(tempDir, JULY_FILE);
    expect(backups.length).toBe(0);
  });

  it("allows dry-run replacement while in read-only mode", async () => {
    const target = await findOpenAIEntry(journalPath);
    const replacement = target.entryText
      .replace("$5.00", "$9.10")
      .replace("-$5.00", "-$9.10");
    const originalContents = await readJournalFile(tempDir, JULY_FILE);

    const replaceTool = new ReplaceEntryTool(journalPath, { readOnly: true });
    const dryResult = await replaceTool.execute({
      original: target.entryText,
      replacement,
      location: {
        file: target.location.absolutePath,
        startLine: target.location.startLine,
        endLine: target.location.endLine,
      },
      dryRun: true,
    });

    expect(dryResult.success).toBe(true);
    if (!dryResult.success) {
      throw new Error("Expected replacement dry run to succeed");
    }

    const payload = JSON.parse(dryResult.data) as {
      applied: boolean;
      insertedEntry: string;
    };

    expect(payload.applied).toBe(false);
    expect(payload.insertedEntry).toContain("$9.10");

    const updatedContents = await readJournalFile(tempDir, JULY_FILE);
    expect(updatedContents).toEqual(originalContents);

    const backups = await journalBackups(tempDir, JULY_FILE);
    expect(backups.length).toBe(0);
  });

  it("rejects removal in read-only mode without dry run", async () => {
    const target = await findOpenAIEntry(journalPath);

    const removeTool = new RemoveEntryTool(journalPath, { readOnly: true });
    const failure = await removeTool.execute({
      entry: target.entryText,
      location: {
        file: target.location.absolutePath,
        startLine: target.location.startLine,
        endLine: target.location.endLine,
      },
    });

    expect(failure.success).toBe(false);
    if (failure.success) {
      throw new Error("Expected removal to be rejected in read-only mode");
    }
    expect(failure.error).toBe("ValidationError");
    expect(failure.message).toContain("read-only mode");

    const julyContents = await readJournalFile(tempDir, JULY_FILE);
    expect(julyContents).toContain(OPENAI_DESCRIPTION);

    const backups = await journalBackups(tempDir, JULY_FILE);
    expect(backups.length).toBe(0);
  });

  it("allows dry-run removal while in read-only mode", async () => {
    const target = await findOpenAIEntry(journalPath);
    const originalContents = await readJournalFile(tempDir, JULY_FILE);

    const removeTool = new RemoveEntryTool(journalPath, { readOnly: true });
    const dryResult = await removeTool.execute({
      entry: target.entryText,
      location: {
        file: target.location.absolutePath,
        startLine: target.location.startLine,
        endLine: target.location.endLine,
      },
      dryRun: true,
    });

    expect(dryResult.success).toBe(true);
    if (!dryResult.success) {
      throw new Error("Expected removal dry run to succeed");
    }

    const payload = JSON.parse(dryResult.data) as {
      applied: boolean;
      removedEntry: string;
      trailingBlankRemoved: boolean;
    };

    expect(payload.applied).toBe(false);
    expect(payload.removedEntry).toEqual(target.entryText);
    expect(payload.trailingBlankRemoved).toBe(true);

    const updatedContents = await readJournalFile(tempDir, JULY_FILE);
    expect(updatedContents).toEqual(originalContents);

    const backups = await journalBackups(tempDir, JULY_FILE);
    expect(backups.length).toBe(0);
  });
});
