export interface OnboardingPreferenceLike {
  readonly onboardingCompleted?: unknown;
}

export const petScaleOptions = [
  { label: "XS", value: 0.55 },
  { label: "Small", value: 0.75 },
  { label: "Medium", value: 1 },
  { label: "Large", value: 1.25 },
  { label: "Huge", value: 1.5 },
] as const;
export type PetScaleValue = typeof petScaleOptions[number]["value"];
// XS by default so the pet matches the size Codex's desktop app renders the
// same spritesheet at (roughly half of 192x208).
export const defaultPetScale: PetScaleValue = 0.55;

export function normalizePetScale(value: unknown): PetScaleValue {
  return petScaleOptions.find((option) => option.value === value)?.value ?? defaultPetScale;
}

export function normalizeOnboardingCompleted(value: OnboardingPreferenceLike): boolean {
  return typeof value.onboardingCompleted === "boolean" ? value.onboardingCompleted : false;
}

export function markOnboardingCompleted<T extends { readonly preferences: Record<string, unknown> }>(state: T): T {
  return {
    ...state,
    preferences: {
      ...state.preferences,
      onboardingCompleted: true,
    },
  };
}

/**
 * Derive a stable string key for a display from its geometry.
 * Format: `"${x},${y},${width}x${height}"`.
 * Display IDs can change across reboots on some platforms, so we key on
 * physical bounds instead.
 */
export function deriveDisplayKey(bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): string {
  return `${bounds.x},${bounds.y},${bounds.width}x${bounds.height}`;
}

export function shouldShowDefaultPetForExternalEvent(_visible: boolean, _openOnLaunch: boolean, paused: boolean): boolean {
  // Agent activity is an explicit display trigger; open-on-launch only controls startup.
  return !paused;
}

export interface CodexVisibilityGateState {
  readonly codexVisible: boolean;
  readonly restoreAfterCodex: boolean;
}

export type CodexVisibilityGateEvent =
  | { readonly type: "show-request" }
  | { readonly type: "hide-request" }
  | { readonly type: "codex-presence"; readonly visible: boolean; readonly petVisible: boolean };

export const initialCodexVisibilityGateState: CodexVisibilityGateState = {
  codexVisible: false,
  restoreAfterCodex: false,
};

export function reduceCodexVisibilityGate(
  state: CodexVisibilityGateState,
  event: CodexVisibilityGateEvent,
): { readonly state: CodexVisibilityGateState; readonly action: "show" | "hide" | "none" } {
  if (event.type === "show-request") {
    if (!state.codexVisible) return { state, action: "show" };
    return { state: { ...state, restoreAfterCodex: true }, action: "none" };
  }
  if (event.type === "hide-request") {
    return { state: { ...state, restoreAfterCodex: false }, action: "hide" };
  }
  if (event.visible) {
    return {
      state: {
        codexVisible: true,
        restoreAfterCodex: state.restoreAfterCodex || event.petVisible,
      },
      action: event.petVisible ? "hide" : "none",
    };
  }
  return {
    state: initialCodexVisibilityGateState,
    action: state.codexVisible && state.restoreAfterCodex ? "show" : "none",
  };
}

/**
 * Normalize the petConfinementEnabled preference value.
 * Default is true (confinement on). Non-boolean values fall back to the default.
 */
export function normalizePetConfinementEnabled(value: unknown, defaultValue = true): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

/**
 * Normalize the petCrossDisplayEnabled preference value.
 * Default is false (cross-display roaming off). Non-boolean values fall back to the default.
 */
export function normalizePetCrossDisplayEnabled(value: unknown, defaultValue = false): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

/**
 * Normalize the petGravityEnabled preference value.
 * Default is false (gravity off). Non-boolean values fall back to the default.
 */
export function normalizePetGravityEnabled(value: unknown, defaultValue = false): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}
