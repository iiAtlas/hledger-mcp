import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CloseTool } from "../src/tools/close.js";

async function setupTempDir(): Promise<{ dir: string; journalPath: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hledger-close-"));
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

describe("CloseTool", () => {
  let tempDir: string;
  let journalPath: string;

  beforeEach(async () => {
    const setup = await setupTempDir();
    tempDir = setup.dir;
    journalPath = setup.journalPath;
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("generates retain earnings entries in dry run", async () => {
    const tool = new CloseTool(journalPath);

    const result = await tool.execute({
      dryRun: true,
      mode: "retain",
      period: "2025",
    });

    expect(result.success).toBe(true);
    expect(result.metadata.command).toContain("close");

    const original = await fs.readFile(journalPath, "utf8");
    const updated = await fs.readFile(journalPath, "utf8");
    expect(updated).toEqual(original);

    const payload = JSON.parse(result.data);
    expect(payload.applied).toBe(false);
    expect(payload.generatedTransactions.toLowerCase()).toContain(
      "retain earnings",
    );
  });

  it("appends closing entries and creates a backup", async () => {
    const tool = new CloseTool(journalPath);

    const result = await tool.execute({
      mode: "retain",
      period: "2025",
      closeDescription: "Retain earnings 2025",
    });

    expect(result.success).toBe(true);

    const masterContents = await fs.readFile(journalPath, "utf8");
    expect(masterContents).toContain("Retain earnings 2025");

    const files = await fs.readdir(tempDir);
    expect(files.some((file) => file.includes("master.journal.bak-"))).toBe(
      true,
    );

    const payload = JSON.parse(result.data);
    expect(payload.applied).toBe(true);
    expect(payload.generatedTransactions.toLowerCase()).toContain(
      "retain earnings",
    );
  });

  it("skips backups when configured", async () => {
    const tool = new CloseTool(journalPath, { skipBackup: true });

    const result = await tool.execute({
      mode: "retain",
      period: "2025",
    });

    expect(result.success).toBe(true);
    const files = await fs.readdir(tempDir);
    expect(files.some((file) => file.includes("master.journal.bak-"))).toBe(
      false,
    );
  });

  it("fails when in read-only mode", async () => {
    const tool = new CloseTool(journalPath, { readOnly: true });

    const response = await tool.execute({
      mode: "retain",
      period: "2025",
    });

    expect(response.success).toBe(false);
    expect(response.error).toBe("ValidationError");
    expect(response.message).toContain("read-only mode");
  });
});
