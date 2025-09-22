import { DateSchema, FilePathSchema, CommonOptionsSchema, HLedgerError, ValidationError, TimeoutError } from "../src/types.js";

describe("types schemas", () => {
  it("validates date formats", () => {
    expect(DateSchema.parse("2025-01-01")).toBe("2025-01-01");
    expect(() => DateSchema.parse("2025/01/01")).toThrow();
  });

  it("validates file paths", () => {
    expect(FilePathSchema.parse("journal.hledger")).toBe("journal.hledger");
    expect(() => FilePathSchema.parse("../secret" )).toThrow();
  });

  it("parses common options", () => {
    const parsed = CommonOptionsSchema.parse({ monthly: true, depth: 2 });
    expect(parsed.monthly).toBe(true);
    expect(parsed.depth).toBe(2);
  });
});

describe("custom errors", () => {
  it("captures HLedgerError metadata", () => {
    const error = new HLedgerError("failed", 2, "stderr", "hledger test");
    expect(error.message).toBe("failed");
    expect(error.exitCode).toBe(2);
    expect(error.stderr).toBe("stderr");
    expect(error.command).toBe("hledger test");
  });

  it("creates validation and timeout errors", () => {
    expect(new ValidationError("nope").message).toBe("nope");
    expect(new TimeoutError("too slow").message).toBe("too slow");
  });
});
