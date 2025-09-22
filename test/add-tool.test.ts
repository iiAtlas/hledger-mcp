import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { AddTransactionTool } from "../src/tools/add.js";

async function setupTempJournalDir(): Promise<{
  dir: string;
  journalPath: string;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hledger-add-"));
  const resourcesDir = path.resolve("test/resources");
  const entries = await fs.readdir(resourcesDir);

  await Promise.all(
    entries
      .filter((file) => file.endsWith(".journal"))
      .map((file) =>
        fs.copyFile(path.join(resourcesDir, file), path.join(dir, file)),
      ),
  );

  return { dir, journalPath: path.join(dir, "master.journal") };
}

describe("AddTransactionTool", () => {
  let tempDir: string;
  let journalPath: string;

  beforeEach(async () => {
    const setup = await setupTempJournalDir();
    tempDir = setup.dir;
    journalPath = setup.journalPath;
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("appends a transaction to the journal", async () => {
    const tool = new AddTransactionTool();
    const result = await tool.execute({
      file: journalPath,
      date: "2025-02-02",
      description: "Test addition",
      postings: [
        { account: "assets:bank:checking", amount: "-$10.00" },
        { account: "expenses:misc", amount: "$10.00" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.metadata.command).toContain("append-transaction");

    const journalContents = await fs.readFile(journalPath, "utf8");
    expect(journalContents).toContain("2025-02-02 Test addition");
    expect(journalContents).toContain("assets:bank:checking  -$10.00");

    const files = await fs.readdir(tempDir);
    expect(files.some((file) => file.startsWith("master.journal.bak-"))).toBe(
      true,
    );
  });

  it("supports dry run without modifying the journal", async () => {
    const originalContents = await fs.readFile(journalPath, "utf8");
    const tool = new AddTransactionTool(journalPath);

    const result = await tool.execute({
      date: "2025-03-03",
      description: "Dry run",
      dryRun: true,
      postings: [
        { account: "assets:bank:checking", amount: "-$20" },
        { account: "expenses:testing", amount: "$20" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.metadata.command).toContain("dry-run-append");

    const updatedContents = await fs.readFile(journalPath, "utf8");
    expect(updatedContents).toEqual(originalContents);
  });

  it("rejects transactions with fewer than two postings", async () => {
    const tool = new AddTransactionTool(journalPath);

    await expect(
      tool.execute({
        date: "2025-02-02",
        description: "Invalid",
        postings: [{ account: "assets:bank:checking", amount: "$10" }],
      }),
    ).rejects.toThrow(/At least two postings are required/);
  });

  it("skips backup creation when configured", async () => {
    const tool = new AddTransactionTool(journalPath, { skipBackup: true });

    const result = await tool.execute({
      date: "2025-04-04",
      description: "Skip backup",
      postings: [
        { account: "assets:bank:checking", amount: "-$15" },
        { account: "expenses:testing", amount: "$15" },
      ],
    });

    expect(result.success).toBe(true);
    const files = await fs.readdir(tempDir);
    expect(files.some((file) => file.startsWith("master.journal.bak-"))).toBe(
      false,
    );
  });

  it("fails when server is in read-only mode", async () => {
    const tool = new AddTransactionTool(journalPath, { readOnly: true });

    const result = await tool.execute({
      date: "2025-05-05",
      description: "Should fail",
      postings: [
        { account: "assets:bank:checking", amount: "-$5" },
        { account: "expenses:testing", amount: "$5" },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("ValidationError");
    expect(result.message).toContain("read-only mode");
  });
});
