import {
  JournalFileEditor,
  normalizeEntryForComparison,
} from "../src/utils/journal-file.js";
import { ValidationError } from "../src/types.js";

describe("JournalFileEditor", () => {
  const sampleContent = [
    "2025-01-01 * Alpha",
    "  assets:cash  $1",
    "  income:salary -$1",
    "",
    "2025-01-02 * Beta",
    "  assets:cash  $2",
    "  income:salary -$2",
    "",
  ].join("\n");

  it("removes following blank lines when collapseWhitespace is true", () => {
    const editor = new JournalFileEditor(sampleContent);
    const result = editor.remove(1, 3, true);

    expect(result.trailingBlankRemoved).toBe(true);
    expect(result.removedText).toContain("2025-01-01 * Alpha");
    expect(editor.toString().startsWith("2025-01-02 * Beta")).toBe(true);
  });

  it("retains blank lines when collapseWhitespace is false", () => {
    const editor = new JournalFileEditor(sampleContent);
    const result = editor.remove(1, 3, false);

    expect(result.trailingBlankRemoved).toBe(false);
    expect(editor.toString().startsWith("\n2025-01-02 * Beta")).toBe(true);
  });

  it("replaces entries while normalizing newline handling", () => {
    const editor = new JournalFileEditor(sampleContent);
    const result = editor.replace(
      5,
      7,
      "2025-01-02 * Beta updated\r\n  assets $3\r\n  income -$3",
    );

    expect(result.insertedText.endsWith("\n")).toBe(true);
    expect(result.insertedText).not.toContain("\r\n");
    expect(editor.toString()).toContain("Beta updated");
  });

  it("normalizes entries for comparison", () => {
    const normalized = normalizeEntryForComparison(
      "2025-01-01 * Alpha\r\n  assets $1\r\n  income -$1",
    );

    expect(normalized.endsWith("\n")).toBe(true);
    expect(normalized).not.toContain("\r\n");
  });

  it("throws when provided an invalid line range", () => {
    const editor = new JournalFileEditor(sampleContent);
    expect(() => editor.extract(3, 2)).toThrow(ValidationError);
    expect(() => editor.remove(1, 12)).toThrow(ValidationError);
  });

  it("handles empty files by providing a single blank segment", () => {
    const editor = new JournalFileEditor("");
    expect(editor.toString()).toBe("");
    const result = editor.replace(
      1,
      1,
      "2025-01-01 * Only entry\n  assets $1\n  income -$1",
    );
    expect(result.insertedText.endsWith("\n")).toBe(true);
    expect(editor.toString()).toContain("Only entry");
  });
});
