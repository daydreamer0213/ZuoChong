export const MAX_REPOS = 10;
export const MAX_MESSAGE_LENGTH = 140;
export const DEFAULT_NOTIFICATION_MESSAGE = "New GitHub notification.";
export const EMPTY_BASELINE = "__openpets_empty__";
const UNSAFE_MESSAGE_PATTERN = /```|<script|function\s+\w+|=>|\b(class|import|export|const|let|var)\b|https?:\/\/|www\.|\/[\w.-]+\/[\w./-]+|[A-Za-z]:\\|api[_-]?key|secret|token|password|passwd|BEGIN [A-Z ]+PRIVATE KEY/i;
let checkRunning = false;

export function register(OpenPetsPlugin) {
  OpenPetsPlugin.register({
    async start(ctx) {
      await ctx.commands.register({ id: "check-now", title: "Check GitHub now", description: "Check configured public repositories now." }, async () => {
        void checkNow(ctx, true).catch((error) => ctx.log?.warn?.("GitHub manual check failed", error?.message || String(error)));
        await ctx.status.set({ text: "GitHub: checking now…", tone: "info" });
      });
      await ctx.commands.register({ id: "reset-baseline", title: "Reset GitHub baseline", description: "Mark current releases, issues, pull requests, and failed workflows as seen." }, async () => {
        void resetBaseline(ctx).catch((error) => ctx.log?.warn?.("GitHub baseline reset failed", error?.message || String(error)));
        await ctx.status.set({ text: "GitHub: resetting baseline…", tone: "info" });
      });
      await ctx.commands.register({ id: "show-last-check", title: "Show last GitHub check", description: "Speak the latest GitHub notification check summary." }, async () => await showLastCheck(ctx));
      await scheduleNext(ctx);
      void checkNow(ctx, false).catch((error) => ctx.log?.warn?.("GitHub initial check failed", error?.message || String(error)));
    },
  });
}

if (typeof globalThis.OpenPetsPlugin !== "undefined") register(globalThis.OpenPetsPlugin);

export async function scheduleNext(ctx) {
  const config = await ctx.config.get();
  const interval = Math.max(10, Number(config.pollIntervalMinutes || 30));
  await ctx.schedule.cancel("poll");
  await ctx.schedule.every("poll", interval * 60 * 1000, async () => await checkNow(ctx, false));
  await ctx.status.set({ text: `GitHub: next check ${new Date(Date.now() + interval * 60 * 1000).toLocaleTimeString()}`, tone: "info" });
}

export async function checkNow(ctx, manual) {
  if (checkRunning) {
    if (manual) await ctx.pet.speak("GitHub check already running.");
    return { at: new Date().toISOString(), repos: 0, notifications: 0, failures: 0, skipped: true, reason: "already-running" };
  }
  checkRunning = true;
  try {
  const config = await ctx.config.get();
  const parsed = parseReposDetailed(config.repositories);
  const repoLimit = repoLimitForConfig(config);
  const repos = parsed.repos.slice(0, repoLimit);
  const truncated = parsed.truncated || parsed.repos.length > repoLimit;
  if (repos.length === 0) { await ctx.status.set({ text: parsed.invalid.length ? "GitHub: fix invalid repositories" : "GitHub: add public repositories", tone: "warning" }); if (manual && parsed.invalid.length) await ctx.pet.speak(`Invalid GitHub repositories ignored: ${parsed.invalid.slice(0, 3).join(", ")}.`); return { repos: 0, notifications: 0, failures: 0, invalid: parsed.invalid, truncated }; }
  const baseline = (await ctx.storage.get("baselineComplete")) === true;
  const events = [];
  let failures = 0;
  let backoffSkipped = 0;
  for (const repo of repos) {
    try {
      const backoffUntil = Number(await ctx.storage.get(`backoff:${repo}`) || 0);
      if (backoffUntil > Date.now()) { backoffSkipped += 1; continue; }
      if (config.notifyReleases !== false) events.push(...await checkRelease(ctx, repo, config, baseline));
      if (config.notifyFailedWorkflows !== false) events.push(...await checkWorkflow(ctx, repo, config, baseline));
      if (config.notifyIssues === true) events.push(...await checkIssue(ctx, repo, config, baseline));
      if (config.notifyPullRequests === true) events.push(...await checkPullRequest(ctx, repo, config, baseline));
    } catch (error) {
      failures += 1;
      if (isBackoffError(error)) await ctx.storage.set(`backoff:${repo}`, Date.now() + 15 * 60 * 1000);
      ctx.log?.warn?.("GitHub repo check failed", repo, error?.message || String(error));
    }
  }
  await notifyBatch(ctx, events);
  if (!baseline) await ctx.storage.set("baselineComplete", true);
  const notifications = events.length;
  const summary = { at: new Date().toISOString(), repos: repos.length, notifications, failures, invalid: parsed.invalid, truncated, backoffSkipped };
  await ctx.storage.set("lastCheck", summary);
  await ctx.status.set({ text: `GitHub: checked ${repos.length}, ${notifications} new${failures ? `, ${failures} failed` : ""}`, tone: failures ? "warning" : notifications ? "success" : "info" });
  if (manual) {
    if (parsed.invalid.length || truncated) await ctx.pet.speak(`GitHub ignored ${parsed.invalid.length} invalid${truncated ? " and extra" : ""} repository entries.`);
    else if (notifications === 0 && failures === 0) await ctx.pet.speak(backoffSkipped ? `No new GitHub notifications. ${backoffSkipped} repo checks are cooling down.` : "No new GitHub notifications.");
    else if (failures) await ctx.pet.speak(notifications ? `GitHub check found ${notifications} new notifications, with ${failures} repo failures.` : `GitHub check had ${failures} repo failures and no new notifications.`);
  }
  const interval = Math.max(10, Number(config.pollIntervalMinutes || 30));
  await ctx.schedule.cancel("poll");
  await ctx.schedule.every("poll", interval * 60 * 1000, async () => await checkNow(ctx, false));
  return summary;
  } finally { checkRunning = false; }
}

export async function showLastCheck(ctx) {
  const last = await ctx.storage.get("lastCheck");
  if (!last || typeof last !== "object") { await ctx.pet.speak("No GitHub check has completed yet."); return; }
  await ctx.pet.speak(`Last GitHub check: ${last.repos || 0} repos, ${last.notifications || 0} new, ${last.failures || 0} failed.`);
}

export async function resetBaseline(ctx) {
  await ctx.storage.delete("baselineComplete");
  const summary = await checkNow(ctx, false);
  if (summary.failures || summary.backoffSkipped) await ctx.pet.speak(`GitHub baseline partially reset. ${summary.failures || 0} failed, ${summary.backoffSkipped || 0} cooling down.`);
  else await ctx.pet.speak("GitHub notification baseline reset.");
}

async function checkRelease(ctx, repo, config, baseline) {
  const res = await github(ctx, `/repos/${repo}/releases?per_page=1`, `etag:release:${repo}`);
  if (res.notModified) return [];
  const release = Array.isArray(res.json) ? res.json[0] : undefined;
  return handleNewest(ctx, `release:${repo}`, release && String(release.id || release.tag_name || ""), baseline, { type: "release", repo, message: format(config.releaseMessage || "New release: {repo} {tag}", { repo, tag: release?.tag_name || "" }), reaction: config.releaseReaction || "celebrating" });
}

async function checkWorkflow(ctx, repo, config, baseline) {
  const branch = await defaultBranch(ctx, repo);
  const res = await github(ctx, `/repos/${repo}/actions/runs?status=completed&per_page=10&branch=${encodeURIComponent(branch)}`, `etag:workflow:${repo}`);
  if (res.notModified) return [];
  const run = (res.json?.workflow_runs || []).find((item) => ["failure", "timed_out", "action_required"].includes(item?.conclusion));
  return handleNewest(ctx, `workflow:${repo}`, run && String(run.id || ""), baseline, { type: "workflow", repo, message: format(config.workflowMessage || "Workflow failed in {repo}: {name}", { repo, name: run?.name || "workflow" }), reaction: config.workflowReaction || "error" });
}

async function checkIssue(ctx, repo, config, baseline) {
  const res = await github(ctx, `/repos/${repo}/issues?state=open&per_page=10&sort=created&direction=desc`, `etag:issue:${repo}`);
  if (res.notModified) return [];
  const issue = (Array.isArray(res.json) ? res.json : []).find((item) => item && !item.pull_request);
  return handleNewest(ctx, `issue:${repo}`, issue && String(issue.id || issue.number || ""), baseline, { type: "issue", repo, message: format(config.issueMessage || "New issue in {repo}: {name}", { repo, name: issue?.title || `#${issue?.number}` }), reaction: config.issueReaction || "thinking" });
}

