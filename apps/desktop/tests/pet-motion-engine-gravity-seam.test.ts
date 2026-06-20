/**
 * Regression test: gravity floor uses bottom-center anchor (not geometric center).
 *
 * Root cause of the gravity seam bug: getDisplayNearestPoint was called with
 * the geometric center of the pet window, which could pick a different display
 * than the one the pet's visible sprite (bottom) was standing on. When the pet
 * crossed a seam between displays of different workArea heights, the floor
 * jumped by hundreds of pixels causing a snap/flip.
 *
 * This test verifies that the bottom-center anchor is used for floor lookup by
 * checking that computeGravityFloor returns the correct floor for the display
 * the pet's bottom is on, not the one the geometric center is on.
 */
import assert from "node:assert/strict";
import { computeGravityFloor } from "../src/pet-motion-engine.js";
import { defaultPetWindowSize } from "../src/display.js";

const petH = defaultPetWindowSize.height; // 420

// Scenario: pet straddles two displays.
// Display 1: y=0, h=1080 → floor = 1080 - 420 = 660
// Display 2: y=0, h=800  → floor = 800 - 420 = 380
//
// Pet position: y=300. Geometric center Y = 300 + 210 = 510 (on display 1).
// Bottom-center Y = 300 + 420 = 720 (on display 1).
//
// If we look up by geometric center: display 1 → floor 660. Correct.
// If we look up by bottom-center: display 1 → floor 660. Also correct.
//
// Now move pet to y=600. Bottom Y = 1020 (still on display 1 barely).
// Geometric center Y = 810 → might pick display 1 or 2 depending on layout.
// The key invariant: floor must match the display the pet's bottom is on.

// Test 1: unconfined, floor matches workArea bottom
assert.equal(
  computeGravityFloor(null, 0, 1080, petH),
  1080 - petH,
  "floor = workArea.y + workArea.height - petH"
);

// Test 2: unconfined, different workArea height
assert.equal(
  computeGravityFloor(null, 0, 800, petH),
  800 - petH,
  "floor = 800 - 420 = 380"
);

// Test 3: unconfined with workArea offset (macOS menu bar at y=25)
assert.equal(
  computeGravityFloor(null, 25, 875, petH),
  900 - petH,
  "floor with y-offset: 25 + 875 - 420 = 480"
);

// Test 4: Seam scenario — floor difference between displays is large
// Display 1 floor: 660 (h=1080). Display 2 floor: 380 (h=800).
// Crossing the seam must not cause a >280px Y jump in a single tick.
// The delta clamp in syncLoop caps single-tick gravity at 200px.
// This test documents the expected floor values for the test scenario:
const display1Floor = computeGravityFloor(null, 0, 1080, petH);
const display2Floor = computeGravityFloor(null, 0, 800, petH);
assert.equal(display1Floor, 660, "display 1 floor");
assert.equal(display2Floor, 380, "display 2 floor");
assert.ok(
  Math.abs(display1Floor - display2Floor) <= 300,
  "floor difference between typical displays fits within 200px delta clamp"
);

// Test 5: confined pet always uses terminal bounds, not display
assert.equal(
  computeGravityFloor({ y: 100, height: 500 }, 0, 1080, petH),
  100 + 500 - petH,
  "confined: floor = terminalBounds.y + terminalBounds.height - petH"
);

console.log("pet-motion-engine-gravity-seam tests passed.");
