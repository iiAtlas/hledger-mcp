import path from "node:path";
import { AccountsTool } from "../src/tools/accounts.js";
import { BalanceTool } from "../src/tools/balance.js";
import { BalanceSheetTool } from "../src/tools/balancesheet.js";
import { PrintTool } from "../src/tools/print.js";
import { RegisterTool } from "../src/tools/register.js";

const journalPath = path.resolve("test/master.journal");

describe("hledger MCP tools", () => {
  const accountsTool = new AccountsTool(journalPath);
  const balanceTool = new BalanceTool(journalPath);
  const registerTool = new RegisterTool(journalPath);
  const printTool = new PrintTool(journalPath);
  const balanceSheetTool = new BalanceSheetTool(journalPath);

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
});
