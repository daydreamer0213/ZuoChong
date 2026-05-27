export const MAX_MESSAGE_LENGTH = 140;
const UNSAFE_MESSAGE_PATTERN = /```|<script|function\s+\w+|=>|\b(class|import|export|const|let|var)\b|https?:\/\/|www\.|\/[\w.-]+\/[\w./-]+|[A-Za-z]:\\|api[_-]?key|secret|token|password|passwd|BEGIN [A-Z ]+PRIVATE KEY/i;
export const FREQUENCY_MINUTES = { low: 240, normal: 150, lively: 90 };
export const COZY_MESSAGES = ["Still here.", "I am keeping watch.", "Nice and quiet.", "Tiny stretch?", "You have been at it a while."];

export function safeText(value, fallback = "Still here.") {
  const text = typeof value === "string" && value.trim() ? value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ") : fallback;
  const capped = text.length > MAX_MESSAGE_LENGTH ? text.slice(0, MAX_MESSAGE_LENGTH).trim() : text;
  return !capped || UNSAFE_MESSAGE_PATTERN.test(capped) ? fallback : capped;
}

export function normalizeTime(value, fallback) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ""));
  if (!match) return fallback;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? `${match[1]}:${match[2]}` : fallback;
}

export function normalizeConfig(config = {}) {
  return {
    frequency: Object.hasOwn(FREQUENCY_MINUTES, config.frequency) ? config.frequency : "low",
    quietHoursEnabled: config.quietHoursEnabled !== false,
    quietStart: normalizeTime(config.quietStart, "22:00"),
    quietEnd: normalizeTime(config.quietEnd, "08:00"),
    greetingsEnabled: config.greetingsEnabled !== false,
  };
}

export function isQuietNow(config, now = new Date()) {
  if (!config.quietHoursEnabled) return false;
  const current = now.getHours() * 60 + now.getMinutes();
  const start = Number(config.quietStart.slice(0, 2)) * 60 + Number(config.quietStart.slice(3));
  const end = Number(config.quietEnd.slice(0, 2)) * 60 + Number(config.quietEnd.slice(3));
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

export function greetingFor(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  if (hour < 22) return "Good evening.";
  return "Late session? I am keeping watch.";
}

export function pickMessage(random = Math.random) {
  return COZY_MESSAGES[Math.min(COZY_MESSAGES.length - 1, Math.floor(random() * COZY_MESSAGES.length))];
}

export async function speakCozy(ctx, config = normalizeConfig(), message = pickMessage()) {
  if (isQuietNow(config)) return false;
  await ctx.pet.speak(safeText(message));
  await ctx.pet.react("waving");
  await ctx.storage.set("lastAmbientMessageAt", new Date().toISOString());
  return true;
}

export async function reschedule(ctx, config = normalizeConfig()) {
  await ctx.schedule.cancelAll();
  const minutes = FREQUENCY_MINUTES[config.frequency] || FREQUENCY_MINUTES.low;
  await ctx.schedule.every("ambient-cozy-message", minutes * 60_000, () => speakCozy(ctx, config));
  await ctx.status.set({ text: `Ambient companion ${config.frequency}`, tone: "info" });
}

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      const config = normalizeConfig(await ctx.config.get());
      await reschedule(ctx, config);
      if (config.greetingsEnabled && !isQuietNow(config)) await speakCozy(ctx, config, greetingFor());
      ctx.config.onChange?.(async (next) => reschedule(ctx, normalizeConfig(next)));
    },
    async stop() {}
  });
}
