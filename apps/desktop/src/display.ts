import { createRequire } from "node:module";
import type { Rectangle } from "electron";

import { deriveDisplayKey } from "./app-state-core.js";

// `electron` is loaded lazily (via createRequire, inside getScreen()) rather
// than imported at module scope: this module is pulled into the plugin runtime
// graph and the unit-test suite, which run under plain Node where the
// `electron` shim has no named `screen` export. createRequire restores a
// working `require` in this ESM module so the lazy load succeeds at runtime.
const require = createRequire(import.meta.url);

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface WindowSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Derive a stable string key for a display from its bounds.
 * Display IDs can change across reboots on some platforms, so we key on
 * physical geometry instead: `"${x},${y},${width}x${height}"`.
 */
export function getDisplayKey(bounds: Rectangle): string {
  return deriveDisplayKey(bounds);
}

/**
 * Return the display key for the display that the centre of a window position
 * falls on (using Electron's nearest-point logic).
 */
export function getDisplayKeyForPosition(position: Point, size: WindowSize = defaultPetWindowSize): string {
  const centre = { x: position.x + size.width / 2, y: position.y + size.height / 2 };
  const display = getScreen().getDisplayNearestPoint(centre);
  return getDisplayKey(display.bounds);
}

/**
 * Return display keys for all currently connected displays, mapped to their
 * work-area rectangles so callers can choose a position on a given display.
 */
export function getAllDisplayKeys(): string[] {
  return getScreen().getAllDisplays().map((display) => getDisplayKey(display.bounds));
}

export const defaultPetWindowSize: WindowSize = {
  width: 340,
  height: 420,
};

export const defaultPetWindowMargin = 24;

/** Distance from a display work-area edge that triggers edge-snap hiding. */
export const petSnapThresholdPx = 20;

/** Size of the feather strip left visible while a pet is edge-snapped hidden. */
export const featherStripSize = { width: 28, height: 100 } as const;

export type SnapEdge = "left" | "right" | "top" | "bottom";

export function fitSpriteScaleToWindow(
  requestedScale: number,
  sprite: { readonly frameWidth: number; readonly frameHeight: number },
  size: WindowSize = defaultPetWindowSize,
  petBottom = 22,
  hitPadding = 18,
): number {
  const maxWidthScale = (size.width - hitPadding * 2) / sprite.frameWidth;
  const maxHeightScale = (size.height - Math.max(0, petBottom - hitPadding) - hitPadding * 2) / sprite.frameHeight;
  return Math.min(requestedScale, maxWidthScale, maxHeightScale);
}

/**
 * Detect whether a pet's *visible sprite* (or the drag cursor, when provided)
 * hugs a display work-area edge. The window itself is larger than the sprite
 * (transparent margins, bottom-center anchored), so distance is measured from
 * the sprite's visual edges — the part the user actually sees — not from the
 * window rectangle. `scale` accounts for the sprite's visual size at the
 * current pet scale.
 *
 * When `cursor` is given, the cursor's screen X is also considered: users drag
 * by the sprite's grab point (usually its center), so "mouse at the screen
 * edge" is how a flush drop most often actually happens. Whichever of sprite
 * edge / cursor X is closer to the edge decides.
 *
 * Only left/right edges trigger snapping; top/bottom (taskbar-adjacent edges)
 * never snap.
 */
export function detectSnapEdge(
  position: Point,
  size: WindowSize = defaultPetWindowSize,
  scale = 1,
  sprite: { readonly frameWidth: number; readonly frameHeight: number } = { frameWidth: 192, frameHeight: 208 },
  petBottom = 22,
  cursor?: Point,
): SnapEdge | null {
  const centre = { x: position.x + size.width / 2, y: position.y + size.height / 2 };
  const { workArea } = getScreen().getDisplayNearestPoint(centre);
  const spriteWidth = sprite.frameWidth * scale;
  const spriteLeft = (size.width - spriteWidth) / 2;
  const visualLeft = position.x + spriteLeft;
  const visualRight = position.x + spriteLeft + spriteWidth;
  const spriteCenterX = position.x + spriteLeft + spriteWidth / 2;
  const threshold = petSnapThresholdPx;
  // Sprite center already past an edge: the user dragged the pet most of the
  // way off-screen — an unambiguous "hide me" gesture.
  if (spriteCenterX >= workArea.x + workArea.width) return "right";
  if (spriteCenterX <= workArea.x) return "left";
  let leftGap = Math.abs(visualLeft - workArea.x);
  let rightGap = Math.abs(visualRight - (workArea.x + workArea.width));
  if (cursor) {
    leftGap = Math.min(leftGap, Math.abs(cursor.x - workArea.x));
    rightGap = Math.min(rightGap, Math.abs(cursor.x - (workArea.x + workArea.width)));
  }
  if (leftGap <= threshold || rightGap <= threshold) return leftGap <= rightGap ? "left" : "right";
  return null;
}

