import assert from "node:assert/strict";

import { validateDiscovery } from "./discovery.js";
import { parsePetInstallResult, parsePetListResult } from "./index.js";
import { OpenPetsClientError, parseIpcResponse, validateReaction } from "./protocol.js";

const baseDiscovery = {
  protocolVersion: 1,
  protocol: "openpets-ipc",
  endpoint: process.platform === "win32" ? "\\\\.\\pipe\\openpets-abc-123" : "/tmp/openpets-501/openpets-123.sock",
  token: "x".repeat(32),
  appVersion: "0.0.0",
  pid: 123,
  platform: process.platform,
};

validateDiscovery(baseDiscovery);
assertRejects(() => validateDiscovery({ ...baseDiscovery, protocol: "http" }));
assertRejects(() => validateDiscovery({ ...baseDiscovery, protocolVersion: 2 }));
assertRejects(() => validateDiscovery({ ...baseDiscovery, endpoint: "127.0.0.1:1234" }));
assertRejects(() => validateDiscovery({ ...baseDiscovery, platform: "freebsd" }));
assertRejects(() => validateReaction("bad"));
assert.equal(validateReaction("waving"), "waving");

const ok = parseIpcResponse<{ value: number }>({ id: "1", ok: true, result: { value: 1 } });
if (!ok.ok || ok.result.value !== 1) throw new Error("Failed to parse ok response.");

const err = parseIpcResponse({ id: "1", ok: false, error: { code: "invalid_token", message: "Invalid" } });
if (err.ok || err.error.code !== "invalid_token") throw new Error("Failed to parse error response.");

assertRejects(() => parseIpcResponse({ ok: true }));
assert.deepEqual(parsePetListResult({ ok: true, defaultPetId: "builtin", pets: [{ id: "fixer", displayName: "Fixer", builtIn: false, broken: false }] }), { ok: true, defaultPetId: "builtin", pets: [{ id: "fixer", displayName: "Fixer", builtIn: false, broken: false }] });
assertRejects(() => parsePetListResult({ ok: true, pets: [{ id: "fixer" }], defaultPetId: "builtin" }));
assert.deepEqual(parsePetInstallResult({ ok: true, petId: "fixer", displayName: "Fixer", installed: true }), { ok: true, petId: "fixer", displayName: "Fixer", installed: true });
assertRejects(() => parsePetInstallResult({ ok: true, petId: "fixer" }));

console.log("Client protocol validation passed.");

function assertRejects(callback: () => unknown): void {
  try {
    callback();
  } catch (error) {
    if (error instanceof OpenPetsClientError || error instanceof Error) return;
  }
  throw new Error("Expected validation to reject.");
}
