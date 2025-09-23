import { z } from "zod";
import type { ToolMetadata } from "../base-tool.js";
import { BaseTool } from "../base-tool.js";
import type { CommandResult } from "../types.js";
import { webProcessRegistry } from "./web-process-registry.js";
import type { WebInstanceRecord } from "./web-types.js";

const SIGNALS = ["SIGTERM", "SIGINT", "SIGKILL", "SIGQUIT"] as const;

const WebStopInputSchema = z
  .object({
    instanceId: z
      .string()
      .min(1)
      .describe("Instance identifier from hledger_web_list")
      .optional(),
    pid: z
      .number()
      .int()
      .positive()
      .describe("Process ID of the server")
      .optional(),
    port: z
      .number()
      .int()
      .min(1)
      .max(65535)
      .describe("TCP port the server is listening on")
      .optional(),
    all: z
      .boolean()
      .describe("Stop all running hledger web instances")
      .optional(),
    signal: z
      .enum(SIGNALS)
      .describe("Signal to send when stopping (default SIGTERM)")
      .optional(),
    timeoutMs: z
      .number()
      .int()
      .min(100)
      .max(60000)
      .describe("How long to wait for shutdown before timing out")
      .optional(),
  })
  .strict();

type WebStopInput = z.infer<typeof WebStopInputSchema>;

export class WebStopTool extends BaseTool<typeof WebStopInputSchema> {
  readonly metadata: ToolMetadata<typeof WebStopInputSchema> = {
    name: "hledger_web_stop",
    description: "Stop one or more hledger web server instances",
    schema: WebStopInputSchema,
  };

  protected supportsOutputFormat(): boolean {
    return false;
  }

  protected async run(input: WebStopInput): Promise<CommandResult> {
    const start = Date.now();
    const signal = input.signal ?? "SIGTERM";
    const timeoutMs = input.timeoutMs ?? 3000;

    this.validateSelectors(input);

    const results = await this.stopTargets(input, signal, timeoutMs);

    const stdout = JSON.stringify(
      {
        stopped: results.map((result) => ({
          instanceId: result.record.instanceId,
          pid: result.record.pid,
          port: result.record.port,
          host: result.record.host,
          command: result.record.command,
          exitCode: result.exitCode,
          signal: result.signal,
          allow: result.record.allow,
          mode: result.record.mode,
          baseUrl: result.record.baseUrl,
          startedAt: result.record.startedAt,
        })),
      },
      null,
      2,
    );

    return {
      success: true,
      stdout,
      stderr: "",
      exitCode: 0,
      command: `stop-hledger-web-instance${results.length > 1 ? "s" : ""}`,
      duration: Date.now() - start,
    };
  }

  private async stopTargets(
    input: WebStopInput,
    signal: (typeof SIGNALS)[number],
    timeoutMs: number,
  ): Promise<
    Array<{
      record: WebInstanceRecord;
      exitCode: number | null;
      signal: NodeJS.Signals | null;
    }>
  > {
    if (input.all) {
      const running = webProcessRegistry.list();
      if (running.length === 0) {
        throw new Error("No running hledger web instances to stop");
      }

      const stopped = [] as Array<{
        record: WebInstanceRecord;
        exitCode: number | null;
        signal: NodeJS.Signals | null;
      }>;
      const errors: string[] = [];

      for (const instance of running) {
        try {
          const result = await webProcessRegistry.stopInstance(
            instance.instanceId,
            signal,
            timeoutMs,
          );
          stopped.push(result);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          errors.push(`${instance.instanceId}: ${message}`);
        }
      }

      if (errors.length > 0) {
        throw new Error(
          `Encountered errors while stopping instances: ${errors.join(", ")}`,
        );
      }

      return stopped;
    }

    const instanceId = this.resolveInstanceId(input);
    return [
      await webProcessRegistry.stopInstance(instanceId, signal, timeoutMs),
    ];
  }

  private resolveInstanceId(input: WebStopInput): string {
    if (input.instanceId) {
      return input.instanceId;
    }

    const running = webProcessRegistry.list();

    if (input.pid !== undefined) {
      const match = running.find((instance) => instance.pid === input.pid);
      if (match) return match.instanceId;
      throw new Error(`No running hledger web instance with pid ${input.pid}`);
    }

    if (input.port !== undefined) {
      const match = running.find((instance) => instance.port === input.port);
      if (match) return match.instanceId;
      throw new Error(`No running hledger web instance on port ${input.port}`);
    }

    throw new Error("Unable to resolve target instance");
  }

  private validateSelectors(input: WebStopInput): void {
    const selectors = [
      input.instanceId ? 1 : 0,
      input.pid !== undefined ? 1 : 0,
      input.port !== undefined ? 1 : 0,
      input.all ? 1 : 0,
    ].reduce((sum, value) => sum + value, 0);

    if (selectors === 0) {
      throw new Error("Specify instanceId, pid, port, or set all=true");
    }

    if (input.all && selectors > 1) {
      throw new Error("all=true cannot be combined with other selectors");
    }

    if (!input.all && selectors > 1) {
      throw new Error("Provide only one of instanceId, pid, or port");
    }
  }
}
