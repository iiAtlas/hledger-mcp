import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { jest } from "@jest/globals";
import { WebListTool } from "../src/tools/web-list.js";
import { webProcessRegistry } from "../src/tools/web-process-registry.js";
import { WebStopTool } from "../src/tools/web-stop.js";
import type { WebServerInfo } from "../src/tools/web-types.js";

class FakeChildProcess extends EventEmitter implements Partial<ChildProcess> {
  pid: number;
  killed = false;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;

  constructor(
    private readonly options: {
      killSucceeds?: boolean;
      autoExitOnKill?: boolean;
      exitDelayMs?: number;
    } = {},
  ) {
    super();
    this.pid = Math.floor(10_000 + Math.random() * 10_000);
  }

  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    const killSucceeds = this.options.killSucceeds ?? true;
    if (!killSucceeds || this.killed) {
      return killSucceeds && !this.killed;
    }

    this.killed = true;
    this.signalCode = signal;

    if (this.options.autoExitOnKill ?? true) {
      const delay = this.options.exitDelayMs ?? 0;
      setTimeout(() => {
        this.emitExit(this.exitCode ?? null, this.signalCode ?? signal);
      }, delay);
    }

    return true;
  }

  emitExit(exitCode: number | null, signal: NodeJS.Signals | null): void {
    this.exitCode = exitCode;
    this.signalCode = signal;
    this.emit("exit", exitCode, signal);
  }

  emitError(error: Error): void {
    this.emit("error", error);
  }
}

async function registerInstance(
  overrides: Partial<WebServerInfo> = {},
  childOverride?: FakeChildProcess,
): Promise<{
  instanceId: string;
  child: FakeChildProcess;
}> {
  const child = childOverride ?? new FakeChildProcess();
  registeredChildren.add(child);

  const port = overrides.port ?? Math.floor(20_000 + Math.random() * 10_000);
  const allow = overrides.allow ?? "add";

  const info: WebServerInfo = {
    status: "started",
    pid: child.pid,
    mode: overrides.mode ?? "serve",
    host: overrides.host ?? "127.0.0.1",
    port,
    socket: overrides.socket,
    baseUrl: overrides.baseUrl ?? `http://127.0.0.1:${port}`,
    detectedBaseUrl: overrides.detectedBaseUrl ?? `http://127.0.0.1:${port}`,
    requestedHost: overrides.requestedHost ?? "127.0.0.1",
    requestedPort: overrides.requestedPort ?? port,
    allocatedPort: overrides.allocatedPort ?? port,
    allow,
    requestedAllow: overrides.requestedAllow ?? allow,
    startupOutput:
      overrides.startupOutput ??
      {
        stdout: `Serving web UI at http://127.0.0.1:${port}\n`,
        stderr: "",
      },
    readySignal: overrides.readySignal ?? "log",
    instanceId: overrides.instanceId,
  };

  const record = webProcessRegistry.register(
    child as unknown as ChildProcess,
    info,
    "hledger web --serve",
  );

  return { instanceId: record.instanceId, child };
}

async function drainRegistry(): Promise<void> {
  const running = webProcessRegistry.list();
  for (const instance of running) {
    const matchingChild = Array.from(registeredChildren).find(
      (child) => child.pid === instance.pid,
    );
    if (matchingChild) {
      matchingChild.emitExit(0, "SIGKILL");
    }
  }

  // give listeners a tick to remove themselves
  await new Promise((resolve) => setImmediate(resolve));

  registeredChildren.clear();
}

const registeredChildren = new Set<FakeChildProcess>();

afterEach(async () => {
  jest.useRealTimers();
  await drainRegistry();
});

describe("webProcessRegistry", () => {
  it("registers and lists instances, cleaning up on exit", async () => {
    const { instanceId, child } = await registerInstance();

    expect(webProcessRegistry.list().some((i) => i.instanceId === instanceId)).toBe(
      true,
    );

    child.emitExit(0, "SIGTERM");

    // Allow the exit handler to remove the entry
    await new Promise((resolve) => setImmediate(resolve));

    expect(webProcessRegistry.list()).toHaveLength(0);
  });

  it("removes instances when an error event is emitted", async () => {
    const { instanceId, child } = await registerInstance();
    child.emitError(new Error("boom"));

    await new Promise((resolve) => setImmediate(resolve));

    expect(
      webProcessRegistry.list().some((instance) => instance.instanceId === instanceId),
    ).toBe(false);
  });

  it("throws when stopping an unknown instance", async () => {
    await expect(
      webProcessRegistry.stopInstance("missing-instance"),
    ).rejects.toThrow("No running hledger web instance");
  });

  it("returns cached result when instance already killed", async () => {
    const { instanceId, child } = await registerInstance();
    child.killed = true;
    child.exitCode = 0;
    child.signalCode = "SIGTERM";

    const result = await webProcessRegistry.stopInstance(instanceId);
    expect(result.exitCode).toBe(0);
    expect(result.signal).toBe("SIGTERM");
  });

  it("rejects when unable to send a signal", async () => {
    const failingChild = new FakeChildProcess({ killSucceeds: false });
    const { instanceId } = await registerInstance({}, failingChild);

    await expect(webProcessRegistry.stopInstance(instanceId)).rejects.toThrow(
      `Failed to send SIGTERM to instance ${instanceId}`,
    );
  });

  it("rejects when the child emits an error during shutdown", async () => {
    const child = new FakeChildProcess({ autoExitOnKill: false });
    const { instanceId } = await registerInstance({}, child);

    const promise = webProcessRegistry.stopInstance(instanceId, "SIGTERM", 1000);

    child.emitError(new Error("shutdown error"));

    await expect(promise).rejects.toThrow("shutdown error");
  });

  it("rejects when shutdown times out", async () => {
    jest.useFakeTimers();
    const hangingChild = new FakeChildProcess({ autoExitOnKill: false });
    const { instanceId } = await registerInstance({}, hangingChild);

    const promise = webProcessRegistry.stopInstance(instanceId, "SIGTERM", 5);

    jest.advanceTimersByTime(10);

    await expect(promise).rejects.toThrow(
      `Timed out while stopping instance ${instanceId}`,
    );
  });

  it("stops all running instances", async () => {
    const first = await registerInstance();
    const second = await registerInstance();

    const results = await webProcessRegistry.stopAll("SIGINT", 1000);
    const stoppedIds = results.map((r) => r.record.instanceId);

    expect(stoppedIds).toEqual(
      expect.arrayContaining([first.instanceId, second.instanceId]),
    );
    expect(webProcessRegistry.list()).toHaveLength(0);
  });

  it("wraps errors encountered while stopping all instances", async () => {
    const failingChild = new FakeChildProcess({ killSucceeds: false });
    await registerInstance();
    const { instanceId } = await registerInstance({}, failingChild);

    await expect(webProcessRegistry.stopAll()).rejects.toThrow(
      `Failed to stop instance ${instanceId}: Failed to send SIGTERM to instance ${instanceId}`,
    );
  });
});

