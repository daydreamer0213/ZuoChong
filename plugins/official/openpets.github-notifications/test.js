import assert from "node:assert/strict";
import { EMPTY_BASELINE, checkNow, format, parseRepos, parseReposDetailed, register, resetBaseline, repoLimitForConfig, safeMessage, showLastCheck } from "./index.js";

function harness(config, routes) {
  const store = new Map();
  const calls = { speak: [], react: [], status: [], every: [], cancel: [], commands: new Map(), warnings: [] };
  return { store, calls, ctx: {
    config: { get: async () => config }, storage: { get: async (k) => store.get(k), set: async (k, v) => store.set(k, v), delete: async (k) => store.delete(k) },
    schedule: { cancel: async (id) => calls.cancel.push(id), every: async (id, ms, fn) => calls.every.push({ id, ms, fn }) }, status: { set: async (v) => calls.status.push(v) },
    pet: { speak: async (m) => calls.speak.push(m), react: async (r) => calls.react.push(r) }, commands: { register: async (c, f) => calls.commands.set(c.id, { c, f }) }, log: { warn: (...a) => calls.warnings.push(a) },
    http: { fetch: async (url) => { const key = new URL(url).pathname + new URL(url).search; const value = routes[key]; if (value instanceof Error) throw value; return { ok: true, status: 200, headers: {}, json: value || [] }; } }
  }};
}

assert.deepEqual(parseRepos("a/b\na/b bad nope c/d"), ["a/b", "c/d"]);
assert.deepEqual(parseReposDetailed("a/b bad").invalid, ["bad"]);
assert.equal(repoLimitForConfig({ notifyIssues: true, notifyPullRequests: true }), 5);
assert.equal(repoLimitForConfig({ notifyIssues: false, notifyPullRequests: false }), 9);
assert.equal(safeMessage("secret token"), "New GitHub notification.");
assert.equal(format("New {repo}: {name}", { repo: "o/r", name: "hello/world" }), "New o r: hello world");

