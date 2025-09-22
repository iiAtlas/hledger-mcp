import path from "node:path";
import { readFile as readFileFs } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HLedgerExecutor } from "./executor.js";

type ResourceCapableServer = Pick<McpServer, "registerResource">;

export interface RegisterJournalResourcesOptions {
  listFiles?: (journalFile: string) => Promise<string[]>;
  readFile?: (filePath: string) => Promise<string>;
  logger?: Pick<Console, "error" | "warn" | "info" | "debug">;
}

const RESOURCE_DESCRIPTION = "Journal file loaded by hledger";

const defaultListFiles = async (journalFile: string): Promise<string[]> => {
  const result = await HLedgerExecutor.execute("files", ["--file", journalFile]);
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const defaultReadFile = async (filePath: string): Promise<string> => {
  return await readFileFs(filePath, "utf8");
};

export async function registerJournalResources(
  server: ResourceCapableServer,
  journalFilePath: string,
  options: RegisterJournalResourcesOptions = {}
): Promise<void> {
  const listFiles = options.listFiles ?? defaultListFiles;
  const readFile = options.readFile ?? defaultReadFile;
  const logger = options.logger ?? console;

  const resolvedJournalPath = path.normalize(path.resolve(journalFilePath));
  const journalDir = path.dirname(resolvedJournalPath);
  const discoveredPaths = new Set<string>([resolvedJournalPath]);

  try {
    const files = await listFiles(resolvedJournalPath);
    for (const entry of files) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const absolutePath = path.isAbsolute(trimmed)
        ? trimmed
        : path.resolve(journalDir, trimmed);
      discoveredPaths.add(path.normalize(absolutePath));
    }
  } catch (error) {
    logger.error?.("Failed to discover included journal files via hledger", error);
  }

  const usedNames = new Set<string>();

  for (const filePath of discoveredPaths) {
    const uri = pathToFileURL(filePath).href;
    const relative = path.relative(journalDir, filePath);
    let name = !relative || relative.startsWith("..") ? path.basename(filePath) : relative;
    name = name.replace(/\\/g, "/");
    if (!name) {
      name = path.basename(filePath) || uri;
    }
    if (usedNames.has(name)) {
      name = uri;
    }
    usedNames.add(name);

    server.registerResource(
      name,
      uri,
      {
        title: name,
        description: RESOURCE_DESCRIPTION,
        mimeType: "text/plain",
      },
      async (resourceUri) => {
        try {
          const fileSystemPath = fileURLToPath(resourceUri);
          const contents = await readFile(fileSystemPath);
          return {
            contents: [
              {
                uri: resourceUri.href,
                mimeType: "text/plain",
                text: contents,
              },
            ],
          };
        } catch (readError) {
          logger.error?.(`Failed to read journal resource ${resourceUri.href}`, readError);
          throw readError;
        }
      }
    );
  }
}
