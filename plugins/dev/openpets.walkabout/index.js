// Walkabout (openpets.walkabout) — makes your pet roam the screen with style.
// Supports three modes: wander, follow-cursor, patrol.
/// <reference types="@open-pets/plugin-sdk" />

// ── Constants ─────────────────────────────────────────────────────────────────

export const SCHEDULE_ID = "walkabout-tick";
export const STATUS_ACTIVE = "walkabout";
export const CONFIG_KEY = "config";

/** Duration multipliers per speed setting (ms per move). */
export const SPEED_DURATION = {
  slow: 1800,
  normal: 1100,
  brisk: 600,
};

/** Wander distance per move step (px) — work-area clamped by host. */
export const WANDER_DISTANCE = 180;

/** Patrol uses fixed x-steps; y is kept from current position. */
export const PATROL_STEP_X = 300;

// ── Config helpers ─────────────────────────────────────────────────────────────

/**
 * @param {string|undefined} value
 * @returns {"wander"|"follow-cursor"|"patrol"}
 */
export function normalizeMode(value) {
  const valid = ["wander", "follow-cursor", "patrol"];
  return valid.includes(value) ? value : "wander";
}

/**
 * @param {string|undefined} value
 * @returns {"slow"|"normal"|"brisk"}
 */
export function normalizeSpeed(value) {
  const valid = ["slow", "normal", "brisk"];
  return valid.includes(value) ? value : "normal";
}

/**
 * @param {string|number|undefined} value
 * @returns {number} interval in ms
 */
export function normalizeInterval(value) {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 1 && n <= 120) return Math.floor(n) * 1000;
  return 5000;
}

/**
 * @param {unknown} raw
 * @returns {{ mode: string, speed: string, intervalMs: number, pauseWhenBusy: boolean, gravity: boolean }}
 */
export function cleanConfig(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  return {
    mode: normalizeMode(c.mode),
    speed: normalizeSpeed(c.speed),
    intervalMs: normalizeInterval(c.interval ?? 5),
    pauseWhenBusy: c.pauseWhenBusy !== false,
    gravity: c.gravity === true,
  };
}

// ── Patrol helpers ─────────────────────────────────────────────────────────────

/**
 * Computes the next patrol target given current position.
 * Alternates left and right by PATROL_STEP_X.
 *
 * @param {{ x: number, y: number }} position
 * @param {boolean} goingRight
 * @returns {{ target: { x: number, y: number }, nextDirection: boolean }}
 */
export function nextPatrolTarget(position, goingRight) {
  const dx = goingRight ? PATROL_STEP_X : -PATROL_STEP_X;
  return {
    target: { x: position.x + dx, y: position.y },
    nextDirection: !goingRight,
  };
}

// ── Mode runners ───────────────────────────────────────────────────────────────

/**
 * Starts wander mode. Returns a stop function.
 * @param {import("@open-pets/plugin-sdk").OpenPetsContext} ctx
 * @param {ReturnType<typeof cleanConfig>} cfg
 * @returns {() => void}
 */
export function startWander(ctx, cfg) {
  let active = true;
  let busy = false;

  async function step() {
    if (!active || busy) return;
    busy = true;
    try {
      await ctx.pet.wander({
        distance: WANDER_DISTANCE,
        durationMs: SPEED_DURATION[cfg.speed],
      });
    } catch (err) {
      ctx.log.warn("wander step failed", err?.message);
    } finally {
      busy = false;
    }
  }

  // Initial step after a short delay so the plugin feels alive immediately.
  const initialTimer = setTimeout(() => step(), 400);
  const intervalId = setInterval(() => step(), cfg.intervalMs);

  return function stop() {
    active = false;
    clearTimeout(initialTimer);
    clearInterval(intervalId);
  };
}

/**
 * Starts follow-cursor mode. Returns a stop function.
 * @param {import("@open-pets/plugin-sdk").OpenPetsContext} ctx
 * @param {ReturnType<typeof cleanConfig>} cfg
 * @returns {() => void}
 */
export function startFollowCursor(ctx, cfg) {
  // Lag 0 = instant (brisk), 0.85 = slow trail, 0.7 = normal.
  const lagBySpeed = { slow: 0.88, normal: 0.72, brisk: 0.45 };
  const lag = lagBySpeed[cfg.speed];

  let stopped = false;
  ctx.pet.followCursor({ enabled: true, lag }).catch((err) => {
    if (!stopped) ctx.log.warn("followCursor failed", err?.message);
  });

  return function stop() {
    stopped = true;
    ctx.pet.followCursor({ enabled: false }).catch(() => {});
  };
}

/**
 * Starts patrol mode. Returns a stop function.
 * @param {import("@open-pets/plugin-sdk").OpenPetsContext} ctx
 * @param {ReturnType<typeof cleanConfig>} cfg
 * @returns {() => void}
 */