const routes1 = { "/repos/o/r": { default_branch: "trunk" }, "/repos/o/r/releases?per_page=1": [{ id: 1, tag_name: "v1" }], "/repos/o/r/actions/runs?status=completed&per_page=10&branch=trunk": { workflow_runs: [{ id: 2, name: "ci", conclusion: "failure" }] }, "/repos/o/r/issues?state=open&per_page=10&sort=created&direction=desc": [{ id: 3, title: "bug" }], "/repos/o/r/pulls?state=open&per_page=1&sort=created&direction=desc": [{ id: 4, title: "fix" }] };
{
  const h = harness({ repositories: "o/r", notifyIssues: true, notifyPullRequests: true }, routes1);
  await checkNow(h.ctx, false);
  assert.equal(h.calls.speak.length, 0, "baseline does not notify");
  await checkNow(h.ctx, true);
  assert.equal(h.calls.speak.at(-1), "No new GitHub notifications.");
}
{
  const emptyRoutes = { ...routes1, "/repos/o/r/releases?per_page=1": [], "/repos/o/r/actions/runs?status=completed&per_page=10&branch=trunk": { workflow_runs: [] }, "/repos/o/r/issues?state=open&per_page=10&sort=created&direction=desc": [], "/repos/o/r/pulls?state=open&per_page=1&sort=created&direction=desc": [] };
  const h = harness({ repositories: "o/r", notifyIssues: true, notifyPullRequests: true }, emptyRoutes);
  await checkNow(h.ctx, false);
  assert.equal(h.store.get("release:o/r"), EMPTY_BASELINE);
  h.ctx.http.fetch = async (url) => ({ ok: true, status: 200, headers: {}, json: routes1[new URL(url).pathname + new URL(url).search] || [] });
  const result = await checkNow(h.ctx, false);
  assert.equal(result.notifications, 4, "first real events after empty baseline notify");
}
{
  const h = harness({ repositories: "o/r", notifyIssues: false, notifyPullRequests: false }, routes1);
  await checkNow(h.ctx, false);
  h.ctx.config.get = async () => ({ repositories: "o/r", notifyIssues: true, notifyPullRequests: true });
  const result = await checkNow(h.ctx, false);
  assert.equal(result.notifications, 0, "newly enabled event types baseline without announcing old items");
  assert.equal(h.store.get("issue:o/r"), "3");
  assert.equal(h.store.get("pr:o/r"), "4");
}
{
  const h = harness({ repositories: "o/r", notifyFailedWorkflows: false }, routes1);
  await checkNow(h.ctx, false);
  assert.equal(h.store.get("release:o/r"), "1");
  h.ctx.http.fetch = async () => ({ ok: true, status: 304, headers: {}, json: undefined });
  await checkNow(h.ctx, false);
  assert.equal(h.store.get("release:o/r"), "1", "304 does not overwrite existing seen id with empty baseline");
  h.ctx.http.fetch = async (url) => ({ ok: true, status: 200, headers: {}, json: routes1[new URL(url).pathname + new URL(url).search] || [] });
  const result = await checkNow(h.ctx, false);
  assert.equal(result.notifications, 0, "200 -> 304 -> 200 same id does not re-announce");
}
{
  const routes2 = { ...routes1, "/repos/o/r/releases?per_page=1": [{ id: 10, tag_name: "v2" }], "/repos/o/r/actions/runs?status=completed&per_page=10&branch=trunk": { workflow_runs: [{ id: 20, name: "ci", conclusion: "timed_out" }] }, "/repos/o/r/issues?state=open&per_page=10&sort=created&direction=desc": [{ id: 30, title: "bug2" }, { id: 31, pull_request: {}, title: "pr as issue" }], "/repos/o/r/pulls?state=open&per_page=1&sort=created&direction=desc": [{ id: 40, title: "fix2" }] };
  const h = harness({ repositories: "o/r", notifyIssues: true, notifyPullRequests: true }, routes1);
  await checkNow(h.ctx, false); h.ctx.http.fetch = async (url) => ({ ok: true, status: 200, headers: {}, json: routes2[new URL(url).pathname + new URL(url).search] || [] });
  const result = await checkNow(h.ctx, false);
  assert.equal(result.notifications, 4);
  assert.equal(h.calls.speak.length, 1, "batched notifications use one speech");
}
{
  const h = harness({ repositories: "o/r x/y", notifyIssues: true }, { ...routes1, "/repos/x/y/releases?per_page=1": new Error("boom") });
  h.ctx.http.fetch = async (url) => { const key = new URL(url).pathname + new URL(url).search; const value = h.ctx.config && { ...routes1, "/repos/x/y/releases?per_page=1": new Error("boom") }[key]; if (value instanceof Error) throw value; return { ok: true, status: 200, headers: {}, json: value || [] }; };
  const result = await checkNow(h.ctx, true);
  assert.equal(result.failures, 1);
  assert.ok(h.calls.speak.at(-1).includes("failures"));
  await showLastCheck(h.ctx); assert.ok(h.calls.speak.at(-1).includes("Last GitHub check"));
}
{
  const h = harness({ repositories: "bad o/r" }, routes1);
  const result = await checkNow(h.ctx, true);
  assert.equal(result.invalid.length, 1);
  assert.ok(h.calls.speak.at(-1).includes("invalid"));
}
{
  const h = harness({ repositories: "o/r" }, { ...routes1, "/repos/o/r/releases?per_page=1": new Error("network down") });
  await checkNow(h.ctx, false);
  assert.ok(Number(h.store.get("backoff:o/r")) > Date.now());
  const result = await checkNow(h.ctx, true);
  assert.equal(result.backoffSkipped, 1);
}
{
  const h = harness({ repositories: "o/r x/y", notifyIssues: true }, { ...routes1, "/repos/x/y/releases?per_page=1": new Error("network down") });
  h.ctx.http.fetch = async (url) => { const key = new URL(url).pathname + new URL(url).search; const value = { ...routes1, "/repos/x/y/releases?per_page=1": new Error("network down") }[key]; if (value instanceof Error) throw value; return { ok: true, status: 200, headers: {}, json: value || [] }; };
  await resetBaseline(h.ctx);
  assert.ok(h.calls.speak.at(-1).includes("partially reset"));
}
{
  const h = harness({ repositories: "o/r" }, routes1);
  let resolveFetch;
  let blocked = true;
  h.ctx.http.fetch = async (url) => {
    if (blocked) { blocked = false; return await new Promise((resolve) => { resolveFetch = () => resolve({ ok: true, status: 200, headers: {}, json: [] }); }); }
    const key = new URL(url).pathname + new URL(url).search;
    return { ok: true, status: 200, headers: {}, json: routes1[key] || [] };
  };
  const first = checkNow(h.ctx, false);
  await Promise.resolve(); await Promise.resolve();
  const second = await checkNow(h.ctx, true);
  assert.equal(second.reason, "already-running");
  assert.equal(h.calls.speak.at(-1), "GitHub check already running.");
  resolveFetch(); await first;
}
{
  const h = harness({}, {}); const plugin = { register(def) { this.def = def; } }; register(plugin); await plugin.def.start(h.ctx); assert.ok(h.calls.commands.has("show-last-check"));
  await h.calls.commands.get("check-now").f();
  assert.ok(h.calls.status.at(-1).text.includes("checking"));
}
console.log("GitHub Notifications plugin tests passed.");
