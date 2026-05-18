import { applyExternalPetReaction, applyExternalPetSay } from "./default-pet-controller.js";
import type { OpenPetsReaction } from "./local-ipc-protocol.js";

export interface PluginPetApi {
  speak(message: string): void | Promise<void>;
  react(reaction: OpenPetsReaction): void | Promise<void>;
}

export const defaultPluginPetApi: PluginPetApi = {
  speak(message) {
    applyExternalPetSay(message);
  },
  react(reaction) {
    applyExternalPetReaction(reaction);
  },
};
