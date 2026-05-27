export const STATE_KEY = "focusBuddyState";
export const SCHEDULE_ID = "phase-end";
const MIN_DELAY_MS = 1;
const MAX_MESSAGE_LENGTH = 140;
const UNSAFE_MESSAGE_PATTERN = /```|<script|function\s+\w+|=>|\b(class|import|export|const|let|var)\b|https?:\/\/|www\.|\/[\w.-]+\/[\w./-]+|[A-Za-z]:\\|api[_-]?key|secret|token|password|passwd|BEGIN [A-Z ]+PRIVATE KEY/i;

const DEFAULTS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLongBreak: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
  focusStartMessage: "Focus time! Pick one task and protect your attention.",
  focusCompleteMessage: "Focus session complete. Nice work!",
  breakStartMessage: "Break time. Stretch, hydrate, and rest your eyes.",
  breakCompleteMessage: "Break complete. Ready for the next focus block?",
  focusStartReaction: "waving",
  focusCompleteReaction: "success",
  breakStartReaction: "waiting",
  breakCompleteReaction: "waving",
};

export function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function normalizeConfig(config = {}) {
  return {
    focusMinutes: clampNumber(config.focusMinutes, DEFAULTS.focusMinutes, 1, 180),
    shortBreakMinutes: clampNumber(config.shortBreakMinutes, DEFAULTS.shortBreakMinutes, 1, 60),
    longBreakMinutes: clampNumber(config.longBreakMinutes, DEFAULTS.longBreakMinutes, 1, 120),
    sessionsBeforeLongBreak: clampNumber(config.sessionsBeforeLongBreak, DEFAULTS.sessionsBeforeLongBreak, 1, 12),
    autoStartBreaks: config.autoStartBreaks === true,
    autoStartFocus: config.autoStartFocus === true,
    focusStartMessage: text(config.focusStartMessage, DEFAULTS.focusStartMessage),
    focusCompleteMessage: text(config.focusCompleteMessage, DEFAULTS.focusCompleteMessage),
    breakStartMessage: text(config.breakStartMessage, DEFAULTS.breakStartMessage),
    breakCompleteMessage: text(config.breakCompleteMessage, DEFAULTS.breakCompleteMessage),
    focusStartReaction: text(config.focusStartReaction, DEFAULTS.focusStartReaction),
    focusCompleteReaction: text(config.focusCompleteReaction, DEFAULTS.focusCompleteReaction),
    breakStartReaction: text(config.breakStartReaction, DEFAULTS.breakStartReaction),
    breakCompleteReaction: text(config.breakCompleteReaction, DEFAULTS.breakCompleteReaction),
  };
}

function text(value, fallback) {
  const message = typeof value === "string" && value.trim() ? value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ") : fallback;
  const capped = message.length > MAX_MESSAGE_LENGTH ? message.slice(0, MAX_MESSAGE_LENGTH).trim() : message;
  if (!capped || UNSAFE_MESSAGE_PATTERN.test(capped)) return fallback;
  return capped;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function idleState(completedSessions = 0, completedToday = 0) {
  return { phase: "idle", completedSessions, completedToday, lastActiveDate: today() };
}

export async function getState(ctx) {
  const saved = await ctx.storage.get(STATE_KEY);
  if (!saved || typeof saved !== "object") return idleState();
  const activeDate = typeof saved.lastActiveDate === "string" ? saved.lastActiveDate : today();
  const sameDay = activeDate === today();
  return {
    phase: typeof saved.phase === "string" ? saved.phase : "idle",
    previousPhase: typeof saved.previousPhase === "string" ? saved.previousPhase : undefined,
    endAt: typeof saved.endAt === "string" ? saved.endAt : undefined,
    remainingMs: Number.isFinite(Number(saved.remainingMs)) ? Number(saved.remainingMs) : undefined,
    pendingBreakPhase: ["shortBreak", "longBreak"].includes(saved.pendingBreakPhase) ? saved.pendingBreakPhase : undefined,
    completedSessions: Math.max(0, Math.round(Number(saved.completedSessions) || 0)),
    completedToday: sameDay ? Math.max(0, Math.round(Number(saved.completedToday) || 0)) : 0,
    lastCompletedAt: typeof saved.lastCompletedAt === "string" ? saved.lastCompletedAt : undefined,
    lastActiveDate: today(),
  };
}

export async function setState(ctx, state) {
  await ctx.storage.set(STATE_KEY, { ...state, lastActiveDate: today() });
  await updateStatus(ctx, state);
}

function phaseLabel(phase) {
  if (phase === "focus") return "Focus";
  if (phase === "shortBreak") return "Short break";
  if (phase === "longBreak") return "Long break";
  if (phase === "paused") return "Paused";
  return "Idle";
}

export async function updateStatus(ctx, state) {
  if (state.phase === "idle") {
    if (state.pendingBreakPhase) {
      await ctx.status.set({ text: `${phaseLabel(state.pendingBreakPhase)} ready (${state.completedToday || 0} completed today)`, tone: "success" });
      return;
    }
    await ctx.status.set({ text: `Focus Buddy idle (${state.completedToday || 0} completed today)`, tone: "info" });
    return;
  }
  if (state.phase === "paused") {
    await ctx.status.set({ text: `Paused with ${formatMs(state.remainingMs || 0)} left`, tone: "warning" });
    return;
  }
  const end = state.endAt ? new Date(state.endAt) : undefined;
  await ctx.status.set({ text: `${phaseLabel(state.phase)} until ${end && !Number.isNaN(end.getTime()) ? end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "soon"}`, tone: "success" });
}

export function formatMs(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  return `${minutes} min`;
}

export function durationForPhase(phase, config) {
  if (phase === "focus") return config.focusMinutes * 60_000;
  if (phase === "longBreak") return config.longBreakMinutes * 60_000;
  return config.shortBreakMinutes * 60_000;
}

export function nextBreakPhase(completedSessions, config) {
  return completedSessions > 0 && completedSessions % config.sessionsBeforeLongBreak === 0 ? "longBreak" : "shortBreak";
}

async function announce(ctx, message, reaction) {
  await ctx.pet.speak(message);
  await ctx.pet.react(reaction);
}

export async function schedulePhaseEnd(ctx, state) {
  await ctx.schedule.cancel(SCHEDULE_ID);
  if (!state.endAt || !["focus", "shortBreak", "longBreak"].includes(state.phase)) return;
  const delay = new Date(state.endAt).getTime() - Date.now();
  if (!Number.isFinite(delay) || delay < MIN_DELAY_MS) return;
  await ctx.schedule.once(SCHEDULE_ID, Math.max(MIN_DELAY_MS, delay), () => completePhase(ctx));
}

export async function startPhase(ctx, phase, durationMs, options = {}) {
  const previous = await getState(ctx);
  const state = { phase, endAt: new Date(Date.now() + Math.max(MIN_DELAY_MS, durationMs)).toISOString(), remainingMs: undefined, completedSessions: previous.completedSessions || 0, completedToday: previous.completedToday || 0, lastCompletedAt: previous.lastCompletedAt, lastActiveDate: today() };
  await setState(ctx, state);
  await schedulePhaseEnd(ctx, state);
  if (options.announce !== false) {
    const config = normalizeConfig(await ctx.config.get());
    if (phase === "focus") await announce(ctx, config.focusStartMessage, config.focusStartReaction);
    else await announce(ctx, config.breakStartMessage, config.breakStartReaction);
  }
}

export async function completePhase(ctx) {
  await ctx.schedule.cancel(SCHEDULE_ID);
  const config = normalizeConfig(await ctx.config.get());
  const state = await getState(ctx);
  if (state.phase === "focus") {
    const completedSessions = (state.completedSessions || 0) + 1;
    const completedToday = (state.completedToday || 0) + 1;
    const lastCompletedAt = new Date().toISOString();
    await announce(ctx, config.focusCompleteMessage, config.focusCompleteReaction);
    const breakPhase = nextBreakPhase(completedSessions, config);
    await setState(ctx, { ...idleState(completedSessions, completedToday), lastCompletedAt, phase: "idle", pendingBreakPhase: config.autoStartBreaks ? undefined : breakPhase });
    if (config.autoStartBreaks) await startPhase(ctx, breakPhase, durationForPhase(breakPhase, config), { announce: false });
    return;
  }
  if (state.phase === "shortBreak" || state.phase === "longBreak") {
    await announce(ctx, config.breakCompleteMessage, config.breakCompleteReaction);
    const completedSessions = state.completedSessions || 0;
    await setState(ctx, { ...idleState(completedSessions, state.completedToday || 0), lastCompletedAt: state.lastCompletedAt });
    if (config.autoStartFocus) await startPhase(ctx, "focus", durationForPhase("focus", config));
  }
}

export async function pause(ctx) {
  const state = await getState(ctx);
  if (!["focus", "shortBreak", "longBreak"].includes(state.phase) || !state.endAt) return;
  await ctx.schedule.cancel(SCHEDULE_ID);
  await setState(ctx, { phase: "paused", previousPhase: state.phase, remainingMs: Math.max(MIN_DELAY_MS, new Date(state.endAt).getTime() - Date.now()), completedSessions: state.completedSessions || 0, completedToday: state.completedToday || 0, lastCompletedAt: state.lastCompletedAt, lastActiveDate: today() });
}

export async function resume(ctx) {
  const state = await getState(ctx);
  if (state.phase !== "paused") return;
  const phase = ["focus", "shortBreak", "longBreak"].includes(state.previousPhase) ? state.previousPhase : "focus";
  await startPhase(ctx, phase, Math.max(MIN_DELAY_MS, state.remainingMs || MIN_DELAY_MS), { announce: false });
}

export async function stop(ctx) {
  const state = await getState(ctx);
  await ctx.schedule.cancel(SCHEDULE_ID);
  await setState(ctx, { ...idleState(state.completedSessions || 0, state.completedToday || 0), lastCompletedAt: state.lastCompletedAt });
}

export function statusSummary(state) {
  if (state.phase === "paused") return `Focus paused with ${formatMs(state.remainingMs || 0)} left.`;
  if (["focus", "shortBreak", "longBreak"].includes(state.phase)) return `${phaseLabel(state.phase)} running until ${state.endAt ? new Date(state.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "soon"}. ${state.completedToday || 0} completed today.`;
  if (state.pendingBreakPhase) return `Focus Buddy idle. ${phaseLabel(state.pendingBreakPhase)} is ready. ${state.completedToday || 0} focus sessions completed today.`;
  return `Focus Buddy idle. ${state.completedToday || 0} focus sessions completed today.`;
}

export async function reconcileStartup(ctx) {
  const state = await getState(ctx);
  if (!["focus", "shortBreak", "longBreak"].includes(state.phase) || !state.endAt || new Date(state.endAt).getTime() > Date.now()) return state;
  await ctx.schedule.cancel(SCHEDULE_ID);
  const config = normalizeConfig(await ctx.config.get());
  if (state.phase === "focus") {
    const completedSessions = (state.completedSessions || 0) + 1;
    const completedToday = (state.completedToday || 0) + 1;
    const pendingBreakPhase = nextBreakPhase(completedSessions, config);
    const next = { ...idleState(completedSessions, completedToday), lastCompletedAt: new Date().toISOString(), pendingBreakPhase };
    await setState(ctx, next);
    await announce(ctx, "Focus ended while you were away. Your next break is ready.", config.focusCompleteReaction);
    return next;
  }
  const next = { ...idleState(state.completedSessions || 0, state.completedToday || 0), lastCompletedAt: state.lastCompletedAt };
  await setState(ctx, next);
  await announce(ctx, "Break ended while you were away.", config.breakCompleteReaction);
  return next;
}

export async function startNextBreak(ctx) {
  const state = await getState(ctx);
  const phase = ["shortBreak", "longBreak"].includes(state.pendingBreakPhase) ? state.pendingBreakPhase : undefined;
  if (!phase) { await ctx.pet.speak("No pending focus break is ready."); return false; }
  const config = normalizeConfig(await ctx.config.get());
  await startPhase(ctx, phase, durationForPhase(phase, config));
  return true;
}

export async function resetCount(ctx) {
  const state = await getState(ctx);
  await setState(ctx, { ...state, completedSessions: 0, completedToday: 0, lastCompletedAt: undefined });
  await ctx.pet.speak("Focus counts reset for today.");
}

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      const state = await reconcileStartup(ctx);
      await updateStatus(ctx, state);
      await schedulePhaseEnd(ctx, state);

      await ctx.commands.register({ id: "start-focus", title: "Start focus", description: "Start a focus session." }, async () => {
        const config = normalizeConfig(await ctx.config.get());
        await startPhase(ctx, "focus", durationForPhase("focus", config));
      });
      await ctx.commands.register({ id: "start-short-break", title: "Start short break", description: "Start a short focus break." }, async () => {
        const config = normalizeConfig(await ctx.config.get());
        await startPhase(ctx, "shortBreak", durationForPhase("shortBreak", config));
      });
      await ctx.commands.register({ id: "start-long-break", title: "Start long break", description: "Start a long focus break." }, async () => {
        const config = normalizeConfig(await ctx.config.get());
        await startPhase(ctx, "longBreak", durationForPhase("longBreak", config));
      });
      await ctx.commands.register({ id: "pause-focus", title: "Pause focus", description: "Pause the current focus timer." }, () => pause(ctx));
      await ctx.commands.register({ id: "resume-focus", title: "Resume focus", description: "Resume a paused focus timer." }, () => resume(ctx));
      await ctx.commands.register({ id: "stop-focus", title: "Stop focus", description: "Stop and return to idle." }, () => stop(ctx));
      await ctx.commands.register({ id: "show-focus-status", title: "Show focus status", description: "Speak the current timer phase and daily count." }, async () => ctx.pet.speak(statusSummary(await getState(ctx))));
    },
    async stop() {}
  });
}
