import assert from "node:assert/strict";
import { completePhase, getState, normalizeConfig, pause, reconcileStartup, register, resetCount, resume, startPhase, statusSummary } from "./index.js";

function ctx(config = {}) {
  const store = new Map();
  const calls = { speak: [], react: [], status: [], cancel: [], once: [], commands: new Map() };
  return { calls, store, ctx: {
    config: { get: async () => config },
    storage: { get: async (k) => store.get(k), set: async (k, v) => store.set(k, v) },
    schedule: { cancel: async (id) => calls.cancel.push(id), once: async (id, ms, fn) => calls.once.push({ id, ms, fn }) },
    status: { set: async (v) => calls.status.push(v) },
    pet: { speak: async (m) => calls.speak.push(m), react: async (r) => calls.react.push(r) },
    commands: { register: async (cmd, fn) => calls.commands.set(cmd.id, { cmd, fn }) },
  }};
}

assert.equal(normalizeConfig({ focusMinutes: 999, focusStartMessage: "token leak" }).focusMinutes, 180);
assert.equal(normalizeConfig({ focusStartMessage: "token leak" }).focusStartMessage, "Focus time! Pick one task and protect your attention.");

{
  const h = ctx({ focusMinutes: 1 });
  await startPhase(h.ctx, "focus", 60_000);
  assert.equal(h.calls.once.length, 1);
  assert.equal((await getState(h.ctx)).phase, "focus");
  await completePhase(h.ctx);
  const state = await getState(h.ctx);
  assert.equal(state.completedSessions, 1);
  assert.equal(state.completedToday, 1);
  assert.equal(state.pendingBreakPhase, "shortBreak");
  assert.ok(statusSummary(state).includes("ready"));
}

{
  const h = ctx({ autoStartBreaks: true });
  await startPhase(h.ctx, "focus", 60_000, { announce: false });
  await completePhase(h.ctx);
  assert.equal(h.calls.speak.length, 1, "auto transition avoids double speech");
  assert.equal((await getState(h.ctx)).phase, "shortBreak");
}

{
  const h = ctx();
  await startPhase(h.ctx, "focus", 60_000, { announce: false });
  await pause(h.ctx);
  assert.equal((await getState(h.ctx)).phase, "paused");
  await resume(h.ctx);
  assert.equal((await getState(h.ctx)).phase, "focus");
}

{
  const h = ctx();
  const plugin = { register(def) { this.def = def; } };
  register(plugin);
  await plugin.def.start(h.ctx);
  for (const id of ["start-focus", "start-short-break", "start-long-break", "pause-focus", "resume-focus", "stop-focus", "show-focus-status"]) assert.ok(h.calls.commands.has(id), id);
  await h.calls.commands.get("show-focus-status").fn();
  assert.ok(h.calls.speak.at(-1).includes("Focus Buddy"));
  assert.ok(statusSummary(await getState(h.ctx)).includes("idle"));
  h.store.set("focusBuddyState", { phase: "idle", pendingBreakPhase: "shortBreak", completedSessions: 1, completedToday: 1, lastActiveDate: new Date().toISOString().slice(0, 10) });
  await h.calls.commands.get("start-short-break").fn();
  assert.equal((await getState(h.ctx)).phase, "shortBreak");
  await resetCount(h.ctx);
  assert.equal((await getState(h.ctx)).completedToday, 0);
}

{
  const h = ctx();
  h.store.set("focusBuddyState", { phase: "focus", endAt: new Date(Date.now() - 1000).toISOString(), completedSessions: 1, completedToday: 1, lastActiveDate: new Date().toISOString().slice(0, 10) });
  const settled = await reconcileStartup(h.ctx);
  assert.equal(settled.phase, "idle");
  assert.equal(settled.completedToday, 2);
  assert.equal(settled.pendingBreakPhase, "shortBreak");
  assert.equal(h.calls.speak.length, 1);
}

console.log("Focus Buddy plugin tests passed.");
