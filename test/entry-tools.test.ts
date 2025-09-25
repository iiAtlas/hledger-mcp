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
    expect(first.location.endLine).toBeGreaterThanOrEqual(first.location.startLine);
  });

  it("removes an entry and creates a backup", async () => {
    const findTool = new FindEntryTool(journalPath);
    const findResult = await findTool.execute({ query: "OpenAI Credits" });

    if (!findResult.success) {
      throw new Error("Expected find tool to succeed");
    }

    const matches = JSON.parse(findResult.data) as FindPayload;
    const target = matches.entries.find((entry) =>
      entry.description.includes("OpenAI Credits"),
    );
    expect(target).toBeDefined();
    if (!target) {
      throw new Error("Expected a matching entry");
    }

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

    const julyContents = await fs.readFile(
      path.join(tempDir, "07-jul.journal"),
      "utf8",
    );
    expect(julyContents).not.toContain("OpenAI Credits");

    const files = await fs.readdir(tempDir);
    const backups = files.filter((file) => file.startsWith("07-jul.journal.bak-"));
    expect(backups.length).toBeGreaterThan(0);
  });

  it("replaces an entry with new content", async () => {
    const findTool = new FindEntryTool(journalPath);
    const findResult = await findTool.execute({ query: "OpenAI Credits" });

    if (!findResult.success) {
      throw new Error("Expected find tool to succeed");
    }

    const matches = JSON.parse(findResult.data) as FindPayload;
    const target = matches.entries.find((entry) =>
      entry.description.includes("OpenAI Credits"),
    );
    expect(target).toBeDefined();
    if (!target) {
      throw new Error("Expected a matching entry");
    }

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

    const julyContents = await fs.readFile(
      path.join(tempDir, "07-jul.journal"),
      "utf8",
    );
    expect(julyContents).toContain("$6.50");
    expect(julyContents).not.toContain("$5.00");

    const files = await fs.readdir(tempDir);
    const backups = files.filter((file) => file.startsWith("07-jul.journal.bak-"));
    expect(backups.length).toBeGreaterThan(0);
  });

  it("rejects removal in read-only mode without dry run", async () => {
    const findTool = new FindEntryTool(journalPath);
    const findResult = await findTool.execute({ query: "OpenAI Credits" });

    if (!findResult.success) {
      throw new Error("Expected find tool to succeed");
    }

    const matches = JSON.parse(findResult.data) as FindPayload;
    const target = matches.entries.find((entry) =>
      entry.description.includes("OpenAI Credits"),
    );
    expect(target).toBeDefined();
    if (!target) {
      throw new Error("Expected a matching entry");
    }

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
  });

  it("allows dry-run removal while in read-only mode", async () => {
    const findTool = new FindEntryTool(journalPath);
    const findResult = await findTool.execute({ query: "OpenAI Credits" });

    if (!findResult.success) {
      throw new Error("Expected find tool to succeed");
    }

    const matches = JSON.parse(findResult.data) as FindPayload;
    const target = matches.entries.find((entry) =>
      entry.description.includes("OpenAI Credits"),
    );
    expect(target).toBeDefined();
    if (!target) {
      throw new Error("Expected a matching entry");
    }

    const originalContents = await fs.readFile(
      path.join(tempDir, "07-jul.journal"),
      "utf8",
    );

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

    const updatedContents = await fs.readFile(
      path.join(tempDir, "07-jul.journal"),
      "utf8",
    );
    expect(updatedContents).toEqual(originalContents);

    const files = await fs.readdir(tempDir);
    const backups = files.filter((file) => file.startsWith("07-jul.journal.bak-"));
    expect(backups.length).toBe(0);
  });
});