/**
 * Compute the hidden position for an edge-snapped pet window: the window slides
 * off the work area until only the feather strip remains visible, flush against
 * the display edge. The strip element is anchored to the corresponding window
 * edge (left:0 / right:0 / top:0 / bottom:0), so a flush window edge means a
 * flush feather strip.
 */
export function computeSnappedHiddenPosition(
  position: Point,
  edge: SnapEdge,
  size: WindowSize = defaultPetWindowSize,
  feather: { readonly width: number; readonly height: number } = featherStripSize,
): Point {
  const centre = { x: position.x + size.width / 2, y: position.y + size.height / 2 };
  const { workArea } = getScreen().getDisplayNearestPoint(centre);
  switch (edge) {
    case "right":
      return { x: Math.round(workArea.x + workArea.width - feather.width), y: position.y };
    case "left":
      return { x: Math.round(workArea.x - size.width + feather.width), y: position.y };
    case "bottom":
      return { x: position.x, y: Math.round(workArea.y + workArea.height - feather.height) };
    case "top":
      return { x: position.x, y: Math.round(workArea.y - size.height + feather.height) };
  }
}

/**
 * Minimum overlap (in pixels) along each axis for a pet to be considered
 * "on" a display.  Rejects hair-thin slivers without requiring full coverage.
 * Based on ~33% of the smallest pet dimension (420*0.33 ≈ 138).  The value
 * is intentionally modest so that deliberate cross-seam transit is allowed
 * as soon as a meaningful portion of the pet has crossed.
 */
const MIN_VISIBLE_PX = 100;

// ---------------------------------------------------------------------------
// Testability seam — allows unit tests to inject a mock screen implementation
// without requiring a running Electron process.
// Same pattern as setConfinementEnabled() in confinement-manager.ts.
// ---------------------------------------------------------------------------

/**
 * Minimal screen interface.  Typed explicitly so that unit tests can provide
 * plain objects without depending on the full Electron types package.
 */
export interface ScreenImpl {
  getAllDisplays(): DisplayInfo[];
  getPrimaryDisplay(): DisplayInfo;
  getDisplayNearestPoint(point: { x: number; y: number }): DisplayInfo;
}

export interface DisplayInfo {
  bounds: Rectangle;
  workArea: Rectangle;
}

// Lazily loaded — avoids a hard electron import at module-load time so that
// unit tests can call _setScreenForTesting() without requiring Electron.
let _screen: ScreenImpl | null = null;

function getScreen(): ScreenImpl {
  if (!_screen) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { screen } = require("electron") as { screen: ScreenImpl };
    _screen = screen;
  }
  return _screen;
}

/**
 * Replace the screen implementation used by this module.
 * ONLY call this from unit tests.  Pass `null` to restore the real electron screen.
 */
export function _setScreenForTesting(impl: ScreenImpl | null): void {
  _screen = impl;
  _cachedDisplays = null; // bust the cache when the impl changes
}

/**
 * Cached list of displays.  Invalidated by `invalidateDisplayCache()` which
 * should be called whenever a display topology event fires (added / removed /
 * metrics-changed).  Caching avoids N×getAllDisplays() calls inside the 50 ms
 * motion tick when multiple pets are active.
 */
let _cachedDisplays: DisplayInfo[] | null = null;

/** Called by display-topology event handlers to bust the cache. */
export function invalidateDisplayCache(): void {
  _cachedDisplays = null;
}

function getAllDisplaysCached(): DisplayInfo[] {
  if (!_cachedDisplays) {
    _cachedDisplays = getScreen().getAllDisplays();
  }
  return _cachedDisplays;
}

export function getDefaultPetInitialPosition(size: WindowSize = defaultPetWindowSize): Point {
  const { workArea } = getScreen().getPrimaryDisplay();

  return {
    x: Math.round(workArea.x + workArea.width - size.width - defaultPetWindowMargin),
    y: Math.round(workArea.y + workArea.height - size.height - defaultPetWindowMargin),
  };
}

/**
 * Returns true when the pet rect overlaps at least one display work area by
 * at least `minOverlap` pixels on BOTH axes.
 *
 * This is the "is the pet still visible somewhere?" test used by the permissive-
 * containment policy.  Using bottom-center as the primary anchor is accurate
 * because the visible sprite/hit-box sits at the bottom of the transparent
 * 340×420 window (petBottom ≈ 22 px from the window bottom edge).
 *
 * @param position   Top-left corner of the pet window (global virtual-desktop coords).
 * @param width      Pet window width.
 * @param height     Pet window height.
 * @param minOverlap Minimum pixel overlap on each axis (default: MIN_VISIBLE_PX).
 */
