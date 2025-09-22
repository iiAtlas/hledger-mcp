import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RewriteTransactionsTool } from "../src/tools/rewrite.js";

async function setupTempDir(): Promise<{ dir: string; journalPath: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hledger-rewrite-"));
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

describe("RewriteTransactionsTool", () => {
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

  const addPostings = [
    { account: "equity:owner:reimbursable", amount: "*1" },
    { account: "assets:receivable:demo-project", amount: "*-1" },
  ];

  it("performs a dry run and reports the diff", async () => {
    const original = await fs.readFile(journalPath, "utf8");
    const tool = new RewriteTransactionsTool(journalPath);

    const result = await tool.execute({
      dryRun: true,
      query: "expenses:software:openai",
      addPostings,
    });

    expect(result.success).toBe(true);
    expect(result.metadata.command).toContain("rewrite");

    const updated = await fs.readFile(journalPath, "utf8");
    expect(updated).toEqual(original);

    const files = await fs.readdir(tempDir);
    expect(files.some((file) => file.includes(".bak-"))).toBe(false);

    const payload = JSON.parse(result.data);
    expect(payload.applied).toBe(false);
    expect(payload.diff).toBeDefined();
  });

  it("rewrites transactions and creates a backup", async () => {
    const tool = new RewriteTransactionsTool(journalPath);

    const result = await tool.execute({
      query: "expenses:software:openai",
      addPostings,
      diff: true,
    });

    expect(result.success).toBe(true);
    expect(result.metadata.command).toContain("rewrite");

    const julyContents = await fs.readFile(
      path.join(tempDir, "07-jul.journal"),
      "utf8",
    );
    expect(julyContents).toContain("equity:owner:reimbursable");
    expect(julyContents).toContain("assets:receivable:demo-project");

    const files = await fs.readdir(tempDir);
    const backupFiles = files.filter((file) => file.includes(".bak-"));
    expect(backupFiles.length).toBeGreaterThan(0);

    const payload = JSON.parse(result.data);
    expect(payload.applied).toBe(true);
    expect(payload.diff).toBeDefined();
    expect(Array.isArray(payload.changedFiles)).toBe(true);
    expect(payload.changedFiles.length).toBeGreaterThan(0);
  });

  it("skips backups when configured", async () => {
    const tool = new RewriteTransactionsTool(journalPath, { skipBackup: true });

    const result = await tool.execute({
      query: "expenses:software:openai",
      addPostings,
    });

    expect(result.success).toBe(true);
    const files = await fs.readdir(tempDir);
    expect(files.some((file) => file.includes(".bak-"))).toBe(false);
  });

  it("fails when in read-only mode", async () => {
    const tool = new RewriteTransactionsTool(journalPath, { readOnly: true });

    const response = await tool.execute({
      query: "expenses:software:openai",
      addPostings,
    });

    expect(response.success).toBe(false);
    expect(response.error).toBe("ValidationError");
    expect(response.message).toContain("read-only mode");
  });
});
