import { allowedReactions, type OpenPetsReaction } from "./local-ipc-protocol.js";

export type PetMotionState = "idle" | "run-left" | "run-right";
export type UniversalSpriteState = "idle" | "running-right" | "running-left" | "waving" | "jumping" | "failed" | "waiting" | "running" | "review";
export type UserSelectableAnimationState = Exclude<UniversalSpriteState, "running-left" | "running-right">;
export type ReactionAnimationOverrides = Partial<Record<OpenPetsReaction, UserSelectableAnimationState>>;

export interface SpriteStateDefinition {
  readonly row: number;
  readonly frames: number;
  readonly durationMs: number;
  readonly iterations?: number | "infinite";
}

export interface PetSpriteLayout {
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly columns: number;
  readonly rows: number;
  readonly states: Record<UniversalSpriteState, SpriteStateDefinition>;
}

export type SpriteStatePatch = {
  row?: number;
  frames?: number;
  durationMs?: number;
  iterations?: number | "infinite";
};

export type PetSpriteLayoutOverride = {
  frameWidth?: number;
  frameHeight?: number;
  columns?: number;
  rows?: number;
  states?: Partial<Record<UniversalSpriteState, SpriteStatePatch>>;
};

export const motionToSpriteState = {
  idle: "idle",
  "run-right": "running-right",
  "run-left": "running-left",
} as const satisfies Record<PetMotionState, UniversalSpriteState>;

export const defaultReactionToSpriteState = {
  idle: "idle",
  thinking: "review",
  working: "running",
  editing: "running",
  running: "running",
  testing: "waiting",
  waiting: "waiting",
  waving: "waving",
  success: "jumping",
  error: "failed",
  celebrating: "jumping",
} as const satisfies Record<OpenPetsReaction, UserSelectableAnimationState>;

export type BuiltInPetSprite = PetSpriteLayout & { readonly fileName: string };

export const defaultPetSprite = {
  fileName: "default-pet-spritesheet.webp",
  frameWidth: 192,
  frameHeight: 208,
  columns: 8,
  rows: 9,
  states: {
    idle: { row: 0, frames: 6, durationMs: 5500, iterations: "infinite" },
    "running-right": { row: 1, frames: 8, durationMs: 1060 },
    "running-left": { row: 2, frames: 8, durationMs: 1060 },
    waving: { row: 3, frames: 4, durationMs: 700, iterations: 2 },
    jumping: { row: 4, frames: 5, durationMs: 840, iterations: 2 },
    failed: { row: 5, frames: 8, durationMs: 1220, iterations: 2 },
    waiting: { row: 6, frames: 6, durationMs: 1010 },
    running: { row: 7, frames: 6, durationMs: 820 },
    review: { row: 8, frames: 6, durationMs: 1030 },
  } satisfies Record<UniversalSpriteState, SpriteStateDefinition>,
} as const satisfies BuiltInPetSprite;

/**
 * Derive a sprite layout for a Codex v2 pet from its spritesheet dimensions.
 * Codex v2 sheets are 8 columns wide, use 192x208 frames, and may carry extra
 * rows (e.g. 16-direction look rows) beyond the 9 standard state rows.
 */
export function deriveCodexSpriteLayout(imageWidth: number, imageHeight: number): PetSpriteLayout | undefined {
  const columns = 8;
  if (imageWidth <= 0 || imageHeight <= 0 || imageWidth % columns !== 0) return undefined;
  const frameWidth = imageWidth / columns;
  const frameHeight = Math.round(frameWidth * (208 / 192));
  if (frameHeight <= 0 || imageHeight % frameHeight !== 0) return undefined;
  const rows = imageHeight / frameHeight;
  if (rows < 9 || !Number.isInteger(rows)) return undefined;
  return { frameWidth, frameHeight, columns, rows, states: defaultPetSprite.states };
}

/** Merge an optional per-pet layout override over the universal default. */
export function applySpriteLayoutOverride(base: PetSpriteLayout, override: PetSpriteLayoutOverride | undefined): PetSpriteLayout {
  if (!override) return base;
  const states: Record<UniversalSpriteState, SpriteStateDefinition> = { ...base.states };
  for (const state of Object.keys(states) as UniversalSpriteState[]) {
    const patch = override.states?.[state];
    if (patch) states[state] = { ...states[state], ...patch };
  }
  const layout: PetSpriteLayout = {
    frameWidth: override.frameWidth ?? base.frameWidth,
    frameHeight: override.frameHeight ?? base.frameHeight,
    columns: override.columns ?? base.columns,
    rows: override.rows ?? base.rows,
    states,
  };
  for (const [state, definition] of Object.entries(layout.states)) {
    if (definition.row < 0 || definition.row >= layout.rows) throw new Error(`Sprite state ${state} row is outside the final layout.`);
    if (definition.frames <= 0 || definition.frames > layout.columns) throw new Error(`Sprite state ${state} frames exceed the final column count.`);
  }
  return layout;
}

