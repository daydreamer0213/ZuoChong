import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";

import { createLanRequestHandler } from "../src/lan-http-controller.js";
import { LanCoordinator, type LanState } from "../src/lan-state.js";

const token = "test-shared-secret";
let now = 1_000;
const coordinator = new LanCoordinator({ staleClientMs: 10_000 });
const changedHosts: Array<string | null> = [];
const server = createServer(createLanRequestHandler(coordinator, token, {
  now: () => now,
  onStateChange: (state) => changedHosts.push(state.currentHost),
}));
server.listen(0, "127.0.0.1");
await once(server, "listening");
const port = (server.address() as AddressInfo).port;

try {
  const unauthorizedStatus = await requestJson("GET", "/status");
  assert.equal(unauthorizedStatus.status, 401, "status should require the LAN token when configured");

  const invalidTokenRegister = await requestJson("POST", "/register", { host: "alpha", position: { x: 10, y: 20 } }, "wrong-token");
  assert.equal(invalidTokenRegister.status, 401, "register should reject an invalid LAN token");

  const alphaRegister = await requestJson<LanState>("POST", "/register", { host: "alpha", position: { x: 10, y: 20 } }, token);
  assert.equal(alphaRegister.status, 200);
  assert.equal(alphaRegister.body.currentHost, "alpha", "first registered client should own the pet");

  now += 100;
  const betaRegister = await requestJson<LanState>("POST", "/register", { host: "beta", position: { x: 400, y: 20 } }, token);
  assert.equal(betaRegister.status, 200);
  assert.equal(betaRegister.body.currentHost, "alpha", "second register should not steal current ownership");
  assert.deepEqual(betaRegister.body.clients.map((client) => client.host), ["alpha", "beta"]);

  now += 100;
  const moveAway = await requestJson<LanState>("POST", "/position", { host: "alpha", position: { x: 200, y: 20 }, edge: null }, token);
  assert.equal(moveAway.body.currentHost, "alpha", "moving away from the edge arms handoff without migrating");

  now += 100;
  const edgeHandoff = await requestJson<LanState>("POST", "/position", { host: "alpha", position: { x: 999, y: 20 }, edge: "right" }, token);
  assert.equal(edgeHandoff.body.currentHost, "beta", "right edge should migrate ownership through the HTTP controller");

  const claimAlpha = await requestJson<LanState>("POST", "/claim", { host: "alpha" }, token);
  assert.equal(claimAlpha.status, 200);
  assert.equal(claimAlpha.body.currentHost, "alpha", "claim should move ownership to a connected client");

  const missingClaim = await requestJson("POST", "/claim", { host: "missing" }, token);
  assert.equal(missingClaim.status, 400, "claim should reject unknown clients");

  const missingHostRegister = await requestJson("POST", "/register", {}, token);
  assert.equal(missingHostRegister.status, 400, "register should reject requests without a host");

  assert.deepEqual(changedHosts, ["alpha", "alpha", "alpha", "beta", "alpha"], "successful mutating requests should emit persisted owner snapshots");
} finally {
  server.close();
  await once(server, "close");
}

console.log("LAN controller HTTP validation passed.");

type JsonResponse<T = unknown> = {
  readonly status: number;
  readonly body: T;
};

function requestJson<T = unknown>(method: string, path: string, body?: unknown, requestToken?: string): Promise<JsonResponse<T>> {
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {};
    if (payload) {
      headers["content-type"] = "application/json";
      headers["content-length"] = payload.length;
    }
    if (requestToken) headers["x-openpets-lan-token"] = requestToken;

    const req = request({ method, hostname: "127.0.0.1", port, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode ?? 0, body: text ? JSON.parse(text) as T : undefined as T });
      });
    });
    req.on("error", reject);
    req.end(payload);
  });
}
