import assert from "node:assert/strict";

import { initialCodexVisibilityGateState, reduceCodexVisibilityGate, shouldShowDefaultPetForExternalEvent } from "../src/app-state-core.js";

assert.equal(
  shouldShowDefaultPetForExternalEvent(false, false, false),
  true,
  "external pet.say should show the default pet even when launch display is disabled",
);
assert.equal(
  shouldShowDefaultPetForExternalEvent(false, false, true),
  false,
  "paused state should suppress external default pet display",
);

let gate = reduceCodexVisibilityGate(initialCodexVisibilityGateState, { type: "codex-presence", visible: true, petVisible: false });
assert.equal(gate.action, "none");
assert.equal(gate.state.restoreAfterCodex, false, "an already hidden pet must stay hidden when Codex leaves");

gate = reduceCodexVisibilityGate(gate.state, { type: "show-request" });
assert.equal(gate.action, "none", "show requests must be gated while Codex is visible");
assert.equal(gate.state.restoreAfterCodex, true, "a gated show request must be restored after Codex leaves");

gate = reduceCodexVisibilityGate(gate.state, { type: "hide-request" });
assert.equal(gate.state.restoreAfterCodex, false, "an explicit hide must cancel pending restoration");
gate = reduceCodexVisibilityGate(gate.state, { type: "codex-presence", visible: false, petVisible: false });
assert.equal(gate.action, "none", "Codex leaving must not override a later hide request");

gate = reduceCodexVisibilityGate(initialCodexVisibilityGateState, { type: "codex-presence", visible: true, petVisible: true });
assert.equal(gate.action, "hide");
assert.equal(gate.state.restoreAfterCodex, true);
gate = reduceCodexVisibilityGate(gate.state, { type: "codex-presence", visible: false, petVisible: false });
assert.equal(gate.action, "show", "a pet hidden by Codex must be restored");

console.log("default-pet-external-show tests passed.");
