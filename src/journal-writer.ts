import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { HLedgerExecutor } from "./executor.js";
import { CommandResult } from "./types.js";

interface AppendTransactionParams {
  journalPath: string;
  transaction: string;
  dryRun?: boolean;
  skipBackup?: boolean;
}

export interface AppendTransactionResult {
  applied: boolean;
  journalPath: string;
  backupPath?: string;
  transaction: string;
  checkResult: CommandResult;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

async function createWorkingCopy(sourcePath: string, destinationPath: string, sourceExists: boolean): Promise<void> {
  if (sourceExists) {
    await fs.copyFile(sourcePath, destinationPath);
  } else {
    await fs.writeFile(destinationPath, "", "utf8");
  }
}

async function determineSeparator(tempPath: string): Promise<string> {
  const handle = await fs.open(tempPath, "r");
  try {
    const stats = await handle.stat();
    if (stats.size === 0) {
      return "";
    }

    const buffer = Buffer.alloc(1);
    await handle.read(buffer, 0, 1, Math.max(0, stats.size - 1));
    const lastChar = buffer.toString();
    return lastChar === "\n" ? "\n" : "\n\n";
  } finally {
    await handle.close();
  }
}

export async function appendTransactionSafely({
  journalPath,
  transaction,
  dryRun = false,
  skipBackup = false,
}: AppendTransactionParams): Promise<AppendTransactionResult> {
  const normalizedTransaction = transaction.trimEnd();
  await ensureDirectory(journalPath);

  const journalExists = await fileExists(journalPath);
  const dir = path.dirname(journalPath);
  const base = path.basename(journalPath);
  const tempPath = path.join(dir, `${base}.tmp-${randomUUID()}`);

  await createWorkingCopy(journalPath, tempPath, journalExists);

  let separator = "";
  if (journalExists) {
    separator = await determineSeparator(tempPath);
  }

  const entry = `${separator}${normalizedTransaction}\n`;
  await fs.appendFile(tempPath, entry, "utf8");

  let checkResult: CommandResult;
  try {
    checkResult = await HLedgerExecutor.execute("check", ["--file", tempPath]);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }

  if (dryRun) {
    await fs.rm(tempPath, { force: true });
    return {
      applied: false,
      journalPath,
      transaction: normalizedTransaction,
      checkResult,
    };
  }

  let backupPath: string | undefined;
  if (journalExists) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (!skipBackup) {
      backupPath = path.join(dir, `${base}.bak-${timestamp}`);
      await fs.copyFile(journalPath, backupPath);
    }
  }

  await fs.rename(tempPath, journalPath);

  return {
    applied: true,
    journalPath,
    backupPath,
    transaction: normalizedTransaction,
    checkResult,
  };
}
