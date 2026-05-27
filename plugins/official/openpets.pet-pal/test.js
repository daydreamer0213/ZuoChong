import assert from "node:assert/strict";
import { ACTIONS, pick, register, runAction, safeText } from "./index.js";

assert.equal(safeText("hello\nthere"), "hello there");
assert.equal(safeText("token leak"), "Hello.");
assert.equal(pick(["a", "b"], () => 0.9), "b");

const calls = { speak: [], react: [], status: [], commands: new Map() };
const ctx = { pet: { speak: async (m) => calls.speak.push(m), react: async (r) => calls.react.push(r) }, status: { set: async (v) => calls.status.push(v) }, commands: { register: async (cmd, fn) => calls.commands.set(cmd.id, { cmd, fn }) } };
await runAction(ctx, "cheer", () => 0);
assert.equal(calls.speak[0], ACTIONS.cheer[0].message);

const plugin = { register(def) { this.def = def; } };
register(plugin);
await plugin.def.start(ctx);
for (const id of ["say-hello", "keep-me-company", "cheer-me-up", "do-a-trick", "celebrate", "calm-down", "random-mood"]) assert.ok(calls.commands.has(id), id);
await calls.commands.get("celebrate").fn();
assert.ok(calls.speak.at(-1).includes("celebration") || calls.speak.at(-1).includes("wiggle"));
console.log("Pet Pal plugin tests passed.");