async function checkPullRequest(ctx, repo, config, baseline) {
  const res = await github(ctx, `/repos/${repo}/pulls?state=open&per_page=1&sort=created&direction=desc`, `etag:pr:${repo}`);
  if (res.notModified) return [];
  const pr = Array.isArray(res.json) ? res.json[0] : undefined;
  return handleNewest(ctx, `pr:${repo}`, pr && String(pr.id || pr.number || ""), baseline, { type: "pr", repo, message: format(config.pullRequestMessage || "New pull request in {repo}: {name}", { repo, name: pr?.title || `#${pr?.number}` }), reaction: config.pullRequestReaction || "waving" });
}

async function handleNewest(ctx, key, id, baseline, event) {
  const previous = String((await ctx.storage.get(key)) || "");
  const next = id || EMPTY_BASELINE;

  if (!baseline || !previous) {
    await ctx.storage.set(key, next);
    return [];
  }

  if (!id) {
    if (previous !== EMPTY_BASELINE) await ctx.storage.set(key, EMPTY_BASELINE);
    return [];
  }

  await ctx.storage.set(key, id);
  if (id === previous) return [];
  return [event];
}

async function defaultBranch(ctx, repo) {
  const key = `repo:${repo}`;
  const cached = await ctx.storage.get(key);
  if (cached?.default_branch) return cached.default_branch;
  const res = await github(ctx, `/repos/${repo}`, `etag:repo:${repo}`);
  const branch = res.json?.default_branch || "main";
  await ctx.storage.set(key, { default_branch: branch });
  return branch;
}

