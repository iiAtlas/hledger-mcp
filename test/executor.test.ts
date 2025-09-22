import { jest } from "@jest/globals";

const spawnMock = jest.fn();

jest.unstable_mockModule("child_process", () => ({
  spawn: spawnMock,
}));

const loadExecutor = async () => {
  const module = await import("../src/executor.js");
  return module.HLedgerExecutor;
};

describe("HLedgerExecutor", () => {
  const setupSpawnMock = (options: {
    stdout?: string;
    stderr?: string;
    exitCode?: number | null;
    error?: Error;
    autoClose?: boolean;
    killExitCode?: number | null;
  }) => {
    spawnMock.mockImplementation((_cmd, _args, opts) => {
      const eventHandlers: Record<string, Array<(arg?: any) => void>> = {};
      const stdoutHandlers: Array<(chunk: Buffer) => void> = [];
      const stderrHandlers: Array<(chunk: Buffer) => void> = [];

      const child: any = {
        stdout: {
          on: jest.fn((event: string, handler: (chunk: Buffer) => void) => {
            if (event === "data") stdoutHandlers.push(handler);
            return child.stdout;
          }),
        },
        stderr: {
          on: jest.fn((event: string, handler: (chunk: Buffer) => void) => {
            if (event === "data") stderrHandlers.push(handler);
            return child.stderr;
          }),
        },
        on: jest.fn((event: string, handler: (arg?: any) => void) => {
          eventHandlers[event] ??= [];
          eventHandlers[event].push(handler);
          return child;
        }),
        kill: jest.fn(() => {
          const code = options.killExitCode ?? null;
          eventHandlers["close"]?.forEach((handler) => handler(code));
        }),
      };

      opts?.signal?.addEventListener("abort", () => child.kill("SIGTERM"));

      process.nextTick(() => {
        if (options.error) {
          eventHandlers["error"]?.forEach((handler) => handler(options.error));
          return;
        }

        if (options.autoClose === false) {
          return;
        }

        if (options.stdout) {
          stdoutHandlers.forEach((handler) =>
            handler(Buffer.from(options.stdout ?? "")),
          );
        }
        if (options.stderr) {
          stderrHandlers.forEach((handler) =>
            handler(Buffer.from(options.stderr ?? "")),
          );
        }

        eventHandlers["close"]?.forEach((handler) =>
          handler(options.exitCode ?? 0),
        );
      });

      return child;
    });
  };

  beforeEach(() => {
    jest.resetModules();
    spawnMock.mockReset();
  });

  it("executes allowed command successfully", async () => {
    setupSpawnMock({ stdout: "ok", exitCode: 0 });
    const Executor = await loadExecutor();

    const result = await Executor.execute(
      "print",
      ["--output-format", "csv"],
      {},
    );

    expect(result.success).toBe(true);
    expect(result.stdout).toEqual("ok");
    expect(spawnMock).toHaveBeenCalledWith(
      "hledger",
      ["print", "--output-format", "csv"],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("rejects disallowed command", async () => {
    const Executor = await loadExecutor();
    await expect(Executor.execute("forbidden", [])).rejects.toThrow(
      /not allowed/,
    );
  });

  it("rejects unsupported flag", async () => {
    const Executor = await loadExecutor();
    await expect(Executor.execute("print", ["--unknown"])).rejects.toThrow(
      "Flag '--unknown' is not allowed",
    );
  });

  it("rejects invalid depth shorthand", async () => {
    const Executor = await loadExecutor();
    await expect(Executor.execute("print", ["-0"])).rejects.toThrow(
      "Flag '-0' is not allowed",
    );
  });

  it("rejects invalid file path", async () => {
    const Executor = await loadExecutor();
    await expect(
      Executor.execute("print", ["--file=../secrets.journal"]),
    ).rejects.toThrow(/Invalid file path/);
  });

  it("accepts short flags", async () => {
    setupSpawnMock({ stdout: "ok", exitCode: 0 });
    const Executor = await loadExecutor();

    await Executor.execute("print", ["-f", "test/resources/master.journal"]);
    expect(spawnMock).toHaveBeenCalledWith(
      "hledger",
      expect.arrayContaining(["print", "-f", "test/resources/master.journal"]),
      expect.any(Object),
    );
  });

  it("accepts depth shorthand", async () => {
    setupSpawnMock({ stdout: "ok", exitCode: 0 });
    const Executor = await loadExecutor();

    await Executor.execute("balance", ["-10"]);
    expect(spawnMock).toHaveBeenCalledWith(
      "hledger",
      expect.arrayContaining(["balance", "-10"]),
      expect.any(Object),
    );
  });

  it("rejects arguments with null bytes", async () => {
    const Executor = await loadExecutor();
    await expect(Executor.execute("print", ["bad\0arg"])).rejects.toThrow(
      /contains invalid characters/,
    );
  });

  it("handles non-zero exit as error", async () => {
    setupSpawnMock({ stderr: "error", exitCode: 2 });
    const Executor = await loadExecutor();

    await expect(Executor.execute("print", [])).rejects.toThrow("exit code 2");
  });

  it("handles spawn failure", async () => {
    setupSpawnMock({ error: new Error("spawn failed") });
    const Executor = await loadExecutor();

    await expect(Executor.execute("print", [])).rejects.toThrow(/spawn failed/);
  });

  it("throws TimeoutError when aborted", async () => {
    jest.useFakeTimers();
    setupSpawnMock({ stdout: "never", autoClose: false, killExitCode: null });
    const Executor = await loadExecutor();

    const promise = Executor.execute("print", [], { timeout: 10 });
    jest.advanceTimersByTime(20);
    await Promise.resolve();

    await expect(promise).rejects.toThrow(/Command timed out/);
    jest.useRealTimers();
  });

  it("combines abort signals", async () => {
    const Executor = await loadExecutor();
    const controllerA = new AbortController();
    const controllerB = new AbortController();
    controllerA.abort();

    const combined: AbortSignal = (Executor as any).combineSignals(
      controllerA.signal,
      controllerB.signal,
    );
    let _aborted = false;
    combined.addEventListener("abort", () => {
      _aborted = true;
    });

    expect(combined.aborted).toBe(true);

    const combined2: AbortSignal = (Executor as any).combineSignals(
      controllerB.signal,
    );
    let abortedLater = false;
    combined2.addEventListener("abort", () => {
      abortedLater = true;
    });
    controllerB.abort();
    expect(abortedLater).toBe(true);
  });
});
