import assert from "node:assert/strict";
import { cleanText, DEFAULT_BREAKS, getBreaks, isQuietNow, makeScheduleIds, normalizeBreak, register, reschedule, scheduleSummary, snoozeReminder, statusText } from "./index.js";

function createCtx(config = {}) {
  const store = new Map();
  const calls = { speak: [], react: [], every: [], once: [], cancelAll: 0, status: [], commands: new Map(), warnings: [] };
  return { store, calls, ctx: {
    pet: { speak: async (m) => calls.speak.push(m), react: async (r) => calls.react.push(r) },
    storage: { get: async (k) => store.get(k), set: async (k, v) => store.set(k, v) },
    schedule: { cancelAll: async () => calls.cancelAll++, every: async (id, interval, fn) => calls.every.push({ id, interval, fn }), once: async (id, delay, fn) => calls.once.push({ id, delay, fn }) },
    status: { set: async (v) => calls.status.push(v) },
    commands: { register: async (cmd, fn) => calls.commands.set(cmd.id, { cmd, fn }) },
    config: { get: async () => config, onChange: () => {} },
    log: { warn: (...args) => calls.warnings.push(args) },
  }};
}

assert.equal(getBreaks({}).length, DEFAULT_BREAKS.filter((b) => b.enabled).length);
assert.equal(cleanText("line one\nline two"), "line one line two");
assert.equal(cleanText("token leak"), "Rest your eyes for a moment.");
assert.equal(normalizeBreak({ id: "x".repeat(100), intervalMinutes: 1, reaction: "bad" }, 0).intervalMinutes, 10);
assert.equal(isQuietNow({ quietStart: "22:00", quietEnd: "08:00" }, new Date("2024-01-01T23:00:00")), true);
assert.equal(isQuietNow({ quietHoursEnabled: false }, new Date("2024-01-01T23:00:00")), false);
assert.equal(new Set(makeScheduleIds(getBreaks({ breaks: [{ id: "same" }, { id: "same" }] }))).size, 2);

{
  const h = createCtx({ breaks: [{ id: "eye", intervalMinutes: 15 }] });
  await reschedule(h.ctx, await h.ctx.config.get());
  assert.equal(h.calls.cancelAll, 1);
  assert.equal(h.calls.every[0].interval, 15 * 60_000);
  assert.ok(h.calls.status.at(-1).text.includes("break reminder"));
}

{
  const h = createCtx();
  const plugin = { register(def) { this.def = def; } };
  register(plugin);
  await plugin.def.start(h.ctx);
  for (const id of ["take-tiny-break", "snooze-reminder", "preview-next-break", "show-break-schedule"]) assert.ok(h.calls.commands.has(id), id);
  await h.calls.commands.get("take-tiny-break").fn();
  assert.ok(h.calls.speak.at(-1).includes("Tiny stretch"));
  await h.calls.commands.get("show-break-schedule").fn();
  assert.ok(h.calls.speak.at(-1).includes("eye-rest"));
}

{
  const h = createCtx({ snoozeMinutes: 999 });
  await snoozeReminder(h.ctx, await h.ctx.config.get());
  assert.equal(h.calls.once.length, 0);
  h.store.set("lastBreak", { id: "eye-rest", message: "Rest your eyes for a moment.", reaction: "waiting" });
  await snoozeReminder(h.ctx, await h.ctx.config.get());
  assert.equal(h.calls.once[0].delay, 120 * 60_000);
}

assert.deepEqual(statusText([]), { text: "No break reminders enabled", tone: "warning" });
assert.ok(scheduleSummary(getBreaks({})).includes("eye-rest"));
console.log("Break Buddy plugin tests passed.");
