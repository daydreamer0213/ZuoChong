import assert from "node:assert/strict";

import { errorResponse, maxIpcMessageBytes, parseIpcRequest, validateReaction, validateSayMessage } from "../src/local-ipc-protocol.js";

const token = "test-token";
const valid = {
  id: "1",
  version: 1,
  token,
  method: "status",
  params: {},
};

parseIpcRequest(JSON.stringify(valid), token);
parseIpcRequest(JSON.stringify({ ...valid, method: "pets.list" }), token);
assert.throws(() => parseIpcRequest(JSON.stringify({ ...valid, token: "bad" }), token));
assert.throws(() => parseIpcRequest(JSON.stringify({ ...valid, version: 2 }), token));
assert.throws(() => parseIpcRequest(JSON.stringify({ ...valid, method: "pet.install" }), token));
assert.throws(() => parseIpcRequest("not json", token));

validateReaction("testing");
validateReaction("waving");
assert.throws(() => validateReaction("bad"));

validateSayMessage("Working on it");
for (const unsafe of [
  "",
  "a".repeat(141),
  "line one\nline two",
  "```code```",
  "const secret = 1",
  "https://example.com",
  "/Users/alvin/project/file.ts",
  "api_key=abc123",
]) {
  assert.throws(() => validateSayMessage(unsafe));
}

if (Buffer.byteLength(JSON.stringify({ message: "x".repeat(maxIpcMessageBytes) }), "utf8") <= maxIpcMessageBytes) {
  throw new Error("Oversized fixture was not oversized.");
}

const response = errorResponse("1", new Error("boom"));
if (response.ok || response.error?.code !== "internal_error") {
  throw new Error("Failed to create structured error response.");
}

console.log("Local IPC protocol validation passed.");
