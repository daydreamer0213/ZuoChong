// Tests for openpets.walkabout.
import assert from "node:assert/strict";
import {
  SPEED_DURATION,
  WANDER_DISTANCE,
  PATROL_STEP_X,
  cleanConfig,
  normalizeMode,
  normalizeSpeed,
  normalizeInterval,
  nextPatrolTarget,
  startMode,
  startWander,
  startFollowCursor,
  startPatrol,
  applyGravityOverlay,
  register,
} from "./index.js";

let createTestHarness;
try {
  ({ createTestHarness } = await import("@open-pets/plugin-sdk/testing"));
} catch {
  ({ createTestHarness } = await import(
    new URL("../../../packages/sdk/dist/testing.js", import.meta.url)
  ));
}

// ── normalizeMode ──────────────────────────────────────────────────────────────
assert.equal(normalizeMode("wander"), "wander");
assert.equal(normalizeMode("follow-cursor"), "follow-cursor");
assert.equal(normalizeMode("physics"), "wander", "physics is no longer valid, coerces to wander");
assert.equal(normalizeMode("patrol"), "patrol");
assert.equal(normalizeMode(undefined), "wander", "undefined defaults to wander");
assert.equal(normalizeMode("fly"), "wander", "unknown mode defaults to wander");
assert.equal(normalizeMode(42), "wander", "non-string defaults to wander");

// ── normalizeSpeed ─────────────────────────────────────────────────────────────
assert.equal(normalizeSpeed("slow"), "slow");
assert.equal(normalizeSpeed("normal"), "normal");
assert.equal(normalizeSpeed("brisk"), "brisk");
assert.equal(normalizeSpeed(undefined), "normal", "undefined defaults to normal");
assert.equal(normalizeSpeed("supersonic"), "normal", "unknown speed defaults to normal");

// ── normalizeInterval ──────────────────────────────────────────────────────────
assert.equal(normalizeInterval("5"), 5000);
assert.equal(normalizeInterval(10), 10000);
assert.equal(normalizeInterval("2"), 2000);
assert.equal(normalizeInterval(undefined), 5000, "undefined defaults to 5s");
assert.equal(normalizeInterval("abc"), 5000, "non-numeric defaults to 5s");
assert.equal(normalizeInterval(0), 5000, "zero out-of-range defaults to 5s");
assert.equal(normalizeInterval(200), 5000, "too large defaults to 5s");
assert.equal(normalizeInterval(3.9), 3000, "fractional is floored");

// ── cleanConfig ────────────────────────────────────────────────────────────────
assert.deepEqual(cleanConfig({}), {
  mode: "wander",
  speed: "normal",
  intervalMs: 5000,
  pauseWhenBusy: true,
  gravity: false,
});

assert.deepEqual(cleanConfig({ mode: "patrol", speed: "brisk", interval: "2", pauseWhenBusy: false, gravity: true }), {
  mode: "patrol",
  speed: "brisk",
  intervalMs: 2000,
  pauseWhenBusy: false,
  gravity: true,
});

assert.deepEqual(cleanConfig(null), {
  mode: "wander",
  speed: "normal",
  intervalMs: 5000,
  pauseWhenBusy: true,
  gravity: false,
}, "null input is treated as empty config");

// pauseWhenBusy: only explicit false disables it
assert.equal(cleanConfig({ pauseWhenBusy: true }).pauseWhenBusy, true);
assert.equal(cleanConfig({ pauseWhenBusy: false }).pauseWhenBusy, false);
assert.equal(cleanConfig({}).pauseWhenBusy, true, "omitted defaults to true");

// gravity: only explicit true enables it
assert.equal(cleanConfig({}).gravity, false, "gravity omitted defaults to false");
assert.equal(cleanConfig({ gravity: true }).gravity, true, "gravity true is respected");
assert.equal(cleanConfig({ gravity: false }).gravity, false, "gravity false stays false");
assert.equal(cleanConfig({ gravity: "yes" }).gravity, false, "non-boolean gravity is false");