describe("web tools", () => {
  it("lists running web instances", async () => {
    const { instanceId } = await registerInstance();
    const listTool = new WebListTool();

    const response = await listTool.execute({});
    expect(response.success).toBe(true);
    if (response.success) {
      const payload = JSON.parse(response.data);
      expect(Array.isArray(payload.instances)).toBe(true);
      expect(
        payload.instances.some(
          (instance: { instanceId: string }) => instance.instanceId === instanceId,
        ),
      ).toBe(true);
    }
  });

  it("stops an instance by pid", async () => {
    const { instanceId, child } = await registerInstance();

    const stopTool = new WebStopTool();
    const response = await stopTool.execute({ pid: child.pid });

    expect(response.success).toBe(true);
    if (response.success) {
      const payload = JSON.parse(response.data);
      expect(payload.stopped).toHaveLength(1);
      expect(payload.stopped[0].instanceId).toBe(instanceId);
    }
  });

  it("stops an instance by instanceId", async () => {
    const { instanceId } = await registerInstance();
    const stopTool = new WebStopTool();

    const response = await stopTool.execute({ instanceId });
    expect(response.success).toBe(true);
    if (response.success) {
      const payload = JSON.parse(response.data);
      expect(payload.stopped).toHaveLength(1);
      expect(payload.stopped[0].instanceId).toBe(instanceId);
    }
  });

  it("stops an instance by port", async () => {
    await registerInstance();
    const running = webProcessRegistry.list();
    const { instanceId, port } = running[0];

    const stopTool = new WebStopTool();
    const response = await stopTool.execute({ port: port ?? 0 });

    expect(response.success).toBe(true);
    if (response.success) {
      const payload = JSON.parse(response.data);
      expect(payload.stopped).toHaveLength(1);
      expect(payload.stopped[0].instanceId).toBe(instanceId);
    }
  });

  it("stops all running instances via the tool", async () => {
    const first = await registerInstance();
    const second = await registerInstance();

    const stopTool = new WebStopTool();
    const response = await stopTool.execute({ all: true });

    expect(response.success).toBe(true);
    if (response.success) {
      const payload = JSON.parse(response.data);
      const stoppedIds = payload.stopped.map((entry: { instanceId: string }) => entry.instanceId);
      expect(stoppedIds).toEqual(
        expect.arrayContaining([first.instanceId, second.instanceId]),
      );
    }
  });

  it("fails when no selector is provided", async () => {
    const stopTool = new WebStopTool();
    const response = await stopTool.execute({});

    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.message).toContain("Specify instanceId");
    }
  });

  it("reports an error when pid does not match any instance", async () => {
    const stopTool = new WebStopTool();
    const response = await stopTool.execute({ pid: 12345 });

    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.message).toContain("No running hledger web instance with pid 12345");
    }
  });

  it("reports an error when stopping all but none are running", async () => {
    const stopTool = new WebStopTool();
    const response = await stopTool.execute({ all: true });

    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.message).toContain("No running hledger web instances to stop");
    }
  });

  it("aggregates errors when stopping all instances", async () => {
    await registerInstance();
   const failingChild = new FakeChildProcess({ killSucceeds: false });
    const { instanceId } = await registerInstance({}, failingChild);

    const stopTool = new WebStopTool();
    const response = await stopTool.execute({ all: true, signal: "SIGTERM" });

    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.message).toContain("Encountered errors while stopping instances");
      expect(response.message).toContain(instanceId);
    }
  });

  it("reports an error when port does not match any instance", async () => {
    const stopTool = new WebStopTool();
    const response = await stopTool.execute({ port: 54321 });

    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.message).toContain("No running hledger web instance on port 54321");
    }
  });

  it("rejects when all is combined with another selector", async () => {
    const stopTool = new WebStopTool();
    const response = await stopTool.execute({ all: true, pid: 123 });

    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.message).toContain("all=true cannot be combined with other selectors");
    }
  });

  it("rejects when multiple selectors are provided", async () => {
    const stopTool = new WebStopTool();
    const response = await stopTool.execute({ pid: 123, port: 456 });

    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.message).toContain("Provide only one of instanceId, pid, or port");
    }
  });
});
