import assert from "node:assert/strict";

import { createPluginsHtml } from "../src/plugins-window.js";

const html = createPluginsHtml({ title: "Plugins", heading: "Plugins", description: "Manage plugins." });

assert.match(html, /data-openpets-view="plugins"/);
assert.match(html, /Content-Security-Policy/);
assert.doesNotMatch(html, /script-src/);
assert.doesNotMatch(html, /https:\/\//);
assert.match(html, /id="plugins-grid"/);
assert.match(html, /id="detail-view"/);
assert.match(html, /id="hub-view"/);

console.error("Plugins window validation passed.");