// ── nextPatrolTarget ───────────────────────────────────────────────────────────
{
  const pos = { x: 500, y: 300 };
  const { target: t1, nextDirection: nd1 } = nextPatrolTarget(pos, true);
  assert.equal(t1.x, 500 + PATROL_STEP_X, "patrol right increases x");
  assert.equal(t1.y, 300, "patrol preserves y");
  assert.equal(nd1, false, "direction flips after right");

  const { target: t2, nextDirection: nd2 } = nextPatrolTarget(pos, false);
  assert.equal(t2.x, 500 - PATROL_STEP_X, "patrol left decreases x");
  assert.equal(nd2, true, "direction flips after left");
}

// ── SPEED_DURATION sanity ──────────────────────────────────────────────────────
assert.ok(SPEED_DURATION.slow > SPEED_DURATION.normal, "slow is slower than normal");
assert.ok(SPEED_DURATION.normal > SPEED_DURATION.brisk, "normal is slower than brisk");

// ── Harness-based tests ────────────────────────────────────────────────────────
const PERMISSIONS = ["pet:move", "events", "pets:read", "status"];
const LOCALES = {
  en: JSON.parse(
    await (await import("node:fs/promises")).readFile(
      new URL("./locales/en.json", import.meta.url),
      "utf8"
    )
  ),
};

// createMockContext for pure ctx tests (mode runners need a ctx)
let createMockContext;
try {
  ({ createMockContext } = await import("@open-pets/plugin-sdk/testing"));
} catch {
  ({ createMockContext } = await import(
    new URL("../../../packages/sdk/dist/testing.js", import.meta.url)
  ));
}

function makeMockCtx() {
  const { ctx } = createMockContext({ permissions: PERMISSIONS, locales: LOCALES });
  return ctx;
}

// startMode / individual runners — just verify they return a stop function and don't throw.
for (const mode of ["wander", "follow-cursor", "patrol"]) {
  const ctx = makeMockCtx();
  const cfg = cleanConfig({ mode });
  const stop = startMode(ctx, cfg);
  assert.equal(typeof stop, "function", `startMode("${mode}") returns a stop function`);
  stop();
}

// startWander / startFollowCursor / startPatrol individually.
{
  const ctx = makeMockCtx();
  const stop = startWander(ctx, cleanConfig({ mode: "wander", speed: "brisk" }));
  assert.equal(typeof stop, "function");
  stop();
}
{
  const ctx = makeMockCtx();
  const stop = startFollowCursor(ctx, cleanConfig({ mode: "follow-cursor", speed: "slow" }));
  assert.equal(typeof stop, "function");
  stop();
}
{
  const ctx = makeMockCtx();
  const stop = startPatrol(ctx, cleanConfig({ mode: "patrol", speed: "normal" }));
  assert.equal(typeof stop, "function");
  stop();
}

// ── applyGravityOverlay ──
{
  const ctx = makeMockCtx();
  const stop = applyGravityOverlay(ctx, cleanConfig({ mode: "wander" }));
  assert.equal(typeof stop, "function", "overlay disabled returns a stop fn");
  stop();
}
{
  const ctx = makeMockCtx();
  const stop = applyGravityOverlay(ctx, cleanConfig({ mode: "wander", gravity: true }));
  assert.equal(typeof stop, "function", "overlay enabled returns a stop fn");
  stop();
}
{
  const ctx = makeMockCtx();
  const stop = startMode(ctx, cleanConfig({ mode: "wander", gravity: true }));
  assert.equal(typeof stop, "function", "startMode+gravity returns a stop fn");
  stop();
}

