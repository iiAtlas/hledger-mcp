import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { z } from "zod";
import type { ToolMetadata } from "../base-tool.js";
import { BaseTool } from "../base-tool.js";
import { HLedgerExecutor } from "../executor.js";
import { getHledgerPath } from "../hledger-path.js";
import type { CommandResult } from "../types.js";
import { CommonOptionsSchema, FilePathSchema, HLedgerError } from "../types.js";
import { webProcessRegistry } from "./web-process-registry.js";
import type {
  WebAccessLevel,
  WebReadySignal,
  WebServeMode,
  WebServerInfo,
} from "./web-types.js";

const WebInputSchema = CommonOptionsSchema.extend({
  serveMode: z
    .enum(["serve", "serve-browse", "serve-api"])
    .optional()
    .describe(
      "Server mode: serve (default, headless), serve-browse (opens browser), or serve-api (API only)",
    ),
  allow: z
    .enum(["view", "add", "edit"])
    .optional()
    .describe(
      "Set the access level for changing data: view, add (default), or edit",
    ),
  cors: z
    .string()
    .optional()
    .describe("Allow cross-origin requests from the specified origin"),
  host: z
    .string()
    .optional()
    .describe("IP address or hostname to bind the server"),
  port: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .optional()
    .describe("TCP port for the web server"),
  socket: FilePathSchema.optional().describe(
    "Use a unix socket instead of host/port (unix platforms only)",
  ),
  baseUrl: z
    .string()
    .optional()
    .describe("Override the reported base URL"),
});

type WebInput = z.infer<typeof WebInputSchema>;

interface WebToolOptions {
  readOnly?: boolean;
}

export class WebTool extends BaseTool<typeof WebInputSchema> {
  readonly metadata: ToolMetadata<typeof WebInputSchema> = {
    name: "hledger_web",
    description: "Start the hledger web interface server without blocking",
    schema: WebInputSchema,
  };

  private static readonly STARTUP_TIMEOUT_MS = 3000;
  private readonly readOnly: boolean;

  constructor(journalFilePath?: string, options: WebToolOptions = {}) {
    super(journalFilePath);
    this.readOnly = options.readOnly ?? false;
  }

  protected supportsOutputFormat(): boolean {
    return false;
  }

  protected async run(input: WebInput): Promise<CommandResult> {
    const requestedHost = input.host;
    const requestedAllow = input.allow;
    const effectiveAllow = this.resolveAccessLevel(requestedAllow);
    const allocatedPort =
      input.socket || typeof input.port === "number"
        ? undefined
        : await this.findAvailablePort(requestedHost);

    const effectivePort = input.port ?? allocatedPort;
    const args = this.buildArgs(input, {
      port: effectivePort,
      allow: effectiveAllow,
    });
    const { sanitizedArgs, fullCommand } = HLedgerExecutor.prepareCommand(
      "web",
      args,
    );
    const startTime = Date.now();
    const hledgerPath = getHledgerPath();

    const child = spawn(hledgerPath, ["web", ...sanitizedArgs], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    return await new Promise<CommandResult>((resolve, reject) => {
      let stdoutBuffer = "";
      let stderrBuffer = "";
      let settled = false;
      let readyReason: WebReadySignal = "timeout";

      const READY_REGEX = /Serving web UI|Application launched|Server running/i;

      const resolveSuccess = () => {
        if (settled) return;
        settled = true;
        cleanup();
        detachStreams();

        const duration = Date.now() - startTime;
        const detectedBaseUrl = this.extractBaseUrl(stdoutBuffer);
        const { host: detectedHost, port: detectedPort } =
          this.extractConnectionDetails(detectedBaseUrl);
        const resolvedHost = detectedHost ?? requestedHost;
        const resolvedPort = detectedPort ?? effectivePort;
        const resolvedBaseUrl =
          input.baseUrl ??
          detectedBaseUrl ??
          (resolvedHost && resolvedPort
            ? `http://${resolvedHost}:${resolvedPort}`
            : undefined);

        const payload: WebServerInfo = {
          status: "started",
          pid: child.pid ?? null,
          mode: this.resolveServeMode(input.serveMode),
          host: resolvedHost,
          port: resolvedPort,
          socket: input.socket,
          baseUrl: resolvedBaseUrl,
          detectedBaseUrl,
          requestedHost,
          requestedPort: input.port,
          allocatedPort,
          allow: effectiveAllow,
          requestedAllow,
          startupOutput: {
            stdout: stdoutBuffer.trim(),
            stderr: stderrBuffer.trim(),
          },
          readySignal: readyReason,
        };

        const registered = webProcessRegistry.register(
          child,
          payload,
          fullCommand,
        );
        payload.instanceId = registered.instanceId;

        resolve({
          success: true,
          stdout: JSON.stringify(payload, null, 2),
          stderr: stderrBuffer,
          exitCode: 0,
          command: fullCommand,
          duration,
        });
      };

      const rejectWithError = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        detachStreams();

        reject(
          new HLedgerError(
            error.message,
            child.exitCode ?? 1,
            stderrBuffer || error.message,
            fullCommand,
          ),
        );
      };

      const onStdout = (chunk: string) => {
        stdoutBuffer += chunk;
        if (!settled && READY_REGEX.test(stdoutBuffer)) {
          readyReason = "log";
          resolveSuccess();
        }
      };

      const onStderr = (chunk: string) => {
        stderrBuffer += chunk;
      };

      const onError = (error: Error) => {
        rejectWithError(error);
      };

      const onExit = (code: number | null) => {
        if (settled) return;
        const exitCode = code ?? 1;
        const message = stderrBuffer.trim() ||
          stdoutBuffer.trim() ||
          `hledger web exited with code ${exitCode}`;
        rejectWithError(new Error(message));
      };

      const cleanup = () => {
        clearTimeout(startupTimer);
        child.stdout.off("data", onStdout);
        child.stderr.off("data", onStderr);
        child.off("error", onError);
        child.off("exit", onExit);
      };

      const detachStreams = () => {
        child.stdout.removeAllListeners();
        child.stdout.resume();
        child.stderr.removeAllListeners();
        child.stderr.resume();
        child.unref();
      };

      const startupTimer = setTimeout(() => {
        if (settled) return;
        readyReason = "timeout";
        resolveSuccess();
      }, WebTool.STARTUP_TIMEOUT_MS);

      child.stdout.on("data", onStdout);
      child.stderr.on("data", onStderr);
      child.once("error", onError);
      child.once("exit", onExit);
    });
  }

