/**
 * Unit tests for pet-roaming-controller.ts (Phase C).
 *
 * Verifies:
 * 1. registerRoamingPet registers the pet in the motion engine and starts physics.
 * 2. unregisterRoamingPet removes the pet from the engine.
 * 3. applyRoamingToAllPets re-applies physics to all live registered pets.
 */
import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach } from "node:test";

import {
  _setScreenForTesting,
  _setIsPetWindowDraggingForTesting,
  _sharedTickerActiveForTesting,
  _resetMotionStatesForTesting,
} from "../src/pet-motion-engine.js";
import { _setScreenForTesting as setDisplayScreen } from "../src/display.js";
import {
  registerRoamingPet,
  unregisterRoamingPet,
  applyRoamingToAllPets,
  _resetLivePetsForTesting,
} from "../src/pet-roaming-controller.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockScreen = {
  getCursorScreenPoint: () => ({ x: 0, y: 0 }),
  getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }],
  getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
};

type MockWindow = {
  getPosition(): [number, number];
  isDestroyed(): boolean;
  isVisible(): boolean;
  setPosition(x: number, y: number, animate: boolean): void;
};

function makeWindow(): MockWindow {
  let pos: [number, number] = [100, 800];
  return {
    getPosition: () => [...pos] as [number, number],
    isDestroyed: () => false,
    isVisible: () => true,
    setPosition: (x: number, y: number) => { pos = [x, y]; },
  };
}

function makeAccessor(win: MockWindow) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return () => win as any;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

before(() => {
  _setScreenForTesting(mockScreen);
  setDisplayScreen(mockScreen);
  _setIsPetWindowDraggingForTesting(() => false);
});

after(() => {
  _setScreenForTesting(null);
  setDisplayScreen(null);
  _setIsPetWindowDraggingForTesting(null);
  _resetMotionStatesForTesting();
});

beforeEach(() => {
  _resetMotionStatesForTesting();
  _resetLivePetsForTesting();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pet-roaming-controller", () => {
  it("registerRoamingPet starts the shared ticker via physics", () => {
    const win = makeWindow();
    const accessor = makeAccessor(win);

    assert.equal(_sharedTickerActiveForTesting(), false, "ticker should be inactive before registration");

    registerRoamingPet("test-pet", accessor);

    // Physics (gravity) should be active → shared ticker should have started
    assert.equal(_sharedTickerActiveForTesting(), true, "ticker should start after registerRoamingPet");
  });

  it("unregisterRoamingPet removes pet from engine and may stop ticker", () => {
    const win = makeWindow();
    const accessor = makeAccessor(win);

    registerRoamingPet("test-pet-2", accessor);
    assert.equal(_sharedTickerActiveForTesting(), true);

    unregisterRoamingPet("test-pet-2");

    // After unregistering the only pet, ticker should stop
    assert.equal(_sharedTickerActiveForTesting(), false, "ticker should stop when no active pets remain");
  });

  it("applyRoamingToAllPets re-applies physics to all live pets", () => {
    const win1 = makeWindow();
    const win2 = makeWindow();
    const accessor1 = makeAccessor(win1);
    const accessor2 = makeAccessor(win2);

    registerRoamingPet("pet-a", accessor1);
    registerRoamingPet("pet-b", accessor2);

    assert.equal(_sharedTickerActiveForTesting(), true, "ticker should run for two pets");

    // Re-apply roaming — should not throw and ticker should stay active
    applyRoamingToAllPets();

    assert.equal(_sharedTickerActiveForTesting(), true, "ticker should still run after applyRoamingToAllPets");

    unregisterRoamingPet("pet-a");
    unregisterRoamingPet("pet-b");
    assert.equal(_sharedTickerActiveForTesting(), false);
  });

  it("unregisterRoamingPet on unknown petId is a no-op", () => {
    assert.doesNotThrow(() => unregisterRoamingPet("nonexistent-pet"));
  });
});
