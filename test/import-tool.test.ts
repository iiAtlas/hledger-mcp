import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ImportTransactionsTool } from "../src/tools/import.js";

async function setupTempDir(): Promise<{ dir: string; journalPath: string; dataFile: string; }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hledger-import-"));
  const resourcesDir = path.resolve("test/resources");
  const entries = await fs.readdir(resourcesDir);

  await Promise.all(
    entries
      .filter((file) => file.endsWith(".journal"))
      .map((file) => fs.copyFile(path.join(resourcesDir, file), path.join(dir, file)))
  );

  return {
    dir,
    journalPath: path.join(dir, "master.journal"),
    dataFile: path.join(dir, "import-sample.journal"),
  };
}

describe("ImportTransactionsTool", () => {
  let tempDir: string;
  let journalPath: string;
  let dataFile: string;

  beforeEach(async () => {
    const setup = await setupTempDir();
    tempDir = setup.dir;
    journalPath = setup.journalPath;
    dataFile = setup.dataFile;
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("performs a dry run without modifying the journal", async () => {
    const original = await fs.readFile(journalPath, "utf8");
    const tool = new ImportTransactionsTool(journalPath);

    const result = await tool.execute({
      dryRun: true,
      dataFiles: [dataFile],
    });

    expect(result.success).toBe(true);
    expect(result.metadata.command).toContain("--dry-run");

    const updated = await fs.readFile(journalPath, "utf8");
    expect(updated).toEqual(original);

    const files = await fs.readdir(tempDir);
    expect(files.some((file) => file.startsWith("master.journal.bak-"))).toBe(false);
  });

  it("imports transactions and creates a backup", async () => {
    const tool = new ImportTransactionsTool(journalPath);

    const result = await tool.execute({
      dataFiles: [dataFile],
    });

    expect(result.success).toBe(true);
    expect(result.metadata.command).toContain("import");

    const journalContents = await fs.readFile(journalPath, "utf8");
    expect(journalContents).toContain("Imported Transaction");

    const files = await fs.readdir(tempDir);
    expect(files.some((file) => file.startsWith("master.journal.bak-"))).toBe(true);
  });

  it("skips backups when configured", async () => {
    const tool = new ImportTransactionsTool(journalPath, { skipBackup: true });

    const result = await tool.execute({
      dataFiles: [dataFile],
    });

    expect(result.success).toBe(true);
    const files = await fs.readdir(tempDir);
    expect(files.some((file) => file.startsWith("master.journal.bak-"))).toBe(false);
  });

  it("fails when running in read-only mode", async () => {
    const tool = new ImportTransactionsTool(journalPath, { readOnly: true });

    const response = await tool.execute({
      dataFiles: [dataFile],
    });

    expect(response.success).toBe(false);
    expect(response.error).toBe("ValidationError");
    expect(response.message).toContain("read-only mode");
  });
});
