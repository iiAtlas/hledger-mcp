import { jest } from "@jest/globals";

type HledgerPathModule = typeof import("../src/hledger-path.js");

const execSyncMock = jest.fn();

async function loadModule(setup?: () => void): Promise<HledgerPathModule> {
  jest.resetModules();
  execSyncMock.mockReset();
  jest.unstable_mockModule("child_process", () => ({
    execSync: execSyncMock,
  }));

  setup?.();

  return import("../src/hledger-path.js");
}

describe("hledger path discovery", () => {
  afterEach(() => {
    delete process.env.HLEDGER_EXECUTABLE_PATH;
  });

  it("prefers a valid custom executable path", async () => {
    process.env.HLEDGER_EXECUTABLE_PATH = "/custom/hledger";
    const module = await loadModule(() => {
      execSyncMock.mockImplementation(() => undefined);
    });

    expect(module.checkHledgerInstallation()).toBe(true);
    expect(execSyncMock).toHaveBeenCalledWith(
      '"/custom/hledger" --version',
      expect.objectContaining({ stdio: "pipe", timeout: 5000 }),
    );
    expect(module.getHledgerPath()).toBe("/custom/hledger");
  });

  it("falls back to the first working common path", async () => {
    const module = await loadModule(() => {
      execSyncMock.mockImplementation((command: string) => {
        if (command.startsWith("/opt/homebrew/bin/hledger")) {
          return undefined;
        }
        throw new Error("not found");
      });
    });

    expect(module.checkHledgerInstallation()).toBe(true);
    expect(module.getHledgerPath()).toBe("/opt/homebrew/bin/hledger");
  });

  it("returns false when no executable can be found", async () => {
    const module = await loadModule(() => {
      execSyncMock.mockImplementation(() => {
        throw new Error("missing");
      });
    });

    expect(module.checkHledgerInstallation()).toBe(false);
    expect(module.getHledgerPath()).toBe("hledger");
  });
});
