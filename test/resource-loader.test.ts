import { jest } from "@jest/globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerJournalResources } from "../src/resource-loader.js";

describe("registerJournalResources", () => {
  it("registers the root journal and discovered includes", async () => {
    const registrations: Array<{
      name: string;
      uri: string;
      metadata: Record<string, unknown>;
      readCallback: (uri: URL) => Promise<any>;
    }> = [];

    const registerResource = jest.fn(
      (name: string, uri: string, metadata: any, readCallback: any) => {
        registrations.push({ name, uri, metadata, readCallback });
        return {} as any;
      },
    );

    const mockServer = { registerResource } as any;

    const listFiles = jest.fn(async () => [
      "include.journal",
      "/external/third.journal",
      "",
      "   ",
    ]);

    const readFileCalls: string[] = [];
    const readFile = jest.fn(async (filePath: string) => {
      readFileCalls.push(filePath);
      return `contents:${path.basename(filePath)}`;
    });

    const rootJournal = path.resolve("/workspace/journals/master.journal");

    await registerJournalResources(mockServer, rootJournal, {
      listFiles,
      readFile,
    });

    expect(listFiles).toHaveBeenCalledWith(rootJournal);
    expect(registerResource).toHaveBeenCalledTimes(3);

    const names = registrations.map((r) => r.name);
    expect(names).toEqual([
      "master.journal",
      "include.journal",
      "third.journal",
    ]);

    for (const registration of registrations) {
      expect(registration.metadata).toMatchObject({
        title: registration.name,
        description: "Journal file loaded by hledger",
        mimeType: "text/plain",
      });
    }

    for (const registration of registrations) {
      const result = await registration.readCallback(new URL(registration.uri));
      const expectedPath = fileURLToPath(new URL(registration.uri));
      expect(result.contents[0]).toEqual({
        uri: registration.uri,
        mimeType: "text/plain",
        text: `contents:${path.basename(expectedPath)}`,
      });
    }

    expect(readFileCalls).toEqual([
      path.resolve("/workspace/journals/master.journal"),
      path.resolve("/workspace/journals/include.journal"),
      path.resolve("/external/third.journal"),
    ]);
  });

  it("logs and continues when hledger files discovery fails", async () => {
    const registerResource = jest.fn(() => ({}) as any);
    const mockServer = { registerResource } as any;

    const discoveryError = new Error("files failed");
    const listFiles = jest.fn(async () => {
      throw discoveryError;
    });

    const logger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    };

    const readFile = jest.fn(async () => "root contents");

    const rootJournal = path.resolve("/workspace/journals/master.journal");

    await registerJournalResources(mockServer, rootJournal, {
      listFiles,
      readFile,
      logger,
    });

    expect(listFiles).toHaveBeenCalledWith(rootJournal);
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to discover included journal files via hledger",
      discoveryError,
    );
    expect(registerResource).toHaveBeenCalledTimes(1);

    const registration = registerResource.mock.calls[0];
    const readCallback = registration[3];
    const result = await readCallback(new URL(registration[1]));
    expect(result.contents[0].text).toBe("root contents");
  });
});
