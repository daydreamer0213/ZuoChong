# Remove Calendar Airmail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Calendar Airmail and its blocked OAuth values from the ZuoChong product and unpublished Git history, then push a verified `main`.

**Architecture:** Delete the independent official-plugin package and only the documentation/test references that depend on it. Rewrite local publish branches to omit the plugin path from every reachable commit while preserving `origin/*` and upstream tags.

**Tech Stack:** Git, PowerShell, Node.js 20+, pnpm 11, Markdown

## Global Constraints

- Keep `origin` unchanged and push only `main` to `zuochong`.
- Keep `.npmrc` untracked.
- Keep dependencies, caches, Git temporary files, and diagnostics on `D:`.
- Do not bypass GitHub push protection or publish the OAuth values.

---

### Task 1: Remove the current plugin package

**Files:**
- Delete: `plugins/official/openpets.calendar-airmail/`
- Delete: `scripts/plugin-sprite-validation.test.mjs`
- Modify: `docs/plugins.md`
- Modify: `docs/official-plugins.md`
- Modify: `docs/desktop.md`
- Modify: `docs/testing-and-validation.md`
- Modify: `docs/wayland.md`

**Interfaces:**
- Consumes: the package-per-plugin boundary under `plugins/official/`
- Produces: an active source tree with no Calendar Airmail package or product documentation

- [ ] **Step 1: Remove the plugin and exclusive fixture test**

Run:

```powershell
git rm -r -- plugins/official/openpets.calendar-airmail
git rm -- scripts/plugin-sprite-validation.test.mjs
```

- [ ] **Step 2: Remove direct documentation references**

Update the five listed docs so the official count is nine, the Calendar row and
testing guidance are absent, and generic SDK documentation no longer names the
removed plugin.

- [ ] **Step 3: Verify current references are gone**

Run:

```powershell
rg -n "calendar-airmail|Calendar Airmail|openpets\.calendar-airmail" plugins scripts docs apps
```

Expected: matches only in this design/plan record.

### Task 2: Validate and commit the product removal

**Files:**
- Modify: all Task 1 paths

**Interfaces:**
- Consumes: the reduced official-plugin inventory
- Produces: a tested commit whose tree no longer ships Calendar Airmail

- [ ] **Step 1: Run focused plugin validation**

Run: `D:\hermes\node\pnpm.cmd plugins:test`

Expected: exit code `0`; all remaining official plugin harnesses pass.

- [ ] **Step 2: Run the repository check**

Run: `D:\hermes\node\pnpm.cmd check`

Expected: exit code `0`.

- [ ] **Step 3: Commit**

```powershell
git add -- docs plugins scripts
git diff --cached --check
git commit -m "Remove Calendar Airmail plugin"
```

### Task 3: Scrub unpublished publish-branch history

**Files:**
- Rewrite: local `main`
- Rewrite: local `codex/openpets-closure-20260811`
- Preserve: `refs/remotes/origin/*` and tags

**Interfaces:**
- Consumes: the tested removal commit
- Produces: publish branches whose reachable objects never contain `plugins/official/openpets.calendar-airmail`

- [ ] **Step 1: Record the pre-rewrite tree**

Run: `git rev-parse main^{tree}`

- [ ] **Step 2: Rewrite the local branches**

```powershell
$env:FILTER_BRANCH_SQUELCH_WARNING="1"
git filter-branch --force --index-filter "git rm -r --cached --ignore-unmatch -- plugins/official/openpets.calendar-airmail" --prune-empty -- main codex/openpets-closure-20260811
```

- [ ] **Step 3: Verify tree and history**

Confirm the post-rewrite tree equals the recorded tree, then run:

```powershell
git log main -- plugins/official/openpets.calendar-airmail
git rev-list --objects main | Select-String "plugins/official/openpets.calendar-airmail"
git fsck --full --strict
```

Expected: no path-history/object matches and no reachable-object errors.

### Task 4: Verify transport, push, and clean up

**Files:**
- Create temporarily: `D:\DevData\zuochong-main.bundle`
- Update: remote `zuochong/main`

**Interfaces:**
- Consumes: scrubbed, tested `main`
- Produces: GitHub `main` at the same commit as local `main`

- [ ] **Step 1: Build and verify a self-contained bundle**

```powershell
git bundle create D:\DevData\zuochong-main.bundle main
git bundle verify D:\DevData\zuochong-main.bundle
```

Expected: the bundle is complete and `main` is listed.

- [ ] **Step 2: Push and independently verify**

```powershell
git push -u zuochong main
git ls-remote zuochong refs/heads/main
```

Expected: the remote hash equals `git rev-parse main`.

- [ ] **Step 3: Remove generated bundle and merged feature branch**

Delete the verified bundle, remove `codex/openpets-closure-20260811` with
`git branch -d`, and confirm `git status --short` contains only `?? .npmrc`.
