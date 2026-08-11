import assert from "node:assert/strict";

import { hasCodexDesktopWindow, parseTasklistCsv, supportsCodexDesktopPresence } from "../src/codex-presence-core.js";

const visibleTasklist = [
  '"ChatGPT.exe","4321","Console","1","150,000 K","Running","user","0:00:05","Codex"',
  '"explorer.exe","1000","Console","1","90,000 K","Running","user","0:01:00","N/A"',
].join("\r\n");

assert.equal(hasCodexDesktopWindow(visibleTasklist), true);
assert.deepEqual(parseTasklistCsv(visibleTasklist)[0], {
  imageName: "ChatGPT.exe",
  windowTitle: "Codex",
});

assert.equal(hasCodexDesktopWindow('"codex.exe","4321","Console","1","10 K","Running","user","0:00:01","N/A"'), false);
assert.equal(hasCodexDesktopWindow('"ChatGPT.exe","4321","Console","1","10 K","Running","user","0:00:01","Codex, Review"'), false);
assert.equal(hasCodexDesktopWindow('"other.exe","4321","Console","1","10 K","Running","user","0:00:01","Codex"'), false);
assert.deepEqual(parseTasklistCsv('"too","short"'), []);
assert.equal(supportsCodexDesktopPresence("win32"), true);
assert.equal(supportsCodexDesktopPresence("darwin"), false, "process-name matching must not hide pets on macOS");
assert.equal(supportsCodexDesktopPresence("linux"), false, "process-name matching must not hide pets on Linux");

console.log("Codex presence validation passed.");
