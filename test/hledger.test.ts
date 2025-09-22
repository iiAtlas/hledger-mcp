import path from "node:path";
import { AccountsTool } from "../src/tools/accounts.js";
import { BalanceTool } from "../src/tools/balance.js";
import { BalanceSheetTool } from "../src/tools/balancesheet.js";
import { BalanceSheetEquityTool } from "../src/tools/balancesheetequity.js";
import { PrintTool } from "../src/tools/print.js";
import { RegisterTool } from "../src/tools/register.js";
import { IncomeStatementTool } from "../src/tools/incomestatement.js";
import { CashFlowTool } from "../src/tools/cashflow.js";
import { PayeesTool } from "../src/tools/payees.js";
import { DescriptionsTool } from "../src/tools/descriptions.js";
import { TagsTool } from "../src/tools/tags.js";
import { FilesTool } from "../src/tools/files.js";

const journalPath = path.resolve("test/resources/master.journal");

describe("hledger MCP tools", () => {
  const accountsTool = new AccountsTool(journalPath);
  const balanceTool = new BalanceTool(journalPath);
  const registerTool = new RegisterTool(journalPath);
  const printTool = new PrintTool(journalPath);
  const balanceSheetTool = new BalanceSheetTool(journalPath);
  const balanceSheetEquityTool = new BalanceSheetEquityTool(journalPath);
  const incomeStatementTool = new IncomeStatementTool(journalPath);
  const cashFlowTool = new CashFlowTool(journalPath);
  const payeesTool = new PayeesTool(journalPath);
  const descriptionsTool = new DescriptionsTool(journalPath);
  const tagsTool = new TagsTool(journalPath);
  const filesTool = new FilesTool(journalPath);

  it("lists accounts", async () => {
    const result = await accountsTool.execute({ flat: true });
    expect(result.success).toBe(true);
    expect(result.data).toContain("assets:bank:checking");
    expect(result.metadata.command).toContain("--flat");
  });

  it("generates a balance report in CSV", async () => {
    const result = await balanceTool.execute({
      query: "assets",
      outputFormat: "csv",
      flat: true,
      percent: true,
      layout: "tall",
      change: true,
      drop: 1,
    });
    expect(result.success).toBe(true);
    expect(result.data.split("\n")[0]).toContain("account");
    expect(result.metadata.command).toContain("--output-format csv");
    expect(result.metadata.command).toContain("--percent");
    expect(result.metadata.command).toContain("--layout tall");
    expect(result.metadata.command).toContain("--change");
  });

  it("shows register entries with related postings", async () => {
    const result = await registerTool.execute({ query: "project: demo-project", related: true, outputFormat: "csv", average: true });
    expect(result.success).toBe(true);
    expect(result.data).toContain("demo-project");
    expect(result.metadata.command).toContain("--average");
  });

  it("prints transactions filtered by query", async () => {
    const result = await printTool.execute({ query: "project: demo-project", outputFormat: "csv", explicit: true });
    expect(result.success).toBe(true);
    expect(result.data).toContain("demo-project.ai");
    expect(result.metadata.command).toContain("--explicit");
  });

  it("produces a balance sheet summary", async () => {
    const result = await balanceSheetTool.execute({ outputFormat: "csv", flat: true, drop: 1, declared: true, noTotal: true, layout: "wide" });
    expect(result.success).toBe(true);
    expect(result.data).toContain("Balance Sheet");
    expect(result.metadata.command).toContain("--no-total");
  });

  it("produces a balance sheet with equity", async () => {
    const result = await balanceSheetEquityTool.execute({ outputFormat: "csv", flat: true, layout: "tall" });
    expect(result.success).toBe(true);
    expect(result.metadata.command).toContain("balancesheetequity");
  });

  it("produces an income statement", async () => {
    const result = await incomeStatementTool.execute({ outputFormat: "csv", percent: true, layout: "wide" });
    expect(result.success).toBe(true);
    expect(result.metadata.command).toContain("incomestatement");
  });

  it("produces a cash flow statement", async () => {
    const result = await cashFlowTool.execute({ outputFormat: "csv", layout: "bare" });
    expect(result.success).toBe(true);
    expect(result.metadata.command).toContain("cashflow");
  });

  it("lists payees", async () => {
    const result = await payeesTool.execute({ outputFormat: "csv" });
    expect(result.success).toBe(true);
    expect(result.metadata.command).toContain("payees");
  });

  it("lists descriptions", async () => {
    const result = await descriptionsTool.execute({ outputFormat: "csv" });
    expect(result.success).toBe(true);
    expect(result.metadata.command).toContain("descriptions");
  });

  it("lists tags", async () => {
    const result = await tagsTool.execute({ outputFormat: "csv" });
    expect(result.success).toBe(true);
    expect(result.metadata.command).toContain("tags");
  });

  it("lists files", async () => {
    const result = await filesTool.execute({});
    expect(result.success).toBe(true);
    expect(result.metadata.command).toContain("files");
  });
});