  private buildArgs(
    input: WebInput,
    overrides: {
      port?: number;
      allow?: WebAccessLevel;
    } = {},
  ): string[] {
    const args = this.buildCommonArgs(input);

    const serveMode = this.resolveServeMode(input.serveMode);
    args.push(`--${serveMode}`);

    const effectiveAllow = overrides.allow ?? input.allow;

    if (effectiveAllow) {
      args.push("--allow", effectiveAllow);
    }

    if (input.cors) {
      args.push("--cors", input.cors);
    }

    if (input.host) {
      args.push("--host", input.host);
    }

    const { port: overridePort } = overrides;
    const effectivePort =
      typeof overridePort === "number" ? overridePort : input.port;

    if (typeof effectivePort === "number") {
      args.push("--port", effectivePort.toString());
    }

    if (input.socket) {
      args.push("--socket", input.socket);
    }

    if (input.baseUrl) {
      args.push("--base-url", input.baseUrl);
    }

    return args;
  }

  private resolveServeMode(mode: WebInput["serveMode"]): WebServeMode {
    return mode ?? "serve";
  }

  private extractBaseUrl(output: string): string | undefined {
    const match = output.match(/https?:\/\/[\w\-.:]+/i);
    return match ? match[0] : undefined;
  }

  private extractConnectionDetails(baseUrl?: string): {
    host?: string;
    port?: number;
  } {
    if (!baseUrl) return {};

    try {
      const url = new URL(baseUrl);
      const port = url.port ? Number.parseInt(url.port, 10) : undefined;
      return {
        host: url.hostname || undefined,
        port,
      };
    } catch {
      return {};
    }
  }

  private async findAvailablePort(host?: string): Promise<number> {
    return await new Promise((resolve, reject) => {
      const server = createServer();

      server.unref();

      const onError = (error: Error) => {
        server.close(() => {
          server.off("error", onError);
          reject(error);
        });
      };

      server.once("error", onError);

      server.listen({ port: 0, host }, () => {
        const address = server.address();
        if (typeof address === "object" && address?.port) {
          const port = address.port;
          server.close((closeError) => {
            server.off("error", onError);
            if (closeError) {
              reject(closeError);
            } else {
              resolve(port);
            }
          });
        } else {
          server.close(() => {
            server.off("error", onError);
            reject(new Error("Unable to determine allocated port"));
          });
        }
      });
    });
  }

  private resolveAccessLevel(requested: WebInput["allow"]): WebAccessLevel {
    if (this.readOnly) {
      return "view";
    }

    if (requested === "edit") {
      return "edit";
    }

    if (requested === "view") {
      return "view";
    }

    return "add";
  }
}
