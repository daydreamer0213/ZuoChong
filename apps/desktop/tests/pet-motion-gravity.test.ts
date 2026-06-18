/**
 * Unit tests for gravity floor logic in pet-motion-engine.
 *
 * Tests the pure `computeGravityFloor` helper which is the SSOT for which
 * y-coordinate constitutes the "floor" during gravity physics.
 *
 * Bug being guarded: a confined pet must fall to the terminal bottom, not the
 * screen work-area bottom.
 */

import { mock, describe, it, expect, beforeAll } from "bun:test";

// ---------------------------------------------------------------------------
// Mock electron and its transitive deps before any source import
// ---------------------------------------------------------------------------

mock.module("electron", () => ({
  BrowserWindow: class {},
  screen: {
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
  },
  app: { getPath: () => "/tmp", isReady: () => true },
  ipcMain: { on: () => {}, handle: () => {}, removeHandler: () => {} },
}));

mock.module("../src/pet-window.js", () => ({
  isPetWindowDragging: () => false,
}));

mock.module("../src/display.js", () => ({
  clampToVisibleWorkArea: (pos: { x: number; y: number }) => pos,
  defaultPetWindowSize: { width: 100, height: 80 },
}));

mock.module("../src/confinement-manager.js", () => ({
  getEffectiveConfinementBounds: () => null,
  clampToTerminalBounds: (pos: { x: number; y: number }) => pos,
}));

// Import AFTER mocks are registered
const { computeGravityFloor } = await import("../src/pet-motion-engine.js");

const petHeight = 80;

// ---------------------------------------------------------------------------
// Confined pet: floor must be the terminal bottom, not the screen bottom
// ---------------------------------------------------------------------------

describe("computeGravityFloor — confined", () => {
  it("returns terminal bottom, not screen bottom, when confinementBounds is present", () => {
    // Terminal window sits well above the screen work-area floor.
    // screen:   y=0, height=900  → screen floor y = 900 - 80 = 820
    // terminal: y=100, height=400 → terminal floor y = 100 + 400 - 80 = 420
    const confinementBounds = { y: 100, height: 400 };
    const floor = computeGravityFloor(confinementBounds, 0, 900, petHeight);
    const expectedTerminalFloor = 100 + 400 - 80; // 420
    const screenFloor = 0 + 900 - 80; // 820

    expect(floor).toBe(expectedTerminalFloor);
    expect(floor).not.toBe(screenFloor);
  });

  it("confined at y=0: floor = terminalHeight - petHeight", () => {
    const floor = computeGravityFloor({ y: 0, height: 300 }, 0, 900, petHeight);
    expect(floor).toBe(300 - 80);
  });

  it("degenerate tall terminal: floor derived from terminal bounds even if > screen", () => {
    const floor = computeGravityFloor({ y: 50, height: 1000 }, 0, 900, petHeight);
    expect(floor).toBe(50 + 1000 - 80);
  });

  it("confined floor is always <= work-area floor when terminal bottom is above screen bottom", () => {
    const confinedFloor = computeGravityFloor({ y: 200, height: 500 }, 0, 1080, petHeight);
    const freeRoamFloor = computeGravityFloor(null, 0, 1080, petHeight);
    expect(confinedFloor).toBeLessThanOrEqual(freeRoamFloor);
  });
});

// ---------------------------------------------------------------------------
// Unconfined pet: floor must be the screen work-area bottom
// ---------------------------------------------------------------------------

describe("computeGravityFloor — unconfined", () => {
  it("returns screen work-area bottom when confinementBounds is null", () => {
    const floor = computeGravityFloor(null, 0, 900, petHeight);
    expect(floor).toBe(900 - 80);
  });

  it("accounts for non-zero workAreaY (e.g. macOS menu bar offset)", () => {
    const floor = computeGravityFloor(null, 25, 875, petHeight);
    expect(floor).toBe(25 + 875 - 80);
  });
});