export function isOnAnyDisplay(
  position: Point,
  width: number,
  height: number,
  minOverlap: number = MIN_VISIBLE_PX,
): boolean {
  // Bottom-center anchor: the visible sprite lives at the bottom of the window.
  const anchorX = position.x + width / 2;
  const anchorY = position.y + height;

  for (const display of getAllDisplaysCached()) {
    const wa = display.workArea;
    // Does the anchor point lie inside this display's work area?
    if (
      anchorX >= wa.x &&
      anchorX <= wa.x + wa.width &&
      anchorY >= wa.y &&
      anchorY <= wa.y + wa.height
    ) {
      return true;
    }
    // Fallback: is there sufficient rect overlap on both axes?
    const overlapX = Math.min(position.x + width, wa.x + wa.width) - Math.max(position.x, wa.x);
    const overlapY = Math.min(position.y + height, wa.y + wa.height) - Math.max(position.y, wa.y);
    if (overlapX >= minOverlap && overlapY >= minOverlap) {
      return true;
    }
  }
  return false;
}

/**
 * Permissive containment clamp.
 *
 * If the pet is still visible on at least one display (anchor or overlap test),
 * the position is returned verbatim (rounded to integers).  This allows free
 * transit across shared display seams.
 *
 * If the pet has moved fully off all displays, it snaps to the work area of the
 * display nearest to its bottom-center anchor — the same logic as today but
 * triggered only when the pet is genuinely off-screen.
 *
 * Wide physical gaps between displays (where no display work area exists) act
 * as walls: the pet sticks at the last edge it reached and cannot teleport
 * across.  This is the accepted limitation; it is documented in docs/pets.md.
 */
export function clampToNearestDisplayIfOffscreen(
  position: Point,
  size: WindowSize = defaultPetWindowSize,
): Point {
  if (isOnAnyDisplay(position, size.width, size.height)) {
    // Pet is visible — leave it alone.
    return { x: Math.round(position.x), y: Math.round(position.y) };
  }

  // Pet is fully off-screen.  Snap to nearest display using bottom-center anchor.
  const anchor = {
    x: Math.round(position.x + size.width / 2),
    y: Math.round(position.y + size.height),
  };
  const { workArea } = getScreen().getDisplayNearestPoint(anchor);
  return clampIntoWorkArea(position, size, workArea);
}

/**
 * Clamps a position into a given work area rectangle.
 * Shared primitive used by both clampToVisibleWorkArea and
 * clampToNearestDisplayIfOffscreen.
 */
function clampIntoWorkArea(
  position: Point,
  size: WindowSize,
  workArea: { x: number; y: number; width: number; height: number },
): Point {
  const minX = workArea.x;
  const minY = workArea.y;
  const maxX = workArea.x + Math.max(0, workArea.width - size.width);
  const maxY = workArea.y + Math.max(0, workArea.height - size.height);

  return {
    x: clamp(Math.round(position.x), minX, maxX),
    y: clamp(Math.round(position.y), minY, maxY),
  };
}

export function clampToVisibleWorkArea(position: Point, size: WindowSize = defaultPetWindowSize): Point {
  // Clamp to the display the pet currently lives on (the one nearest its centre).
  // Note: this function is the LEGACY single-display clamp, kept for when
  // cross-display roaming is disabled via the petCrossDisplayEnabled flag.
  // When cross-display roaming is ON, call clampToNearestDisplayIfOffscreen instead.
  const centre = { x: position.x + size.width / 2, y: position.y + size.height / 2 };
  const { workArea } = getScreen().getDisplayNearestPoint(centre);
  return clampIntoWorkArea(position, size, workArea);
}

// ---------------------------------------------------------------------------
// Cross-display roaming flag — mirrors petConfinementEnabled/setConfinementEnabled
// pattern in confinement-manager.ts.  Default false (dormant/off by default;
// enabled explicitly via the petCrossDisplayEnabled preference).
// ---------------------------------------------------------------------------

let _crossDisplayRoamingEnabled = false;

/**
 * Called by windows.ts when the petCrossDisplayEnabled preference changes.
 * Same injected-setter pattern as confinement-manager.ts to avoid import cycles.
 */
export function setCrossDisplayRoamingEnabled(enabled: boolean): void {
  _crossDisplayRoamingEnabled = enabled;
}

/** Returns whether cross-display roaming is currently enabled. */
export function isCrossDisplayRoamingEnabled(): boolean {
  return _crossDisplayRoamingEnabled;
}


function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
