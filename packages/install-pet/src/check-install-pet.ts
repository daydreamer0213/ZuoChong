import assert from "node:assert/strict";
import { join } from "node:path";

import { getOpenPetsUserDataPath, parseArgs, validateCatalog, validatePetId } from "./index.js";

assert.deepEqual(parseArgs(["review-owl"]), { petId: "review-owl", help: false });
assert.equal(parseArgs(["--help"]).help, true);
assert.equal(validatePetId("review-owl"), "review-owl");
assert.throws(() => validatePetId("../bad"));
assert.throws(() => validatePetId("builtin"));

assert.equal(getOpenPetsUserDataPath("darwin", {}), join(process.env.HOME || "", "Library", "Application Support", "OpenPets"));
assert.equal(getOpenPetsUserDataPath("linux", { XDG_CONFIG_HOME: "/tmp/config" }), join("/tmp/config", "OpenPets"));
assert.equal(getOpenPetsUserDataPath("win32", { APPDATA: "C:\\Users\\me\\AppData\\Roaming" }), join("C:\\Users\\me\\AppData\\Roaming", "OpenPets"));
assert.equal(getOpenPetsUserDataPath("linux", { OPENPETS_USER_DATA: "/tmp/openpets-test" }), "/tmp/openpets-test");

assert.deepEqual(validateCatalog({
  version: 2,
  generatedAt: new Date().toISOString(),
  pets: [{
    id: "review-owl",
    displayName: "Review Owl",
    description: "A reviewer pet.",
    preview: "https://openpets.dev/pets/review-owl/preview.webp",
    zip: "https://zip.openpets.dev/pets/review-owl.zip",
  }],
}), [{
  id: "review-owl",
  displayName: "Review Owl",
  description: "A reviewer pet.",
  preview: "https://openpets.dev/pets/review-owl/preview.webp",
  zip: "https://zip.openpets.dev/pets/review-owl.zip",
}]);
assert.throws(() => validateCatalog({ version: 2, pets: [{ id: "bad/pet" }] }));

console.log("install-pet validation passed.");
