import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import { LanCoordinator, normalizeLanEdge, normalizeLanHost, normalizeLanPoint, type LanState } from "./lan-state.js";

export type LanRequestHandlerOptions = {
  readonly now?: () => number;
  readonly onError?: (error: unknown) => void;
  readonly onStateChange?: (state: LanState) => void;
};

export function createLanRequestHandler(lanCoordinator: LanCoordinator, token: string | null, options: LanRequestHandlerOptions = {}): (req: IncomingMessage, res: ServerResponse) => void {
  const now = options.now ?? Date.now;
  return (req, res) => {
    void routeLanRequest(req, res, lanCoordinator, token, now, options).catch((requestError) => {
      options.onError?.(requestError);
      writeJson(res, 500, { error: "internal_error" });
    });
  };
}

async function routeLanRequest(req: IncomingMessage, res: ServerResponse, lanCoordinator: LanCoordinator, token: string | null, now: () => number, options: LanRequestHandlerOptions): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (!isAuthorized(req, token)) {
    writeJson(res, 401, { error: "unauthorized" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/status") {
    writeJson(res, 200, lanCoordinator.snapshot(now()));
    return;
  }

  if (req.method === "POST" && url.pathname === "/register") {
    const body = await readBody(req);
    const host = normalizeLanHost(body.host);
    if (!host) {
      writeJson(res, 400, { error: "missing_host" });
      return;
    }
    const state = lanCoordinator.register(host, normalizeLanPoint(body.position), now());
    writeJson(res, 200, state);
    options.onStateChange?.(state);
    return;
  }

  if (req.method === "POST" && url.pathname === "/claim") {
    const body = await readBody(req);
    const host = normalizeLanHost(body.host);
    const state = host ? lanCoordinator.claim(host, now()) : null;
    if (!state) {
      writeJson(res, 400, { error: "unknown_host" });
      return;
    }
    writeJson(res, 200, state);
    options.onStateChange?.(state);
    return;
  }

  if (req.method === "POST" && url.pathname === "/position") {
    const body = await readBody(req);
    const host = normalizeLanHost(body.host);
    if (!host) {
      writeJson(res, 400, { error: "missing_host" });
      return;
    }
    const state = lanCoordinator.updatePosition(host, normalizeLanPoint(body.position), normalizeLanEdge(body.edge), now());
    writeJson(res, 200, state);
    options.onStateChange?.(state);
    return;
  }

  writeJson(res, 404, { error: "not_found" });
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": payload.length,
    "access-control-allow-origin": "*",
  });
  res.end(payload);
}

function isAuthorized(req: IncomingMessage, token: string | null): boolean {
  if (!token) return true;
  return req.headers["x-openpets-lan-token"] === token;
}