async function notifyBatch(ctx, events) {
  if (!events.length) return;
  const order = { workflow: 0, release: 1, pr: 2, issue: 3 };
  events.sort((a, b) => order[a.type] - order[b.type]);
  const first = events[0];
  await ctx.pet.react(safeMessage(first.reaction, "idle"));
  await ctx.pet.speak(events.length === 1 ? first.message : `GitHub: ${events.length} new notifications. ${first.message}`);
}

function isBackoffError(error) { const text = String(error?.message || error); return /\b(403|429)\b|network|fetch|timeout/i.test(text); }

export async function github(ctx, path, etagKey) {
  const headers = { accept: "application/vnd.github+json", "user-agent": "OpenPets GitHub Notifications" };
  const etag = await ctx.storage.get(etagKey);
  if (typeof etag === "string" && etag) headers["if-none-match"] = etag;
  const res = await ctx.http.fetch(`https://api.github.com${path}`, { headers, timeoutMs: 10000 });
  if (res.headers?.etag) await ctx.storage.set(etagKey, res.headers.etag);
  if (res.status === 304) return { ...res, json: undefined, notModified: true };
  if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
  return res;
}

export async function notify(ctx, message, reaction) { await ctx.pet.react(safeMessage(reaction, "idle")); await ctx.pet.speak(safeMessage(message)); }
export function safeMessage(value, fallback = DEFAULT_NOTIFICATION_MESSAGE) {
  const message = typeof value === "string" && value.trim() ? value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ") : fallback;
  const capped = message.length > MAX_MESSAGE_LENGTH ? message.slice(0, MAX_MESSAGE_LENGTH).trim() : message;
  if (!capped || UNSAFE_MESSAGE_PATTERN.test(capped)) return fallback;
  return capped;
}
export function parseRepos(value) {
  return parseReposDetailed(value).repos;
}
export function parseReposDetailed(value) {
  const raw = Array.isArray(value) ? value.join("\n") : String(value || "");
  const valid = [];
  const invalid = [];
  for (const item of raw.split(/[\n,\s]+/).map((x) => x.trim()).filter(Boolean)) (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(item) ? valid : invalid).push(item);
  const unique = Array.from(new Set(valid));
  return { repos: unique.slice(0, MAX_REPOS), invalid, truncated: unique.length > MAX_REPOS };
}
export function repoLimitForConfig(config = {}) {
  let callsPerRepo = 0;
  if (config.notifyReleases !== false) callsPerRepo += 1;
  if (config.notifyFailedWorkflows !== false) callsPerRepo += 2;
  if (config.notifyIssues === true) callsPerRepo += 1;
  if (config.notifyPullRequests === true) callsPerRepo += 1;
  return Math.max(1, Math.min(MAX_REPOS, Math.floor(28 / Math.max(1, callsPerRepo))));
}
export function format(template, values) { return safeMessage(String(template).replace(/\{(repo|tag|name)\}/g, (_m, key) => safeTemplateValue(values[key] || ""))); }
export function safeTemplateValue(value) { return String(value).replace(/[\r\n]+/g, " ").replace(/\//g, " ").replace(/\s+/g, " ").trim().slice(0, 80); }
