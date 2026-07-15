import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 17321;
const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_EVENTS = 30;

export interface ExternalPetEvent {
  type: "pet.event";
  interactionId?: string;
  state?: string;
  semanticRole?: string;
  say?: string;
  durationMs?: number;
  source?: string;
}

export interface ExternalAiBridgeStatus {
  running: boolean;
  host: string;
  port: number;
  endpoint: string;
  lastError?: string;
}

export class ExternalAiBridgeError extends Error {
  constructor(
    readonly code: "invalid-json" | "invalid-event" | "body-too-large" | "rate-limited",
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "ExternalAiBridgeError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, field: string, maximumLength: number) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "" || value.length > maximumLength) {
    throw new ExternalAiBridgeError("invalid-event", `${field} 必须是 1-${maximumLength} 个字符的字符串。`, 400);
  }
  return value.trim();
}

export function parseExternalPetEvent(value: unknown): ExternalPetEvent {
  if (!isObject(value) || value.type !== "pet.event") {
    throw new ExternalAiBridgeError("invalid-event", "type 必须是 pet.event。", 400);
  }
  const event: ExternalPetEvent = {
    type: "pet.event",
    interactionId: optionalString(value.interactionId, "interactionId", 128),
    state: optionalString(value.state, "state", 128),
    semanticRole: optionalString(value.semanticRole, "semanticRole", 128),
    say: optionalString(value.say, "say", 500),
    source: optionalString(value.source, "source", 64)
  };
  if (value.durationMs !== undefined) {
    if (!Number.isInteger(value.durationMs) || (value.durationMs as number) < 100 || (value.durationMs as number) > 600_000) {
      throw new ExternalAiBridgeError("invalid-event", "durationMs 必须是 100-600000 之间的整数。", 400);
    }
    event.durationMs = value.durationMs as number;
  }
  if (!event.interactionId && !event.state && !event.semanticRole && !event.say) {
    throw new ExternalAiBridgeError("invalid-event", "事件至少需要 interactionId、state、semanticRole 或 say。", 400);
  }
  return event;
}

async function readJsonBody(request: IncomingMessage, maximumBytes: number) {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;
    if (receivedBytes > maximumBytes) {
      throw new ExternalAiBridgeError("body-too-large", "请求体不能超过 64 KB。", 413);
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ExternalAiBridgeError("invalid-json", "请求体必须是合法 JSON。", 400);
  }
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(`${JSON.stringify(body)}\n`);
}

export function createExternalAiBridge(options: {
  port?: number;
  dispatch(event: ExternalPetEvent): void | Promise<void>;
  now?: () => number;
  maxBodyBytes?: number;
}) {
  const port = options.port ?? DEFAULT_PORT;
  const now = options.now ?? Date.now;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const acceptedEventTimes: number[] = [];
  let server: Server | undefined;
  let status: ExternalAiBridgeStatus = {
    running: false,
    host: DEFAULT_HOST,
    port,
    endpoint: `http://${DEFAULT_HOST}:${port}/api/pet/event`
  };

  function checkRateLimit() {
    const threshold = now() - RATE_LIMIT_WINDOW_MS;
    while (acceptedEventTimes[0] !== undefined && acceptedEventTimes[0] <= threshold) acceptedEventTimes.shift();
    if (acceptedEventTimes.length >= RATE_LIMIT_MAX_EVENTS) {
      throw new ExternalAiBridgeError("rate-limited", "事件发送过于频繁，请稍后重试。", 429);
    }
    acceptedEventTimes.push(now());
  }

  async function handleRequest(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", `http://${DEFAULT_HOST}`);
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true, service: "ai-pets-event-bridge" });
      return;
    }
    if (request.method !== "POST" || url.pathname !== "/api/pet/event") {
      sendJson(response, 404, { ok: false, error: "not-found", message: "接口不存在。" });
      return;
    }
    try {
      if (!(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
        throw new ExternalAiBridgeError("invalid-json", "Content-Type 必须是 application/json。", 415);
      }
      const event = parseExternalPetEvent(await readJsonBody(request, maxBodyBytes));
      checkRateLimit();
      await options.dispatch(event);
      sendJson(response, 202, { ok: true, accepted: event });
    } catch (error) {
      const bridgeError = error instanceof ExternalAiBridgeError
        ? error
        : new ExternalAiBridgeError("invalid-event", error instanceof Error ? error.message : "事件处理失败。", 500);
      sendJson(response, bridgeError.statusCode, { ok: false, error: bridgeError.code, message: bridgeError.message });
    }
  }

  async function start() {
    if (server) return status;
    const nextServer = createServer((request, response) => void handleRequest(request, response));
    try {
      await new Promise<void>((resolve, reject) => {
        nextServer.once("error", reject);
        nextServer.listen(port, DEFAULT_HOST, () => {
          nextServer.off("error", reject);
          resolve();
        });
      });
      server = nextServer;
      const address = nextServer.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      status = {
        running: true,
        host: DEFAULT_HOST,
        port: actualPort,
        endpoint: `http://${DEFAULT_HOST}:${actualPort}/api/pet/event`
      };
    } catch (error) {
      nextServer.close();
      status = { ...status, running: false, lastError: error instanceof Error ? error.message : String(error) };
    }
    return status;
  }

  async function stop() {
    const activeServer = server;
    server = undefined;
    if (activeServer) await new Promise<void>((resolve) => activeServer.close(() => resolve()));
    status = { ...status, running: false };
  }

  return { start, stop, getStatus: () => ({ ...status }) };
}
