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
    const result = await accountsTool.execute({});
    expect(result.success).toBe(true);
    expect(result.data).toContain("assets:bank:checking");
  });

  it("generates a balance report in CSV", async () => {
    const result = await balanceTool.execute({ query: "assets", outputFormat: "csv" });
    expect(result.success).toBe(true);
    expect(result.data.split("\n")[0]).toContain("account");
    expect(result.metadata.command).toContain("--output-format csv");
  });

  it("shows register entries with related postings", async () => {
    const result = await registerTool.execute({ query: "project: demo-project", related: true, outputFormat: "csv" });
    expect(result.success).toBe(true);
    expect(result.data).toContain("demo-project");
  });

  it("prints transactions filtered by query", async () => {
    const result = await printTool.execute({ query: "project: demo-project", outputFormat: "csv" });
    expect(result.success).toBe(true);
    expect(result.data).toContain("demo-project.ai");
  });

  it("produces a balance sheet summary", async () => {
    const result = await balanceSheetTool.execute({ outputFormat: "csv" });
    expect(result.success).toBe(true);
    expect(result.data).toContain("Balance Sheet");
  });
});