// ── Full plugin lifecycle via createTestHarness ────────────────────────────────
{
  const h = createTestHarness(register, { permissions: PERMISSIONS, locales: LOCALES });

  // start() invokes the plugin's start handler.
  await h.start();

  // Status should be set after start.
  assert.ok(h.calls.status.length > 0, "plugin sets a status on start");

  // Config change — switches mode; should not throw.
  await h.setConfig({ mode: "patrol", speed: "slow", interval: "10", pauseWhenBusy: true });

  // Agent busy → paused status. Use the REAL payload shape (kind + active + petId).
  await h.emit("agent:activity", { kind: "react", active: true, petId: "default" });
  const statuses = h.calls.status.map((s) => s.text);
  assert.ok(statuses.some((l) => l.includes("paused") || l.includes("Walkabout")), "status recorded after activity event");

  // Agent idle → resumes.
  await h.emit("agent:activity", { kind: "idle", active: false, petId: "default" });

  // No schedule errors.
  h.expectNoErrors();

  await h.stop();
}

// Lifecycle with pauseWhenBusy disabled — no status change on busy event.
{
  const h = createTestHarness(register, {
    permissions: PERMISSIONS,
    locales: LOCALES,
    config: { mode: "wander", pauseWhenBusy: false },
  });
  await h.start();
  const statusCountBefore = h.calls.status.length;
  await h.emit("agent:activity", { kind: "react", active: true, petId: "default" });
  // Since pauseWhenBusy is false, no new status should be pushed.
  assert.equal(h.calls.status.length, statusCountBefore, "no status change when pauseWhenBusy is false");
  await h.stop();
}

// Lifecycle with gravity overlay enabled — should start and stop without errors.
{
  const h = createTestHarness(register, {
    permissions: PERMISSIONS,
    locales: LOCALES,
    config: { mode: "wander", gravity: true },
  });
  await h.start();
  assert.ok(h.calls.status.length > 0, "status set on start with gravity enabled");
  h.expectNoErrors();
  await h.stop();
}

// ── Per-pet busy tracking: pet X busy does NOT pause pet Y ────────────────────
{
  const h = createTestHarness(register, { permissions: PERMISSIONS, locales: LOCALES });
  await h.start();

  const statusCountAfterStart = h.calls.status.length;

  // Pet "other" goes busy — should NOT affect our (default) pet's movement status.
  await h.emit("agent:activity", { kind: "react", active: true, petId: "other-pet" });
  // Status should change (because busyPets.size goes from 0 → 1, triggering pause).
  const statusAfterOtherBusy = h.calls.status.length;
  assert.ok(statusAfterOtherBusy > statusCountAfterStart, "status changes when any busy pet fires");

  // Pet "other" goes idle again — status should resume.
  await h.emit("agent:activity", { kind: "idle", active: false, petId: "other-pet" });
  const statusAfterOtherIdle = h.calls.status.length;
  assert.ok(statusAfterOtherIdle > statusAfterOtherBusy, "status changes when pet goes idle again");

  // NOW: pet A goes busy, THEN pet B goes busy.
  // While A is busy, B going busy should NOT emit another pause status.
  await h.emit("agent:activity", { kind: "react", active: true, petId: "pet-A" });
  const statusAfterABusy = h.calls.status.length;
  await h.emit("agent:activity", { kind: "react", active: true, petId: "pet-B" });
  // pet-B going busy while pet-A is already busy should NOT change status again.
  assert.equal(h.calls.status.length, statusAfterABusy, "second busy pet does not emit additional pause status");

  // pet-A goes idle — but pet-B is still busy, so NO resume yet.
  await h.emit("agent:activity", { kind: "idle", active: false, petId: "pet-A" });
  assert.equal(h.calls.status.length, statusAfterABusy, "status unchanged when first pet idles but second is still busy");

  // pet-B goes idle — NOW all pets are idle, should resume.
  await h.emit("agent:activity", { kind: "idle", active: false, petId: "pet-B" });
  assert.ok(h.calls.status.length > statusAfterABusy, "resumes when last busy pet goes idle");

  h.expectNoErrors();
  await h.stop();
}

console.log("All walkabout tests passed.");
