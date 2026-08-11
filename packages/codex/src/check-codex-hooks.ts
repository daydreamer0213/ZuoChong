/**
 * Smoke test for the built Codex package: verifies the CLI exists, the hook
 * handler maps each Codex lifecycle event to the expected pet reaction, and a
 * full hook round-trip through a mock client produces the right pet.react call.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";

import { handleCodexHookPayload, mapCodexHookEvent, runCodexHookFromStdin } from "./hooks.js";
import { createOpenPetsHooksTomlBlock, doctorCodexHooks, installCodexHooks, tomlQuote, uninstallCodexHooks } from "./hook-config.js";

const cliPath = fileURLToPath(new URL("./cli.js", import.meta.url));
assert.ok(existsSync(cliPath), "cli.js must exist in dist");
assert.ok(statSync(cliPath).isFile(), "cli.js must be a regular file");

assert.deepEqual(mapCodexHookEvent({ hook_event_name: "UserPromptSubmit" }), { eventName: "UserPromptSubmit", reaction: "thinking" });
assert.deepEqual(mapCodexHookEvent({ event_name: "PermissionRequest" }), { eventName: "PermissionRequest", reaction: "waiting", speechCategory: "permission" });
assert.deepEqual(mapCodexHookEvent({ event: "Stop" }), { eventName: "Stop", reaction: "success" });
assert.deepEqual(mapCodexHookEvent({ hook_event_name: "SessionStart" }), { eventName: "SessionStart", reaction: "waving" });
assert.deepEqual(mapCodexHookEvent({ hook_event_name: "PreToolUse", tool_name: "Write" }), { eventName: "PreToolUse", reaction: "editing" });
assert.deepEqual(mapCodexHookEvent({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "pnpm test" } }), { eventName: "PreToolUse", reaction: "testing" });
assert.equal(mapCodexHookEvent({ hook_event_name: "SessionEnd" })?.reaction, undefined);
assert.equal(mapCodexHookEvent({}), null);

const block = createOpenPetsHooksTomlBlock("node", "C:/apps/cli.js");
assert.ok(block.includes("[[hooks.PreToolUse]]"), "block appends a PreToolUse matcher group");
assert.ok(block.includes("[[hooks.PreToolUse.hooks]]"), "block appends a PreToolUse command handler");
assert.ok(block.includes("[[hooks.Stop]]"), "block appends a Stop matcher group");
assert.ok(!block.includes("PreToolUse = ["), "block avoids single-value event keys that conflict with existing hooks");
assert.ok(!block.includes("async = true"), "block does not request unsupported asynchronous command hooks");
assert.ok(block.includes("hook --openpets-managed"), "block embeds hook command");
assert.ok(block.includes("C:/apps/cli.js"), "block embeds the configured CLI path");
assert.ok(block.includes("commandWindows = "), "block includes the Windows command field");
assert.ok(!block.includes("[[hooks.SessionEnd]]"), "block avoids no-op SessionEnd hooks");

const calls: Array<{ method: string; args: unknown[] }> = [];
const mockClient = {
  async react(reaction: unknown) { calls.push({ method: "react", args: [reaction] }); return { ok: true }; },
  async say(_message: unknown, opts?: Record<string, unknown>) { calls.push({ method: "say", args: [opts] }); return { ok: true }; },
  async acquireLease() { return undefined; },
} as never;

const checkTempDir = mkdtempSync(join(tmpdir(), "openpets-codex-check-"));
try {
  await handleCodexHookPayload(JSON.stringify({ hook_event_name: "UserPromptSubmit" }), { client: mockClient as never, now: () => 60_000, random: () => 0, throttlePath: join(checkTempDir, "throttle.json") });
  assert.equal(calls[0]?.method, "react", "hook round-trip sends pet.react");
  assert.equal(calls[0]?.args[0], "thinking", "round-trip reaction is thinking");

  const configPath = join(checkTempDir, "config.toml");
  writeFileSync(configPath, 'model = "gpt-5"\n', "utf8");
  const installed = installCodexHooks(configPath, "node", "C:/apps/cli.js");
  assert.equal(installed.status, "installed", "explicit CLI path install must report installed");
  assert.equal(doctorCodexHooks(configPath, "node", "C:/apps/cli.js").status, "installed");
  assert.equal(doctorCodexHooks(configPath).status, "needs_update", "a different expected command must report needs_update");
  assert.equal(uninstallCodexHooks(configPath).status, "not_installed");

  const oversizedStdin = new PassThrough();
  const oversizedResult = runCodexHookFromStdin(oversizedStdin as unknown as NodeJS.ReadStream);
  oversizedStdin.write("x".repeat(40 * 1024));
  oversizedStdin.write("y".repeat(40 * 1024));
  assert.equal(await oversizedResult, 0, "oversized hook input must fail closed without breaking Codex");
  assert.equal(oversizedStdin.destroyed, true, "oversized hook input must stop reading immediately");

  const invalidPath = join(checkTempDir, "invalid.toml");
  writeFileSync(invalidPath, 'model = "unterminated\n', "utf8");
  assert.equal(doctorCodexHooks(invalidPath).status, "error", "doctor must reject invalid TOML");
  assert.throws(() => installCodexHooks(invalidPath), /TOML|toml|invalid/i);
  assert.equal(readFileSync(invalidPath, "utf8"), 'model = "unterminated\n', "invalid TOML must not be rewritten");

  const stalePath = join(checkTempDir, "stale.toml");
  writeFileSync(stalePath, `${createOpenPetsHooksTomlBlock("node", "C:/old/cli.js")}\n`, "utf8");
  installCodexHooks(stalePath, "node", "C:/new/cli.js");
  const staleUpdated = readFileSync(stalePath, "utf8");
  assert.equal(staleUpdated.match(/# begin openpets-managed/g)?.length, 1, "updating hooks must replace the managed block");
  assert.ok(staleUpdated.includes("C:/new/cli.js"));

  const formattedPath = join(checkTempDir, "formatted.toml");
  const formattedUserConfig = 'model = "gpt-5"\n\n# Keep these blank lines.\n\n[features]\nexperimental = true\n';
  writeFileSync(formattedPath, formattedUserConfig, "utf8");
  installCodexHooks(formattedPath, "node", "C:/apps/cli.js");
  uninstallCodexHooks(formattedPath);
  assert.ok(readFileSync(formattedPath, "utf8").startsWith(formattedUserConfig), "uninstall must preserve unrelated user formatting");

  for (const [name, malformedMarkers] of [
    ["begin-only", "# begin openpets-managed: @open-pets/codex\n"],
    ["end-only", "# end openpets-managed: @open-pets/codex\n"],
    ["reversed", "# end openpets-managed: @open-pets/codex\n# begin openpets-managed: @open-pets/codex\n"],
    ["duplicate", `${createOpenPetsHooksTomlBlock()}\n${createOpenPetsHooksTomlBlock()}\n`],
  ] as const) {
    const malformedPath = join(checkTempDir, `${name}.toml`);
    writeFileSync(malformedPath, malformedMarkers, "utf8");
    assert.equal(doctorCodexHooks(malformedPath).status, "error", `${name} markers must be reported as a conflict`);
    assert.throws(() => installCodexHooks(malformedPath), /marker|managed/i);
    assert.throws(() => uninstallCodexHooks(malformedPath), /marker|managed/i);
    assert.equal(readFileSync(malformedPath, "utf8"), malformedMarkers, `${name} markers must not be rewritten`);
  }

  const linkedTarget = join(checkTempDir, "linked-target");
  const linkedParent = join(checkTempDir, "linked-parent");
  mkdirSync(linkedTarget);
  symlinkSync(linkedTarget, linkedParent, process.platform === "win32" ? "junction" : "dir");
  const linkedConfigPath = join(linkedParent, "config.toml");
  writeFileSync(join(linkedTarget, "config.toml"), 'model = "gpt-5"\n', "utf8");
  assert.equal(doctorCodexHooks(linkedConfigPath).status, "error", "doctor must reject a symlinked config parent");
  assert.throws(() => installCodexHooks(linkedConfigPath), /symlink/i);
} finally {
  rmSync(checkTempDir, { recursive: true, force: true });
}

console.error("check-codex-hooks.ts: all codex package checks passed.");
