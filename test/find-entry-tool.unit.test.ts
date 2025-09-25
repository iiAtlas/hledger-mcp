import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { jest } from "@jest/globals";
import type { CommandResult } from "../src/types.js";

const executeMock = jest.fn<
  Promise<CommandResult>,
  [string, string[], Record<string, unknown>?]
>();

jest.unstable_mockModule("../src/executor.js", () => ({
  HLedgerExecutor: {
    execute: executeMock,
  },
}));

const { FindEntryTool } = await import("../src/tools/find-entry.js");

interface TempJournal {
  dir: string;
  journalPath: string;
}

let tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function createJournal(contents: string): Promise<TempJournal> {
  const dir = await createTempDir("find-entry-unit-");
  const journalPath = path.join(dir, "journal.journal");
  const normalized = contents.endsWith("\n") ? contents : `${contents}\n`;
  await fs.writeFile(journalPath, normalized, "utf8");
  return { dir, journalPath };
}

function makeResult(
  stdout: string,
  overrides: Partial<CommandResult> = {},
): CommandResult {
  return {
    success: true,
    stdout,
    stderr: "",
    exitCode: 0,
    command: "hledger print",
    duration: 1,
    ...overrides,
  };
}

describe("FindEntryTool (unit)", () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  afterEach(async () => {
    const dirs = [...tempDirs];
    tempDirs = [];
    await Promise.all(
      dirs.map(async (dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it("fails when no journal file is provided", async () => {
    const tool = new FindEntryTool();
    const response = await tool.execute({});

    expect(response.success).toBe(false);
    if (response.success) {
      throw new Error("Expected find entry to fail without a file");
    }

    expect(response.error).toBe("ValidationError");
    expect(response.message).toContain("No journal file specified");
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("limits results when a limit is provided", async () => {
    const { journalPath } = await createJournal(
      [
        "2025-01-01 * Alpha entry",
        "  assets:cash  $1",
        "  income:salary -$1",
        "",
        "2025-01-02 * Beta entry",
        "  assets:cash  $2",
        "  income:salary -$2",
        "",
      ].join("\n"),
    );

    const entries = [
      {
        tdate: "2025-01-01",
        tstatus: "*",
        tdescription: "Alpha entry",
        tindex: 1,
        tsourcepos: [
          { sourceName: journalPath, sourceLine: 1 },
          { sourceName: journalPath, sourceLine: 2 },
          { sourceName: journalPath, sourceLine: 3 },
          { sourceName: journalPath, sourceLine: 4 },
        ],
      },
      {
        tdate: "2025-01-02",
        tstatus: "*",
        tdescription: "Beta entry",
        tindex: 2,
        tsourcepos: [
          { sourceName: journalPath, sourceLine: 5 },
          { sourceName: journalPath, sourceLine: 6 },
          { sourceName: journalPath, sourceLine: 7 },
          { sourceName: journalPath, sourceLine: 8 },
        ],
      },
    ];

    executeMock.mockResolvedValue(makeResult(JSON.stringify(entries)));

    const tool = new FindEntryTool();
    const response = await tool.execute({ file: journalPath, limit: 1 });

    expect(response.success).toBe(true);
    if (!response.success) {
      throw new Error("Expected find entry to succeed");
    }

    expect(executeMock).toHaveBeenCalledWith("print", [
      "--file",
      expect.any(String),
      "--output-format",
      "json",
      "--location",
    ]);

    const payload = JSON.parse(response.data) as {
      total: number;
      entries: Array<{ description: string }>;
    };

    expect(payload.total).toBe(1);
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0]?.description).toBe("Alpha entry");
  });

  it("skips entries without source position metadata", async () => {
    const { journalPath } = await createJournal(
      "2025-01-01 * Entry\n  assets:cash  $1\n  income:salary -$1\n",
    );

    executeMock.mockResolvedValue(
      makeResult(
        JSON.stringify([
          {
            tdate: "2025-01-01",
            tstatus: "*",
            tdescription: "Entry",
            tindex: 1,
          },
          {
            tdate: "2025-01-01",
            tstatus: "*",
            tdescription: "Valid Entry",
            tindex: 2,
            tsourcepos: [
              { sourceName: journalPath, sourceLine: 1 },
              { sourceName: journalPath, sourceLine: 2 },
              { sourceName: journalPath, sourceLine: 3 },
              { sourceName: journalPath, sourceLine: 4 },
            ],
          },
        ]),
      ),
    );

    const tool = new FindEntryTool();
    const response = await tool.execute({ file: journalPath });

    expect(response.success).toBe(true);
    if (!response.success) {
      throw new Error("Expected find entry to succeed");
    }

    const payload = JSON.parse(response.data) as { total: number };
    expect(payload.total).toBe(1);
  });

  it("parses quoted query strings into discrete arguments", async () => {
    const { journalPath } = await createJournal(
      "2025-01-01 * Entry\n  assets:cash  $1\n  income:salary -$1\n",
    );

    executeMock.mockResolvedValue(makeResult("[]"));

    const tool = new FindEntryTool();
    const response = await tool.execute({
      file: journalPath,
      query: "tag:\"ai credits\" status:'*' plain",
    });

    expect(response.success).toBe(true);
    if (!response.success) {
      throw new Error("Expected find entry to succeed");
    }

    const [, args] = executeMock.mock.calls[0];
    expect(args.slice(-3)).toEqual(["tag:ai credits", "status:*", "plain"]);
  });

  it("returns a validation error when hledger output cannot be parsed", async () => {
    const { journalPath } = await createJournal(
      "2025-01-01 * Entry\n  assets:cash  $1\n  income:salary -$1\n",
    );

    executeMock.mockResolvedValue(makeResult("not-json"));

    const tool = new FindEntryTool();
    const response = await tool.execute({ file: journalPath });

    expect(response.success).toBe(false);
    if (response.success) {
      throw new Error("Expected parse failure to be reported");
    }

    expect(response.error).toBe("ValidationError");
    expect(response.message).toContain("Failed to parse");
  });

  it("skips entries that omit source filenames", async () => {
    const { journalPath } = await createJournal(
      "2025-01-01 * Entry\n  assets:cash  $1\n  income:salary -$1\n",
    );

    executeMock.mockResolvedValue(
      makeResult(
        JSON.stringify([
          {
            tdate: "2025-01-01",
            tstatus: "*",
            tdescription: "Entry",
            tindex: 1,
            tsourcepos: [
              { sourceLine: 1 } as unknown as {
                sourceName: string;
                sourceLine: number;
              },
              { sourceLine: 2 } as unknown as {
                sourceName: string;
                sourceLine: number;
              },
            ],
          },
        ]),
      ),
    );

    const tool = new FindEntryTool();
    const response = await tool.execute({ file: journalPath });

    expect(response.success).toBe(true);
    if (!response.success) {
      throw new Error("Expected find entry to succeed");
    }

    const payload = JSON.parse(response.data) as { total: number };
    expect(payload.total).toBe(0);
  });

  it("rejects transactions that span multiple files", async () => {
    const { journalPath } = await createJournal(
      "2025-01-01 * Entry\n  assets:cash  $1\n  income:salary -$1\n",
    );
    const otherDir = await createTempDir("find-entry-multi-");
    const includedPath = path.join(otherDir, "included.journal");
    await fs.writeFile(
      includedPath,
      "2025-01-02 * Included\n  assets:cash  $2\n  income:salary -$2\n",
      "utf8",
    );

    executeMock.mockResolvedValue(
      makeResult(
        JSON.stringify([
          {
            tdate: "2025-01-02",
            tstatus: "*",
            tdescription: "Included",
            tindex: 1,
            tsourcepos: [
              { sourceName: journalPath, sourceLine: 1 },
              { sourceName: includedPath, sourceLine: 1 },
            ],
          },
        ]),
      ),
    );

    const tool = new FindEntryTool();
    const response = await tool.execute({ file: journalPath });

    expect(response.success).toBe(false);
    if (response.success) {
      throw new Error("Expected multi-file transaction to be rejected");
    }

    expect(response.error).toBe("ValidationError");
    expect(response.message).toContain("spanning multiple files");
  });

  it("falls back when realpath resolution fails", async () => {
    const { journalPath } = await createJournal(
      "2025-01-01 * Entry\n  assets:cash  $1\n  income:salary -$1\n\n",
    );
    const linkedDir = await createTempDir("find-entry-linked-");
    const linkedPath = path.join(linkedDir, "linked.journal");
    await fs.writeFile(
      linkedPath,
      "2025-01-02 * Linked\n  assets:cash  $2\n  income:salary -$2\n\n",
      "utf8",
    );

    const originalRealpath = fs.realpath;
    const realpathSpy = jest
      .spyOn(fs, "realpath")
      .mockImplementationOnce((...args) =>
        originalRealpath.apply(fs, args as [string]),
      )
      .mockImplementationOnce(() => Promise.reject(new Error("forced failure")))
      .mockImplementation((...args) =>
        originalRealpath.apply(fs, args as [string]),
      );

    executeMock.mockResolvedValue(
      makeResult(
        JSON.stringify([
          {
            tdate: "2025-01-02",
            tstatus: "*",
            tdescription: "Linked",
            tindex: 2,
            tsourcepos: [
              { sourceName: linkedPath, sourceLine: 1 },
              { sourceName: linkedPath, sourceLine: 2 },
              { sourceName: linkedPath, sourceLine: 3 },
              { sourceName: linkedPath, sourceLine: 4 },
            ],
          },
        ]),
      ),
    );

    const tool = new FindEntryTool();
    const response = await tool.execute({ file: journalPath });

    expect(response.success).toBe(true);
    if (!response.success) {
      throw new Error("Expected fallback resolution to succeed");
    }

    const payload = JSON.parse(response.data) as {
      entries: Array<{
        location: { absolutePath: string };
      }>;
    };

    expect(payload.entries[0]?.location.absolutePath).toBe(linkedPath);
    realpathSpy.mockRestore();
  });

  it("uses file basenames for entries outside the root directory", async () => {
    const rootDir = await createTempDir("find-entry-root-");
    const journalPath = path.join(rootDir, "master.journal");
    await fs.writeFile(
      journalPath,
      "2025-01-01 * Root\n  assets  $1\n  income -$1\n\n",
      "utf8",
    );

    const externalDir = await createTempDir("find-entry-external-");
    const externalPath = path.join(externalDir, "external.journal");
    await fs.writeFile(
      externalPath,
      "2025-01-02 * External\n  assets  $2\n  income -$2\n\n",
      "utf8",
    );

    executeMock.mockResolvedValue(
      makeResult(
        JSON.stringify([
          {
            tdate: "2025-01-02",
            tstatus: "*",
            tdescription: "External",
            tindex: 2,
            tsourcepos: [
              { sourceName: externalPath, sourceLine: 1 },
              { sourceName: externalPath, sourceLine: 2 },
              { sourceName: externalPath, sourceLine: 3 },
              { sourceName: externalPath, sourceLine: 4 },
            ],
          },
        ]),
      ),
    );

    const tool = new FindEntryTool();
    const response = await tool.execute({ file: journalPath });

    expect(response.success).toBe(true);
    if (!response.success) {
      throw new Error("Expected find entry to succeed");
    }

    const payload = JSON.parse(response.data) as {
      entries: Array<{ location: { relativePath: string } }>;
    };

    expect(payload.entries[0]?.location.relativePath).toBe(
      path.basename(externalPath),
    );
  });
});
