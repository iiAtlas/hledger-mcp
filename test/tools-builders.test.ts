import { jest } from "@jest/globals";
import { HLedgerExecutor } from "../src/executor.js";
import { AccountsTool } from "../src/tools/accounts.js";
import { BalanceTool } from "../src/tools/balance.js";
import { BalanceSheetTool } from "../src/tools/balancesheet.js";
import { BalanceSheetEquityTool } from "../src/tools/balancesheetequity.js";
import { PrintTool } from "../src/tools/print.js";
import { RegisterTool } from "../src/tools/register.js";
import { IncomeStatementTool } from "../src/tools/incomestatement.js";
import { CashFlowTool } from "../src/tools/cashflow.js";

const journalPath = "/tmp/test.journal";

const mockCommandResult = (command: string, args: string[]) => ({
  success: true,
  stdout: "mock",
  stderr: "",
  exitCode: 0,
  command: `hledger ${command} ${args.join(" ")}`.trim(),
  duration: 1,
});

describe("Tool argument builders", () => {
  let executeSpy: jest.SpiedFunction<typeof HLedgerExecutor.execute>;

  beforeEach(() => {
    executeSpy = jest.spyOn(HLedgerExecutor, "execute").mockImplementation(async (command, args) => mockCommandResult(command, args));
  });

  afterEach(() => {
    executeSpy.mockRestore();
  });

  it("builds accounts command options", async () => {
    const tool = new AccountsTool(journalPath);
    const result = await tool.execute({ flat: true, tree: true, drop: 2, declared: true, query: "assets" });

    expect(result.success).toBe(true);
    expect(result.metadata.command).toContain("--flat");
    expect(result.metadata.command).toContain("--tree");
    expect(result.metadata.command).toContain("--drop 2");
    expect(result.metadata.command).toContain("--declared");
    expect(result.metadata.command).toContain("assets");
  });

  it("builds balance command options", async () => {
    const tool = new BalanceTool(journalPath);
    const result = await tool.execute({
      sum: true,
      budget: true,
      valuechange: true,
      gain: true,
      count: true,
      change: true,
      cumulative: true,
      historical: true,
      flat: true,
      tree: true,
      drop: 1,
      declared: true,
      average: true,
      rowTotal: true,
      noTotal: true,
      sortAmount: true,
      percent: true,
      invert: true,
      transpose: true,
      layout: "bare",
      noElide: true,
      format: "custom",
      outputFormat: "csv",
    });

    const cmd = result.metadata.command;
    ["--sum", "--budget", "--valuechange", "--gain", "--count", "--change", "--cumulative", "--historical",
      "--flat", "--tree", "--drop 1", "--declared", "--average", "--row-total", "--no-total",
      "--sort-amount", "--percent", "--invert", "--transpose", "--layout bare", "--no-elide", "--format custom",
      "--output-format csv"].forEach(flag => {
      expect(cmd).toContain(flag);
    });
  });

  it("builds register command options", async () => {
    const tool = new RegisterTool(journalPath);
    const result = await tool.execute({ average: true, related: true, format: "%d", outputFormat: "csv", query: "assets" });

    const cmd = result.metadata.command;
    expect(cmd).toContain("--average");
    expect(cmd).toContain("--related");
    expect(cmd).toContain("--format %d");
    expect(cmd).toContain("--output-format csv");
    expect(cmd).toContain("assets");
  });

  it("builds print command options", async () => {
    const tool = new PrintTool(journalPath);
    const result = await tool.execute({ format: "%d %a", explicit: true, match: "cash", pretty: true, outputFormat: "csv", query: "cash" });

    const cmd = result.metadata.command;
    expect(cmd).toContain("--format %d %a");
    expect(cmd).toContain("--explicit");
    expect(cmd).toContain("--match cash");
    expect(cmd).toContain("--pretty");
    expect(cmd).toContain("--output-format csv");
  });

  it("builds balance sheet command options", async () => {
    const tool = new BalanceSheetTool(journalPath);
    const result = await tool.execute({ flat: true, tree: true, drop: 1, declared: true, noTotal: true, layout: "wide", outputFormat: "csv" });

    const cmd = result.metadata.command;
    expect(cmd).toContain("--flat");
    expect(cmd).toContain("--tree");
    expect(cmd).toContain("--drop 1");
    expect(cmd).toContain("--declared");
    expect(cmd).toContain("--no-total");
    expect(cmd).toContain("--layout wide");
  });

  it("builds balancesheetequity command options", async () => {
    const tool = new BalanceSheetEquityTool(journalPath);
    const result = await tool.execute({ flat: true, drop: 1, layout: "bare", outputFormat: "csv" });

    const cmd = result.metadata.command;
    ["--flat", "--drop 1", "--layout bare"].forEach(flag => expect(cmd).toContain(flag));
  });

  it("builds incomestatement command options", async () => {
    const tool = new IncomeStatementTool(journalPath);
    const result = await tool.execute({
      flat: true,
      tree: true,
      drop: 1,
      declared: true,
      average: true,
      noTotal: true,
      percent: true,
      layout: "tall",
      outputFormat: "csv",
    });

    const cmd = result.metadata.command;
    ["--average", "--no-total", "--percent", "--layout tall"].forEach(flag => expect(cmd).toContain(flag));
  });

  it("builds cashflow command options", async () => {
    const tool = new CashFlowTool(journalPath);
    const result = await tool.execute({ flat: true, tree: true, drop: 1, declared: true, layout: "tidy", noTotal: true });

    const cmd = result.metadata.command;
    ["--flat", "--tree", "--drop 1", "--declared", "--layout tidy", "--no-total"].forEach(flag => expect(cmd).toContain(flag));
  });
});
