export const MIN_INTERVAL_MINUTES = 10;
export const MAX_INTERVAL_MINUTES = 1440;
export const MAX_MESSAGE_LENGTH = 140;
export const MAX_ID_LENGTH = 64;
export const DEFAULT_REACTION = "waving";
export const DEFAULT_MESSAGE = "Time for a gentle reminder.";
export const DEFAULT_SNOOZE_MINUTES = 10;
export const VALID_REACTIONS = ["waving", "waiting", "success", "celebrating"];
const UNSAFE_MESSAGE_PATTERN = /```|<script|function\s+\w+|=>|\b(class|import|export|const|let|var)\b|https?:\/\/|www\.|\/[\w.-]+\/[\w./-]+|[A-Za-z]:\\|api[_-]?key|secret|token|password|passwd|BEGIN [A-Z ]+PRIVATE KEY/i;
export const DEFAULT_REMINDERS = [
  {
    id: "morning-focus",
    enabled: true,
    message: "Good morning! Pick one meaningful task to start with.",
    reaction: "waving",
    scheduleType: "daily",
    time: "09:00",
    days: ["1", "2", "3", "4", "5"],
    intervalMinutes: 60,
  },
  {
    id: "stretch-break",
    enabled: true,
    message: "Tiny stretch break: relax your shoulders and look away for a moment.",
    reaction: "waiting",
    scheduleType: "interval",
    time: "10:00",
    days: ["1", "2", "3", "4", "5"],
    intervalMinutes: 90,
  },
];

export function sanitizeId(value, index) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : `reminder-${index + 1}`;
  return raw.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, MAX_ID_LENGTH) || `reminder-${index + 1}`;
}

export function normalizeMessage(value) {
  const message = typeof value === "string" && value.trim() ? value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ") : DEFAULT_MESSAGE;
  const capped = message.length > MAX_MESSAGE_LENGTH ? message.slice(0, MAX_MESSAGE_LENGTH).trim() : message;
  if (!capped || UNSAFE_MESSAGE_PATTERN.test(capped)) return DEFAULT_MESSAGE;
  return capped;
}

export function normalizeTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ""));
  if (!match) return "09:00";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? `${match[1]}:${match[2]}` : "09:00";
}

export function normalizeIntervalMinutes(value) {
  const interval = Number(value);
  if (!Number.isFinite(interval)) return MIN_INTERVAL_MINUTES;
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.floor(interval)));
}

export function normalizeSnoozeMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return DEFAULT_SNOOZE_MINUTES;
  return Math.min(120, Math.max(1, Math.round(minutes)));
}

export function normalizeReminder(value, index) {
  const reminder = value && typeof value === "object" ? value : {};
  const scheduleType = reminder.scheduleType === "interval" ? "interval" : "daily";
  const days = Array.isArray(reminder.days)
    ? reminder.days.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : undefined;
  return {
    id: sanitizeId(reminder.id, index),
    enabled: reminder.enabled !== false,
    message: normalizeMessage(reminder.message),
    reaction: VALID_REACTIONS.includes(reminder.reaction) ? reminder.reaction : DEFAULT_REACTION,
    scheduleType,
    time: normalizeTime(reminder.time),
    days,
    intervalMinutes: normalizeIntervalMinutes(reminder.intervalMinutes),
  };
}

export function getConfiguredReminders(config) {
  return Array.isArray(config?.reminders) ? config.reminders : DEFAULT_REMINDERS;
}

export function getReminders(config) {
  return getConfiguredReminders(config).map(normalizeReminder).filter((reminder) => reminder.enabled);
}

export async function fireReminder(ctx, reminder) {
  await ctx.pet.speak(reminder.message);
  await ctx.pet.react(reminder.reaction);
  await ctx.storage.set("lastTriggered", { id: reminder.id, message: reminder.message, reaction: reminder.reaction, at: new Date().toISOString() });
}

export async function snoozeLast(ctx, config) {
  const last = await ctx.storage.get("lastTriggered");
  if (!last || typeof last !== "object" || !last.id) {
    await ctx.pet.speak("No reminder to snooze yet. I will remember after one fires.");
    return false;
  }
  const reminder = normalizeReminder(last, 0);
  const minutes = normalizeSnoozeMinutes(config?.snoozeMinutes);
  const safeId = `snooze-${sanitizeId(reminder.id, 0)}-${Date.now()}`.slice(0, MAX_ID_LENGTH);
  await ctx.schedule.once(safeId, minutes * 60_000, () => fireReminder(ctx, reminder));
  await ctx.storage.set("lastSnoozed", { id: reminder.id, at: new Date().toISOString(), minutes });
  await ctx.pet.speak(`Snoozed ${reminder.id} for ${minutes} minutes.`);
  return true;
}

export function statusText(reminders) {
  if (reminders.length === 0) return { text: "No reminders enabled", tone: "warning" };
  const daily = reminders.filter((reminder) => reminder.scheduleType === "daily").length;
  const interval = reminders.length - daily;
  const parts = [];
  if (daily) parts.push(`${daily} daily`);
  if (interval) parts.push(`${interval} interval`);
  const intervals = reminders.filter((r) => r.scheduleType === "interval");
  const dailies = reminders.filter((r) => r.scheduleType === "daily").sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  const next = intervals.length
    ? `Next: every ${Math.min(...intervals.map((r) => r.intervalMinutes))} min`
    : dailies[0]
      ? `Next: ${dailies[0].id} at ${dailies[0].time}`
      : "";
  return { text: `${parts.join(", ")} reminder${reminders.length === 1 ? "" : "s"} enabled${next ? ` · ${next}` : ""}`, tone: "info" };
}

export function summaryText(reminders) {
  if (reminders.length === 0) return "No enabled reminders. Add or enable one in plugin settings.";
  return reminders.map((reminder) => reminder.scheduleType === "interval" ? `${reminder.id}: every ${reminder.intervalMinutes} min` : `${reminder.id}: daily at ${reminder.time}${reminder.days?.length ? ` on days ${reminder.days.join(",")}` : ""}`).join("; ");
}

export function makeScheduleIds(reminders) {
  const seen = new Set();
  return reminders.map((reminder, index) => {
    const rawBase = `reminder-${sanitizeId(reminder.id, index)}`;
    for (let count = 0; count <= reminders.length; count += 1) {
      const suffix = count === 0 ? "" : `-${count + 1}`;
      const candidate = `${rawBase.slice(0, MAX_ID_LENGTH - suffix.length)}${suffix}`;
      if (!seen.has(candidate)) {
        seen.add(candidate);
        return candidate;
      }
    }
    const fallback = `reminder-${index + 1}`.slice(0, MAX_ID_LENGTH);
    seen.add(fallback);
    return fallback;
  });
}

export async function reschedule(ctx, config) {
  await ctx.schedule.cancelAll();
  const reminders = getReminders(config);
  const scheduleIds = makeScheduleIds(reminders);
  let failed = false;
  for (const [index, reminder] of reminders.entries()) {
    const scheduleId = scheduleIds[index];
    try {
      if (reminder.scheduleType === "interval") {
        await ctx.schedule.every(scheduleId, reminder.intervalMinutes * 60_000, () => fireReminder(ctx, reminder));
      } else {
        const spec = reminder.days && reminder.days.length > 0 ? { time: reminder.time, days: reminder.days } : { time: reminder.time };
        await ctx.schedule.daily(scheduleId, spec, () => fireReminder(ctx, reminder));
      }
    } catch (error) {
      failed = true;
      ctx.log?.warn?.("Daily reminder schedule registration failed", scheduleId, error?.message || String(error));
    }
  }
  await ctx.status.set(failed ? { text: "Reminder schedule registration failed", tone: "error" } : statusText(reminders));
}

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      let config = await ctx.config.get();
      await reschedule(ctx, config);

      await ctx.commands.register({ id: "preview-first", title: "Preview first reminder", description: "Speak and react with the first enabled reminder now." }, async () => {
        const reminders = getReminders(await ctx.config.get());
        if (reminders[0]) await fireReminder(ctx, reminders[0]);
      });

      const startupReminders = getReminders(config).slice(0, 16);
      const startupScheduleIds = makeScheduleIds(startupReminders);
      for (const [index, reminder] of startupReminders.entries()) {
        await ctx.commands.register({ id: `preview-${startupScheduleIds[index]}`, title: `Preview: ${reminder.id}`, description: `Preview reminder ${reminder.id}.` }, async () => fireReminder(ctx, reminder));
      }

      await ctx.commands.register({ id: "show-summary", title: "Reminder Summary", description: "Speak a concise summary of enabled reminders." }, async () => {
        await ctx.pet.speak(normalizeMessage(summaryText(getReminders(await ctx.config.get()))));
      });

      await ctx.commands.register({ id: "snooze-last", title: "Snooze last reminder", description: "Remind me again after the configured snooze time." }, async () => {
        await snoozeLast(ctx, await ctx.config.get());
      });

      await ctx.commands.register({ id: "reload-reminders", title: "Reload reminder schedules", description: "Refresh reminder timers from current settings." }, async () => {
        config = await ctx.config.get();
        await reschedule(ctx, config);
      });

      ctx.config.onChange(async (nextConfig) => {
        config = nextConfig;
        await reschedule(ctx, config);
      });
    },
    async stop() {}
  });
}
