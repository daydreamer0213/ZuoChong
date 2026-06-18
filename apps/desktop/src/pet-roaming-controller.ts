/**
 * pet-roaming-controller.ts — Phase C host module
 *
 * Maintains a registry of all live pet windows and applies uniform roaming
 * (gravity + physics) to every registered pet. Both the default pet and
 * agent pets register here so that applyRoamingToAllPets() covers them all.
 */

import { motionSetPhysics, motionStop, registerPet, unregisterPet, type WindowAccessor } from "./pet-motion-engine.js";

// Map of petId -> accessor for all currently live pets
const livePets = new Map<string, WindowAccessor>();

/**
 * Register a pet with the roaming controller AND the motion engine.
 * Call after the pet window has been shown/created.
 */
export function registerRoamingPet(petId: string, accessor: WindowAccessor): void {
  livePets.set(petId, accessor);
  registerPet(petId, accessor);
  applyRoamingToPet(petId, accessor);
}

/**
 * Unregister a pet from the roaming controller and motion engine.
 * Call before the pet window is destroyed.
 */
export function unregisterRoamingPet(petId: string): void {
  livePets.delete(petId);
  unregisterPet(petId);
}

/**
 * Re-apply the current roaming config to every live registered pet.
 * Call when roaming preferences change.
 */
export function applyRoamingToAllPets(): void {
  for (const [petId, accessor] of livePets) {
    applyRoamingToPet(petId, accessor);
  }
}

/**
 * Apply default roaming (gravity) to a single pet.
 *
 * Phase C uses a simple fixed default: gravity enabled with bounce 0.4.
 * There are no walkabout/gravity preference fields in app-state yet
 * (that is deferred to a later phase). This matches the walkabout plugin's
 * default physics behavior.
 */
export function applyRoamingToPet(petId: string, accessor: WindowAccessor): void {
  motionSetPhysics(petId, accessor, { gravity: true, bounce: 0.4 });
}

/**
 * Stop all motion for a single pet (without unregistering it).
 */
export function stopRoamingForPet(petId: string): void {
  motionStop(petId);
}

/** ONLY call from unit tests. Clears the livePets registry (for test isolation). */
export function _resetLivePetsForTesting(): void {
  livePets.clear();
}
