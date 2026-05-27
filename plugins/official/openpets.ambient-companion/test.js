import assert from "node:assert/strict";
import { FREQUENCY_MINUTES, greetingFor, isQuietNow, normalizeConfig, pickMessage, register, reschedule, safeText, speakCozy } from "./index.js";

assert.equal(safeText("hello\nthere"), "hello there");
assert.equal(safeText("https://example.test"), "Still here.");
assert.equal(normalizeConfig({ frequency: "wild", quietStart: "bad" }).frequency, "low");
assert.equal(isQuietNow(normalizeConfig({}), new Date("2024-01-01T23:00:00")), true);
assert.equal(greetingFor(new Date("2024-01-01T09:00:00")), "Good morning.");
assert.equal(pickMessage(() => 0), "Still here.");

function createCtx(config = {}) {
  const calls = { speak: [], react: [], set: [], every: [], cancelAll: 0 };
  return { calls, ctx: {
    pet: { speak: async (m) => calls.speak.push(m), react: async (r) => calls.react.push(r) },
    storage: { set: async (...v) => calls.set.push(v), get: async () => undefined },
    schedule: { cancelAll: async () => calls.cancelAll++, every: async (id, interval, fn) => calls.every.push({ id, interval, fn }) },
    status: { set: async (v) => calls.set.push(v) },
    config: { get: async () => config, onChange: () => {} },
  }};
}

{
  const h = createCtx({ frequency: "normal" });
  await reschedule(h.ctx, normalizeConfig(await h.ctx.config.get()));
  assert.equal(h.calls.every[0].interval, FREQUENCY_MINUTES.normal * 60_000);
}

{
  const h = createCtx();
  await speakCozy(h.ctx, { ...normalizeConfig(), quietHoursEnabled: false }, "Nice and quiet.");
  assert.equal(h.calls.speak[0], "Nice and quiet.");
}

{
  const h = createCtx({ greetingsEnabled: false });
  const plugin = { register(def) { this.def = def; } };
  register(plugin);
  await plugin.def.start(h.ctx);
  assert.equal(h.calls.every.length, 1);
  assert.equal(h.calls.speak.length, 0);
}

console.log("Ambient Companion plugin tests passed.");