export function spriteLayoutMatchesImage(layout: PetSpriteLayout, imageWidth: number, imageHeight: number): boolean {
  return Number.isInteger(imageWidth)
    && Number.isInteger(imageHeight)
    && imageWidth === layout.frameWidth * layout.columns
    && imageHeight === layout.frameHeight * layout.rows;
}

export function getSpriteAnimationDurationMs(layout: PetSpriteLayout, state: UniversalSpriteState): number | null {
  const definition = layout.states[state];
  return typeof definition.iterations === "number" ? definition.durationMs * definition.iterations : null;
}

export const selectableAnimationMetadata = [
  { id: "idle", label: "Idle", description: "Neutral/no special movement." },
  { id: "review", label: "Review", description: "Thinking, reading, reviewing." },
  { id: "running", label: "Running", description: "Active work, editing, executing." },
  { id: "waiting", label: "Waiting", description: "Waiting, blocked, testing, permission pending." },
  { id: "waving", label: "Waving", description: "Attention, greeting, notification." },
  { id: "jumping", label: "Jumping", description: "Success, celebration." },
  { id: "failed", label: "Failed", description: "Error or failure." },
] as const satisfies readonly { readonly id: UserSelectableAnimationState; readonly label: string; readonly description: string }[];

export const reactionAnimationMetadata = [
  { id: "idle", label: "Idle", description: "Explicit neutral reaction.", defaultAnimation: defaultReactionToSpriteState.idle },
  { id: "thinking", label: "Thinking", description: "Agent is reasoning or reviewing.", defaultAnimation: defaultReactionToSpriteState.thinking },
  { id: "working", label: "Working", description: "Agent is doing general tool work.", defaultAnimation: defaultReactionToSpriteState.working },
  { id: "editing", label: "Editing", description: "Agent is changing files.", defaultAnimation: defaultReactionToSpriteState.editing },
  { id: "running", label: "Running", description: "Agent is running a command.", defaultAnimation: defaultReactionToSpriteState.running },
  { id: "testing", label: "Testing", description: "Agent is running checks.", defaultAnimation: defaultReactionToSpriteState.testing },
  { id: "waiting", label: "Waiting", description: "Agent is blocked or waiting for permission.", defaultAnimation: defaultReactionToSpriteState.waiting },
  { id: "waving", label: "Waving", description: "Pet is greeting or getting attention.", defaultAnimation: defaultReactionToSpriteState.waving },
  { id: "success", label: "Success", description: "Task completed successfully.", defaultAnimation: defaultReactionToSpriteState.success },
  { id: "error", label: "Error", description: "Something failed.", defaultAnimation: defaultReactionToSpriteState.error },
  { id: "celebrating", label: "Celebrating", description: "Positive manual reaction.", defaultAnimation: defaultReactionToSpriteState.celebrating },
] as const satisfies readonly { readonly id: OpenPetsReaction; readonly label: string; readonly description: string; readonly defaultAnimation: UserSelectableAnimationState }[];

const allowedReactionSet = new Set<OpenPetsReaction>(allowedReactions);
const selectableAnimationSet = new Set<UserSelectableAnimationState>(selectableAnimationMetadata.map((animation) => animation.id));

export function isUserSelectableAnimationState(value: unknown): value is UserSelectableAnimationState {
  return typeof value === "string" && selectableAnimationSet.has(value as UserSelectableAnimationState);
}

export function normalizeReactionAnimationOverrides(value: unknown): ReactionAnimationOverrides | undefined {
  if (!isRecord(value)) return undefined;
  const overrides: ReactionAnimationOverrides = {};
  for (const [reaction, animation] of Object.entries(value)) {
    if (!allowedReactionSet.has(reaction as OpenPetsReaction) || !isUserSelectableAnimationState(animation)) continue;
    if (defaultReactionToSpriteState[reaction as OpenPetsReaction] !== animation) overrides[reaction as OpenPetsReaction] = animation;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

export function validateReactionAnimationOverrides(value: unknown): ReactionAnimationOverrides | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Invalid reaction animation overrides.");
  for (const [reaction, animation] of Object.entries(value)) {
    if (!allowedReactionSet.has(reaction as OpenPetsReaction)) throw new Error("Invalid reaction animation reaction.");
    if (!isUserSelectableAnimationState(animation)) throw new Error("Invalid reaction animation state.");
  }
  return normalizeReactionAnimationOverrides(value);
}

export function resolveReactionSpriteState(reaction: OpenPetsReaction | undefined, overrides: ReactionAnimationOverrides | undefined): UserSelectableAnimationState {
  if (!reaction) return "idle";
  return overrides?.[reaction] ?? defaultReactionToSpriteState[reaction] ?? "idle";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
