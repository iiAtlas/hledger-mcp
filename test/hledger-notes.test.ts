import path from "node:path";
import { NotesTool } from "../src/tools/notes.js";

const journalPath = path.resolve("test/resources/master.journal");

describe("hledger notes tool", () => {
  it("lists notes from the journal", async () => {
    const tool = new NotesTool(journalPath);
    const result = await tool.execute({});

    expect(result.success).toBe(true);
    expect(result.data.toLowerCase()).toContain("openai credits");
  });
});
