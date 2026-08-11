import { applySpriteLayoutOverride, defaultPetSprite, type PetSpriteLayoutOverride, type SpriteStatePatch } from "./reaction-animation-mapping.js";

export const maxCodexPetJsonBytes = 128 * 1024;
export const maxCodexSpritesheetBytes = 100 * 1024 * 1024;
export const maxCodexThumbnailSourceBytes = 24 * 1024 * 1024;
export const maxCodexPets = 100;

export interface CodexPetMetadata {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly spritesheetPath: "spritesheet.webp";
  readonly spriteLayout?: PetSpriteLayoutOverride;
}

export function validateCodexPetMetadata(value: unknown, folderName: string): CodexPetMetadata {
  if (!isSafeCodexPetId(folderName)) throw new Error("Codex pet folder name is invalid.");
  if (!isRecord(value)) throw new Error("pet.json must be an object.");
  if (value.id !== folderName || typeof value.id !== "string") throw new Error("Codex pet id must match its folder name.");
  if (!isSafeCodexPetId(value.id)) throw new Error("Codex pet id is invalid.");
  if (typeof value.displayName !== "string" || value.displayName.trim().length === 0 || value.displayName.length > 80) throw new Error("Codex pet displayName is invalid.");
  if (typeof value.description !== "string" || value.description.trim().length === 0 || value.description.length > 500) throw new Error("Codex pet description is invalid.");
  if (value.spritesheetPath !== "spritesheet.webp") throw new Error("Codex pet spritesheetPath must be spritesheet.webp.");
  const spriteLayout = validateSpriteLayoutOverride(value.spriteLayout);
  return {
    id: value.id,
    displayName: value.displayName.trim(),
    description: value.description.trim(),
    spritesheetPath: "spritesheet.webp",
    ...(spriteLayout !== undefined ? { spriteLayout } : {}),
  };
}

function validateSpriteLayoutOverride(value: unknown): PetSpriteLayoutOverride | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("Codex pet spriteLayout must be an object.");
  const result: PetSpriteLayoutOverride = {};
  for (const key of ["frameWidth", "frameHeight", "columns", "rows"] as const) {
    const field = value[key];
    if (field !== undefined) {
      if (typeof field !== "number" || !Number.isInteger(field) || field <= 0) throw new Error(`Codex pet spriteLayout.${key} is invalid.`);
      result[key] = field;
    }
  }
  if (value.states !== undefined) {
    if (!isRecord(value.states)) throw new Error("Codex pet spriteLayout.states must be an object.");
    const states: NonNullable<PetSpriteLayoutOverride["states"]> = {};
    for (const [state, patch] of Object.entries(value.states)) {
      if (!(state in defaultPetSprite.states)) throw new Error(`Codex pet spriteLayout state is unknown: ${state}`);
      if (!isRecord(patch)) throw new Error(`Codex pet spriteLayout.states.${state} must be an object.`);
      const normalized: SpriteStatePatch = {};
      for (const key of ["row", "frames", "durationMs", "iterations"] as const) {
        const field = patch[key];
        if (field === undefined) continue;
        if (key === "iterations") {
          if (field !== "infinite" && (typeof field !== "number" || !Number.isInteger(field) || field <= 0)) throw new Error(`Codex pet spriteLayout.states.${state}.iterations is invalid.`);
          normalized[key] = field;
        } else {
          if (typeof field !== "number" || !Number.isInteger(field) || field <= 0) throw new Error(`Codex pet spriteLayout.states.${state}.${key} is invalid.`);
          normalized[key] = field;
        }
      }
      if (Object.keys(normalized).length > 0) states[state as keyof typeof states] = normalized;
    }
    if (Object.keys(states).length > 0) result.states = states;
  }
  if (Object.keys(result).length === 0) return undefined;
  applySpriteLayoutOverride(defaultPetSprite, result);
  return result;
}

function isSafeCodexPetId(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value) && value !== "builtin";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
