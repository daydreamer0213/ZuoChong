import assert from "node:assert/strict";

import {
  DEFAULT_REMINDERS,
  MAX_ID_LENGTH,
  MAX_MESSAGE_LENGTH,
  DEFAULT_MESSAGE,
  getReminders,
  makeScheduleIds,
  normalizeIntervalMinutes,
  normalizeReminder,
  normalizeSnoozeMinutes,
  register,
  reschedule,
  snoozeLast,
  statusText,
  summaryText,
} from "./index.js";

function createCtx(config = {}) {
  const store = new Map();
  const calls = { speak: [], react: [], storage: [], daily: [], every: [], once: [], cancelAll: 0, status: [], commands: new Map(), warnings: [] };
  const ctx = {
    pet: {
      speak: async (message) => calls.speak.push(message),
      react: async (reaction) => calls.react.push(reaction),
    },
    storage: { get: async (key) => store.get(key), set: async (key, value) => { store.set(key, value); calls.storage.push([key, value]); } },
    schedule: {
      cancelAll: async () => calls.cancelAll++,
      daily: (id, spec, fn) => calls.daily.push({ id, spec, fn }),
      every: (id, interval, fn) => calls.every.push({ id, interval, fn }),
      once: (id, delay, fn) => calls.once.push({ id, delay, fn }),
    },
    status: { set: async (value) => calls.status.push(value) },
    commands: { register: async (command, fn) => calls.commands.set(command.id, { command, fn }) },
    config: { get: async () => config, onChange: () => {} },
    log: { warn: (...args) => calls.warnings.push(args) },
  };
  return { ctx, calls };
}

assert.equal(getReminders({}).length, DEFAULT_REMINDERS.length, "missing config uses manifest-equivalent defaults");
assert.equal(getReminders({ reminders: [] }).length, 0, "explicit empty config keeps reminders disabled");

const normalized = normalizeReminder({
  id: "x".repeat(100),
  message: "m".repeat(200),
  reaction: "not-real",
  time: "99:99",
  intervalMinutes: Infinity,
}, 0);
assert.equal(normalized.id.length, MAX_ID_LENGTH);
assert.equal(normalized.message.length, MAX_MESSAGE_LENGTH);
assert.equal(normalized.reaction, "waving");
assert.equal(normalized.time, "09:00");
assert.equal(normalized.intervalMinutes, 10);
assert.equal(normalizeIntervalMinutes("bad"), 10);
assert.equal(normalizeSnoozeMinutes("bad"), 10);
assert.equal(normalizeSnoozeMinutes(0), 1);
assert.equal(normalizeSnoozeMinutes(999), 120);
assert.equal(normalizeReminder({ message: "line one\nline two" }, 0).message, "line one line two");
assert.equal(normalizeReminder({ message: "https://example.test" }, 0).message, DEFAULT_MESSAGE);
assert.equal(normalizeReminder({ message: "password reminder" }, 0).message, DEFAULT_MESSAGE);

assert.deepEqual(getReminders({ reminders: [{ id: "off", enabled: false }] }), [], "disabled reminders are skipped");

const duplicateReminders = getReminders({ reminders: [
  { id: "same", enabled: true },
  { id: "same", enabled: true },
  { id: "L".repeat(120), enabled: true },
  { id: `${"L".repeat(80)}-different`, enabled: true },
] });
const scheduleIds = makeScheduleIds(duplicateReminders);
assert.equal(new Set(scheduleIds).size, scheduleIds.length, "duplicate reminder ids produce unique schedule ids");
assert.ok(scheduleIds.every((id) => id.length <= MAX_ID_LENGTH), "schedule ids stay within max length");

{
  const { ctx, calls } = createCtx({ reminders: [
    { id: "daily", scheduleType: "daily", time: "08:30", days: ["1", "5"] },
    { id: "interval", scheduleType: "interval", intervalMinutes: 15 },
    { id: "disabled", enabled: false, scheduleType: "interval", intervalMinutes: 15 },
  ] });
  await reschedule(ctx, await ctx.config.get());
  assert.equal(calls.cancelAll, 1);
  assert.equal(calls.daily.length, 1);
  assert.deepEqual(calls.daily[0].spec, { time: "08:30", days: [1, 5] });
  assert.equal(calls.every.length, 1);
  assert.equal(calls.every[0].interval, 15 * 60_000);
  assert.ok(calls.status.at(-1).text.includes("Next: every 15 min"));
}

{
  const { ctx, calls } = createCtx({ reminders: [{ id: "bad", scheduleType: "interval", intervalMinutes: 15 }] });
  ctx.schedule.every = async () => { throw new Error("nope"); };
  await reschedule(ctx, await ctx.config.get());
  assert.equal(calls.warnings.length, 1);
  assert.equal(calls.status.at(-1).tone, "error");
}

{
  const { ctx, calls } = createCtx({ reminders: [{ id: "preview", message: "Preview me", reaction: "success" }] });
  const plugin = { register: (definition) => { plugin.definition = definition; } };
  register(plugin);
  await plugin.definition.start(ctx);
  await calls.commands.get("preview-first").fn();
  assert.deepEqual(calls.speak, ["Preview me"]);
  assert.deepEqual(calls.react, ["success"]);
  assert.equal(calls.storage[0][0], "lastTriggered");
  assert.ok(calls.commands.get("show-summary").command.title.includes("Summary"));
  assert.ok(calls.commands.get("snooze-last").command.title.includes("Snooze"));
  assert.ok(calls.commands.has("preview-reminder-preview"));
  await calls.commands.get("preview-reminder-preview").fn();
  assert.equal(calls.speak.at(-1), "Preview me");
  await calls.commands.get("snooze-last").fn();
  assert.equal(calls.once.length, 1);
  assert.equal(calls.once[0].delay, 10 * 60_000);
  await calls.commands.get("show-summary").fn();
  assert.ok(calls.speak.at(-1).includes("preview"));
}

{
  const { ctx, calls } = createCtx({ snoozeMinutes: 1200 });
  await snoozeLast(ctx, await ctx.config.get());
  assert.equal(calls.once.length, 0);
  assert.ok(calls.speak[0].includes("No reminder"));
}

assert.deepEqual(statusText([]), { text: "No reminders enabled", tone: "warning" });
assert.ok(statusText(duplicateReminders).text.includes("daily"));
assert.ok(summaryText(duplicateReminders).includes("same"));

console.log("Daily Reminders plugin tests passed.");
