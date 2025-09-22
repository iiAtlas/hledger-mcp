import { jest } from "@jest/globals";
import { HLedgerExecutor } from "../src/executor.js";
import { NotesTool } from "../src/tools/notes.js";

const journalPath = "/tmp/test.journal";

const mockCommandResult = (command: string, args: string[]) => ({
  success: true,
  stdout: "List of notes",
  stderr: "",
  exitCode: 0,
  command: `hledger ${command} ${args.join(" ")}`.trim(),
  duration: 1,
});

describe("NotesTool", () => {
  let executeSpy: jest.SpiedFunction<typeof HLedgerExecutor.execute>;

  beforeEach(() => {
    executeSpy = jest.spyOn(HLedgerExecutor, "execute").mockImplementation(async (command, args) => mockCommandResult(command, args));
  });

  afterEach(() => {
    executeSpy.mockRestore();
  });

  it("builds notes command with query and format", async () => {
    const tool = new NotesTool(journalPath);
    const result = await tool.execute({
      query: "tag:demo",
    });

    expect(result.success).toBe(true);
    const cmd = result.metadata.command;
    expect(cmd).toContain("notes");
    expect(cmd).toContain("tag:demo");
  });
});
