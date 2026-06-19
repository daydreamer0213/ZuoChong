import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { getPersistedLanAuthPath, normalizeLanToken, resolveLanAuthConfig } from "../src/lan-auth.js";

const envToken = "env-shared-secret-123";
const envAuth = resolveLanAuthConfig(tempDir(), { OPENPETS_LAN_TOKEN: envToken }, { serverMode: true });
assert.equal(envAuth.token, envToken, "valid environment token should be used directly");
assert.equal(envAuth.source, "env");
assert.equal(envAuth.insecure, false);
assert.equal(envAuth.tokenHint, "-123");

const serverDir = tempDir();
const generatedAuth = resolveLanAuthConfig(serverDir, {}, { serverMode: true });
assert.equal(generatedAuth.source, "generated", "server mode should generate a token when none exists");
assert.equal(generatedAuth.insecure, false);
assert.ok(generatedAuth.token && generatedAuth.token.length >= 32, "generated token should be long enough for LAN auth");

const persisted = JSON.parse(readFileSync(getPersistedLanAuthPath(serverDir), "utf8")) as { token: string };
assert.equal(persisted.token, generatedAuth.token, "generated token should be written to disk");

const reusedAuth = resolveLanAuthConfig(serverDir, {}, { serverMode: true });
assert.equal(reusedAuth.source, "stored", "existing persisted token should be reused");
assert.equal(reusedAuth.token, generatedAuth.token);

const clientDir = tempDir();
const clientAuth = resolveLanAuthConfig(clientDir, {}, { serverMode: false });
assert.equal(clientAuth.token, null, "client-only mode should not generate a mismatched token");
assert.equal(clientAuth.source, "none");
assert.equal(clientAuth.insecure, false);

const insecureAuth = resolveLanAuthConfig(tempDir(), { OPENPETS_LAN_ALLOW_INSECURE: "1" }, { serverMode: true });
assert.equal(insecureAuth.token, null, "insecure mode should intentionally run without a token");
assert.equal(insecureAuth.source, "none");
assert.equal(insecureAuth.insecure, true);

assert.equal(normalizeLanToken("short"), null, "short tokens should be rejected");
assert.equal(normalizeLanToken("  long-enough-token  "), "long-enough-token", "tokens should be trimmed");

rmSync(serverDir, { recursive: true, force: true });
rmSync(clientDir, { recursive: true, force: true });

console.log("LAN auth validation passed.");

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "openpets-lan-auth-"));
}
