export type WebServeMode = "serve" | "serve-browse" | "serve-api";

export type WebAccessLevel = "view" | "add" | "edit";

export type WebReadySignal = "log" | "timeout";

export interface WebServerStartupOutput {
  stdout: string;
  stderr: string;
}

export interface WebServerInfo {
  status: "started";
  pid: number | null;
  mode: WebServeMode;
  host?: string;
  port?: number;
  socket?: string;
  baseUrl?: string;
  detectedBaseUrl?: string;
  requestedHost?: string;
  requestedPort?: number;
  allocatedPort?: number;
  allow: WebAccessLevel;
  requestedAllow?: WebAccessLevel;
  startupOutput: WebServerStartupOutput;
  readySignal: WebReadySignal;
  instanceId?: string;
}

export interface WebInstanceRecord extends WebServerInfo {
  instanceId: string;
  command: string;
  startedAt: string;
}
