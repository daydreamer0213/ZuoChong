export const MAX_MESSAGE_LENGTH = 140;
export const DEFAULT_MESSAGE = "Rest your eyes for a moment.";
export const DEFAULT_SNOOZE_MINUTES = 15;
export const MAX_ID_LENGTH = 64;
export const VALID_REACTIONS = ["waving", "waiting", "success", "celebrating"];
const UNSAFE_MESSAGE_PATTERN = /```|<script|function\s+\w+|=>|\b(class|import|export|const|let|var)\b|https?:\/\/|www\.|\/[\w.-]+\/[\w./-]+|[A-Za-z]:\\|api[_-]?key|secret|token|password|passwd|BEGIN [A-Z ]+PRIVATE KEY/i;

export const DEFAULT_BREAKS = [
  { id: "eye-rest", enabled: true, message: "Rest your eyes for a moment.", reaction: "waiting", intervalMinutes: 50 },
  { id: "tiny-stretch", enabled: true, message: "Tiny stretch break.", reaction: "waving", intervalMinutes: 90 },
  { id: "water-check", enabled: false, message: "Water check.", reaction: "success", intervalMinutes: 150 },
];

export function cleanText(value, fallback = DEFAULT_MESSAGE) {
  const text = typeof value === "string" && value.trim() ? value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ") : fallback;
  const capped = text.length > MAX_MESSAGE_LENGTH ? text.slice(0, MAX_MESSAGE_LENGTH).trim() : text;
  return !capped || UNSAFE_MESSAGE_PATTERN.test(capped) ? fallback : capped;
}

export function clampMinutes(value, fallback, min = 10, max = 1440) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

export function sanitizeId(value, index = 0) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : `break-${index + 1}`;
  return raw.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, MAX_ID_LENGTH) || `break-${index + 1}`;
}

export function normalizeTime(value, fallback) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ""));
  if (!match) return fallback;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? `${match[1]}:${match[2]}` : fallback;
}

export function isQuietNow(config = {}, now = new Date()) {
  if (config.quietHoursEnabled === false) return false;
  const start = normalizeTime(config.quietStart, "22:00");
  const end = normalizeTime(config.quietEnd, "08:00");
  const current = now.getHours() * 60 + now.getMinutes();
  const s = Number(start.slice(0, 2)) * 60 + Number(start.slice(3));
  const e = Number(end.slice(0, 2)) * 60 + Number(end.slice(3));
  return s <= e ? current >= s && current < e : current >= s || current < e;
}

export function normalizeBreak(value, index) {
  const item = value && typeof value === "object" ? value : {};
  return {
    id: sanitizeId(item.id, index),
    enabled: item.enabled !== false,
    message: cleanText(item.message),
    reaction: VALID_REACTIONS.includes(item.reaction) ? item.reaction : "waiting",
    intervalMinutes: clampMinutes(item.intervalMinutes, 60, 10, 1440),
  };
}

export function getBreaks(config = {}) {
  const source = Array.isArray(config.breaks) ? config.breaks : DEFAULT_BREAKS;
  return source.map(normalizeBreak).filter((item) => item.enabled);
}

export function statusText(breaks) {
  if (!breaks.length) return { text: "No break reminders enabled", tone: "warning" };
  const next = Math.min(...breaks.map((item) => item.intervalMinutes));
  return { text: `${breaks.length} break reminder${breaks.length === 1 ? "" : "s"} enabled · next every ${next} min`, tone: "info" };
}

export function scheduleSummary(breaks) {
  if (!breaks.length) return "No break reminders enabled.";
  return breaks.map((item) => `${item.id}: every ${item.intervalMinutes} min`).join("; ");
}

export async function fireBreak(ctx, item, config = {}) {
  if (isQuietNow(config)) return false;
  await ctx.pet.speak(item.message);
  await ctx.pet.react(item.reaction);
  await ctx.storage.set("lastBreak", { id: item.id, message: item.message, reaction: item.reaction, at: new Date().toISOString() });
  return true;
}

export function makeScheduleIds(breaks) {
  const seen = new Set();
  return breaks.map((item, index) => {
    const base = `break-${sanitizeId(item.id, index)}`;
    let id = base.slice(0, MAX_ID_LENGTH);
    let count = 2;
    while (seen.has(id)) id = `${base.slice(0, MAX_ID_LENGTH - String(count).length - 1)}-${count++}`;
    seen.add(id);
    return id;
  });
}

export async function reschedule(ctx, config = {}) {
  await ctx.schedule.cancelAll();
  const breaks = getBreaks(config);
  const ids = makeScheduleIds(breaks);
  let failed = false;
  for (const [index, item] of breaks.entries()) {
    try {
      await ctx.schedule.every(ids[index], item.intervalMinutes * 60_000, () => fireBreak(ctx, item, config));
    } catch (error) {
      failed = true;
      ctx.log?.warn?.("Break Buddy schedule failed", ids[index], error?.message || String(error));
    }
  }
  await ctx.status.set(failed ? { text: "Break schedule registration failed", tone: "error" } : statusText(breaks));
}

export async function snoozeReminder(ctx, config = {}) {
  const last = await ctx.storage.get("lastBreak");
  if (!last || typeof last !== "object" || !last.id) {
    await ctx.pet.speak("No break reminder to snooze yet.");
    return false;
  }
  const item = normalizeBreak(last, 0);
  const minutes = clampMinutes(config.snoozeMinutes, DEFAULT_SNOOZE_MINUTES, 1, 120);
  await ctx.schedule.once(`snooze-${sanitizeId(item.id, 0)}-${Date.now()}`.slice(0, MAX_ID_LENGTH), minutes * 60_000, () => fireBreak(ctx, item, config));
  await ctx.pet.speak(`Snoozed ${item.id} for ${minutes} minutes.`);
  return true;
}

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      await reschedule(ctx, await ctx.config.get());
      await ctx.commands.register({ id: "take-tiny-break", title: "Take a tiny break", description: "Start a short stretch and eye-rest cue." }, async () => fireBreak(ctx, { id: "tiny-break", message: "Tiny stretch break. Relax your shoulders.", reaction: "waving", intervalMinutes: 10 }, { quietHoursEnabled: false }));
      await ctx.commands.register({ id: "snooze-reminder", title: "Snooze reminder", description: "Delay the last break reminder." }, async () => snoozeReminder(ctx, await ctx.config.get()));
      await ctx.commands.register({ id: "preview-next-break", title: "Preview next break", description: "Preview the next enabled break reminder." }, async () => { const item = getBreaks(await ctx.config.get())[0]; if (item) await fireBreak(ctx, item, { quietHoursEnabled: false }); });
      await ctx.commands.register({ id: "show-break-schedule", title: "Show break schedule", description: "Speak the current break reminder schedule." }, async () => ctx.pet.speak(cleanText(scheduleSummary(getBreaks(await ctx.config.get())), "Break schedule is quiet right now.")));
      ctx.config.onChange?.(async (next) => reschedule(ctx, next));
    },
    async stop() {}
  });
}
