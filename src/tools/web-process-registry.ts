import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { WebInstanceRecord, WebServerInfo } from "./web-types.js";

interface WebProcessEntry {
  record: WebInstanceRecord;
  child: ChildProcess;
}

class WebProcessRegistry {
  private readonly instances = new Map<string, WebProcessEntry>();

  register(
    child: ChildProcess,
    info: WebServerInfo,
    command: string,
  ): WebInstanceRecord {
    const instanceId = info.instanceId ?? `web-${randomUUID()}`;
    const record: WebInstanceRecord = {
      ...info,
      instanceId,
      command,
      startedAt: new Date().toISOString(),
    };

    const entry: WebProcessEntry = { record, child };
    this.instances.set(instanceId, entry);

    const removeEntry = () => {
      this.instances.delete(instanceId);
      child.removeListener("error", onError);
    };

    const onError = () => {
      removeEntry();
    };

    child.once("exit", removeEntry);
    child.once("error", onError);

    return record;
  }

  list(): WebInstanceRecord[] {
    return Array.from(this.instances.values()).map(({ record }) => ({
      ...record,
    }));
  }

  async stopInstance(
    instanceId: string,
    signal: NodeJS.Signals = "SIGTERM",
    timeoutMs = 3000,
  ): Promise<{ record: WebInstanceRecord; exitCode: number | null; signal: NodeJS.Signals | null; }> {
    const entry = this.instances.get(instanceId);
    if (!entry) {
      throw new Error(`No running hledger web instance with id ${instanceId}`);
    }

    const { child, record } = entry;

    if (child.killed) {
      this.instances.delete(instanceId);
      return { record, exitCode: child.exitCode ?? null, signal: child.signalCode ?? null };
    }

    return await new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        child.off("exit", onExit);
        child.off("error", onError);
        clearTimeout(timer);
      };

      const resolveResult = (
        exitCode: number | null,
        receivedSignal: NodeJS.Signals | null,
      ) => {
        if (settled) return;
        settled = true;
        cleanup();
        this.instances.delete(instanceId);
        resolve({ record, exitCode, signal: receivedSignal });
      };

      const onExit = (code: number | null, receivedSignal: NodeJS.Signals | null) => {
        resolveResult(code, receivedSignal);
      };

      const onError = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        this.instances.delete(instanceId);
        reject(error);
      };

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`Timed out while stopping instance ${instanceId}`));
      }, timeoutMs);

      child.once("exit", onExit);
      child.once("error", onError);

      const signalSent = child.kill(signal);
      if (!signalSent) {
        settled = true;
        cleanup();
        reject(new Error(`Failed to send ${signal} to instance ${instanceId}`));
      }
    });
  }

  stopAll(
    signal: NodeJS.Signals = "SIGTERM",
    timeoutMs = 3000,
  ): Promise<Array<{ record: WebInstanceRecord; exitCode: number | null; signal: NodeJS.Signals | null }>> {
    const stopPromises = Array.from(this.instances.keys()).map((instanceId) =>
      this.stopInstance(instanceId, signal, timeoutMs).catch((error) => {
        throw new Error(
          `Failed to stop instance ${instanceId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }),
    );
    return Promise.all(stopPromises);
  }
}

export const webProcessRegistry = new WebProcessRegistry();
