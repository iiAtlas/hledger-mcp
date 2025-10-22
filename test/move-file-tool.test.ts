import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { MoveFileTool } from "../src/tools/move-file.js";

async function setupTempFileDir(): Promise<{
  dir: string;
  pdfPath: string;
  jpgPath: string;
  txtPath: string;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "hledger-move-"));

  // Create test files
  const pdfPath = path.join(dir, "receipt.pdf");
  const jpgPath = path.join(dir, "photo.jpg");
  const txtPath = path.join(dir, "text.txt");

  await fs.writeFile(pdfPath, "fake pdf content");
  await fs.writeFile(jpgPath, "fake jpg content");
  await fs.writeFile(txtPath, "fake text content");

  return { dir, pdfPath, jpgPath, txtPath };
}

describe("MoveFileTool", () => {
  let tempDir: string;
  let pdfPath: string;
  let jpgPath: string;
  let txtPath: string;

  beforeEach(async () => {
    const setup = await setupTempFileDir();
    tempDir = setup.dir;
    pdfPath = setup.pdfPath;
    jpgPath = setup.jpgPath;
    txtPath = setup.txtPath;
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("moves a PDF file to a new location", async () => {
    const tool = new MoveFileTool(undefined, { allowFileOperations: true });
    const destPath = path.join(tempDir, "receipts", "moved-receipt.pdf");

    const result = await tool.execute({
      sourcePath: pdfPath,
      destinationPath: destPath,
    });

    expect(result.success).toBe(true);
    expect(result.data).toContain("moved-receipt.pdf");

    // Verify the file was moved
    const destExists = await fs
      .access(destPath)
      .then(() => true)
      .catch(() => false);
    expect(destExists).toBe(true);

    const sourceExists = await fs
      .access(pdfPath)
      .then(() => true)
      .catch(() => false);
    expect(sourceExists).toBe(false);
  });

  it("renames a file in the same directory", async () => {
    const tool = new MoveFileTool(undefined, { allowFileOperations: true });
    const destPath = path.join(tempDir, "renamed-receipt.pdf");

    const result = await tool.execute({
      sourcePath: pdfPath,
      destinationPath: destPath,
    });

    expect(result.success).toBe(true);

    const destExists = await fs
      .access(destPath)
      .then(() => true)
      .catch(() => false);
    expect(destExists).toBe(true);

    const sourceExists = await fs
      .access(pdfPath)
      .then(() => true)
      .catch(() => false);
    expect(sourceExists).toBe(false);
  });

  it("moves an image file", async () => {
    const tool = new MoveFileTool(undefined, { allowFileOperations: true });
    const destPath = path.join(tempDir, "images", "moved-photo.jpg");

    const result = await tool.execute({
      sourcePath: jpgPath,
      destinationPath: destPath,
    });

    expect(result.success).toBe(true);

    const destExists = await fs
      .access(destPath)
      .then(() => true)
      .catch(() => false);
    expect(destExists).toBe(true);
  });

  it("moves to a directory while keeping the original filename", async () => {
    const tool = new MoveFileTool(undefined, { allowFileOperations: true });
    const destDir = path.join(tempDir, "receipts");
    await fs.mkdir(destDir, { recursive: true });

    const result = await tool.execute({
      sourcePath: pdfPath,
      destinationPath: destDir,
    });

    expect(result.success).toBe(true);

    const expectedDest = path.join(destDir, "receipt.pdf");
    const destExists = await fs
      .access(expectedDest)
      .then(() => true)
      .catch(() => false);
    expect(destExists).toBe(true);
  });

  it("rejects non-PDF and non-image files", async () => {
    const tool = new MoveFileTool(undefined, { allowFileOperations: true });
    const destPath = path.join(tempDir, "moved-text.txt");

    const result = await tool.execute({
      sourcePath: txtPath,
      destinationPath: destPath,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("ValidationError");
    expect(result.message).toContain("Only PDF and image files can be moved");
  });

  it("fails when file operations are disabled", async () => {
    const tool = new MoveFileTool(undefined, { allowFileOperations: false });
    const destPath = path.join(tempDir, "moved-receipt.pdf");

    const result = await tool.execute({
      sourcePath: pdfPath,
      destinationPath: destPath,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("ValidationError");
    expect(result.message).toContain("File operations are disabled");
  });

  it("fails when file operations are disabled by default", async () => {
    const tool = new MoveFileTool(); // No options - should default to disabled
    const destPath = path.join(tempDir, "moved-receipt.pdf");

    const result = await tool.execute({
      sourcePath: pdfPath,
      destinationPath: destPath,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("ValidationError");
    expect(result.message).toContain("File operations are disabled");
  });

  it("fails when source file does not exist", async () => {
    const tool = new MoveFileTool(undefined, { allowFileOperations: true });
    const nonExistentPath = path.join(tempDir, "nonexistent.pdf");
    const destPath = path.join(tempDir, "dest.pdf");

    const result = await tool.execute({
      sourcePath: nonExistentPath,
      destinationPath: destPath,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("ValidationError");
    expect(result.message).toContain("Source file not found");
  });

  it("fails when destination exists without overwrite flag", async () => {
    const tool = new MoveFileTool(undefined, { allowFileOperations: true });
    const destPath = path.join(tempDir, "dest.pdf");
    await fs.writeFile(destPath, "existing content");

    const result = await tool.execute({
      sourcePath: pdfPath,
      destinationPath: destPath,
      overwrite: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("ValidationError");
    expect(result.message).toContain("Destination file already exists");
  });

  it("overwrites destination when overwrite flag is true", async () => {
    const tool = new MoveFileTool(undefined, { allowFileOperations: true });
    const destPath = path.join(tempDir, "dest.pdf");
    await fs.writeFile(destPath, "existing content");

    const result = await tool.execute({
      sourcePath: pdfPath,
      destinationPath: destPath,
      overwrite: true,
    });

    expect(result.success).toBe(true);

    const content = await fs.readFile(destPath, "utf8");
    expect(content).toBe("fake pdf content");
  });

  it("rejects changing file extension", async () => {
    const tool = new MoveFileTool(undefined, { allowFileOperations: true });
    const destPath = path.join(tempDir, "receipt.jpg"); // Trying to change .pdf to .jpg

    const result = await tool.execute({
      sourcePath: pdfPath,
      destinationPath: destPath,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("ValidationError");
    expect(result.message).toContain("must match source extension");
  });

  it("supports various image formats", async () => {
    const tool = new MoveFileTool(undefined, { allowFileOperations: true });
    const formats = ["png", "gif", "bmp", "webp", "tiff"];

    for (const format of formats) {
      const srcPath = path.join(tempDir, `image.${format}`);
      await fs.writeFile(srcPath, "fake image");

      const destPath = path.join(tempDir, `moved.${format}`);
      const result = await tool.execute({
        sourcePath: srcPath,
        destinationPath: destPath,
      });

      expect(result.success).toBe(true);

      // Clean up for next iteration
      await fs.rm(destPath, { force: true });
    }
  });

  it("creates destination directory if it doesn't exist", async () => {
    const tool = new MoveFileTool(undefined, { allowFileOperations: true });
    const destPath = path.join(tempDir, "nested", "dir", "structure", "file.pdf");

    const result = await tool.execute({
      sourcePath: pdfPath,
      destinationPath: destPath,
    });

    expect(result.success).toBe(true);

    const destExists = await fs
      .access(destPath)
      .then(() => true)
      .catch(() => false);
    expect(destExists).toBe(true);
  });
});