export function startPatrol(ctx, cfg) {
  let active = true;
  let busy = false;
  let goingRight = true;

  async function step() {
    if (!active || busy) return;
    busy = true;
    try {
      const state = await ctx.pet.getState();
      const { target, nextDirection } = nextPatrolTarget(state.position, goingRight);
      goingRight = nextDirection;
      await ctx.pet.moveTo(target, { durationMs: SPEED_DURATION[cfg.speed], easing: "ease-in-out" });
    } catch (err) {
      ctx.log.warn("patrol step failed", err?.message);
    } finally {
      busy = false;
    }
  }

  const initialTimer = setTimeout(() => step(), 300);
  const intervalId = setInterval(() => step(), cfg.intervalMs);

  return function stop() {
    active = false;
    clearTimeout(initialTimer);
    clearInterval(intervalId);
  };
}

/**
 * Applies a gravity overlay on top of any mode. When gravity is enabled,
 * the pet is pulled toward the floor while it roams. Returns a stop function
 * that lifts the overlay; when the overlay is inactive the stop function is a no-op.
 * @param {import("@open-pets/plugin-sdk").OpenPetsContext} ctx
 * @param {ReturnType<typeof cleanConfig>} cfg
 * @returns {() => void}
 */
export function applyGravityOverlay(ctx, cfg) {
  if (!cfg.gravity) {
    return function stop() {};
  }

  let stopped = false;
  ctx.pet.physics({ gravity: true, bounce: 0, climbEdges: false }).catch((err) => {
    if (!stopped) ctx.log.warn("gravity overlay failed", err?.message);
  });

  return function stop() {
    stopped = true;
    ctx.pet.physics({ gravity: false, bounce: 0 }).catch(() => {});
  };
}

// ── Mode factory ───────────────────────────────────────────────────────────────

/**
 * Starts the appropriate mode and returns its stop function.
 * @param {import("@open-pets/plugin-sdk").OpenPetsContext} ctx
 * @param {ReturnType<typeof cleanConfig>} cfg
 * @returns {() => void}
 */
function startModeRunner(ctx, cfg) {
  switch (cfg.mode) {
    case "follow-cursor": return startFollowCursor(ctx, cfg);
    case "patrol":        return startPatrol(ctx, cfg);
    default:              return startWander(ctx, cfg);
  }
}

export function startMode(ctx, cfg) {
  const stopMode = startModeRunner(ctx, cfg);
  const stopGravity = applyGravityOverlay(ctx, cfg);
  return function stop() {
    stopMode();
    stopGravity();
  };
}

// ── Plugin entry ───────────────────────────────────────────────────────────────

/**
 * Plugin registration (called by the OpenPets runtime).
 * @param {import("@open-pets/plugin-sdk").OpenPetsPluginEntry} OpenPetsPlugin
 */
export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      let cfg = cleanConfig(await ctx.config.get());
      let stopCurrentMode = startMode(ctx, cfg);

      // Set a visible status so the user can see the plugin is active.
      await ctx.status.set({ text: ctx.t("status.active", { mode: cfg.mode }), tone: "info" });

      // React to config changes — tear down old mode, spin up new one.
      const unsubConfig = ctx.config.onChange(async (newRaw) => {
        const newCfg = cleanConfig(newRaw);
        stopCurrentMode();
        cfg = newCfg;
        stopCurrentMode = startMode(ctx, cfg);
        await ctx.status.set({ text: ctx.t("status.active", { mode: cfg.mode }), tone: "info" });
      });

      // Pause on agent:activity if pauseWhenBusy is enabled.
      // Per-pet busy tracking: a Set of petIds that are currently busy.
      // This ensures one busy pet doesn't pause movement for unaffected pets.
      // NOTE (Task 3 deferred): walkabout currently drives only ctx.pet (the
      // default pet). Multi-pet driving via ctx.pets.list() is a separate
      // workstream — pool/lease pets are not motion-addressable by the plugin SDK.
      /** @type {Set<string>} */
      const busyPets = new Set();

      const unsubActivity = ctx.events.on("agent:activity", async (event) => {
        if (!cfg.pauseWhenBusy) return;
        const isBusy = event?.active === true;
        const petId = event?.petId ?? "default";

        if (isBusy && !busyPets.has(petId)) {
          busyPets.add(petId);
          // Only pause movement if this is the first busy pet affecting our pet.
          if (busyPets.size === 1) {
            stopCurrentMode();
            await ctx.status.set({ text: ctx.t("status.paused"), tone: "warning" });
          }
        } else if (!isBusy && busyPets.has(petId)) {
          busyPets.delete(petId);
          // Resume movement only when no pets are busy anymore.
          if (busyPets.size === 0) {
            stopCurrentMode = startMode(ctx, cfg);
            await ctx.status.set({ text: ctx.t("status.active", { mode: cfg.mode }), tone: "info" });
          }
        }
      });

      // Return cleanup.
      return function stop() {
        stopCurrentMode();
        unsubConfig();
        unsubActivity();
        ctx.status.clear().catch(() => {});
      };
    },
  });
}
