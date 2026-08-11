# OpenPets Closure and Reuse Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing Codex integration, sprite-layout support, and edge-snap prototype into a verified local baseline, then identify GitHub projects worth reusing for the broader character-workspace direction.

**Architecture:** Keep the current Electron, local IPC, pet renderer, and workspace-package boundaries. Closure work removes machine-local configuration from the publishable diff, fixes only demonstrated contract or test failures, and records external reuse candidates without integrating speculative dependencies.

**Tech Stack:** Node.js 20+, pnpm 11, TypeScript 6, Electron 42, React, Sharp, Node test runner.

## Global Constraints

- Preserve unrelated user changes and do not rewrite existing architecture.
- Keep dependency stores, caches, test output, and downloaded research data on `D:`.
- Use current official Codex Hook documentation as the contract for `@open-pets/codex`.
- Do not claim desktop behavior is verified without a Windows Electron smoke run.
- Do not integrate researched repositories during this closure pass.

---

### Task 1: Establish the publishable diff

**Files:**
- Modify: `package.json`
- Inspect only: `.npmrc`

**Interfaces:**
- Consumes: the existing pnpm workspace and local dependency installation.
- Produces: a portable repository diff that does not depend on `../.cache/app-builder-bin`.

- [ ] **Step 1: Record the current status and whitespace check**

Run: `git status --short && git diff --check`

Expected: feature files are visible; no whitespace errors.

- [ ] **Step 2: Remove the machine-local pnpm override**

Restore the root `package.json` ending to:

```json
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

- [ ] **Step 3: Keep `.npmrc` local**

Do not stage `.npmrc`; it contains the local `D:/Guo/zuochong` store and mirror settings.

### Task 2: Verify and close the Codex hook package

**Files:**
- Modify if required: `packages/codex/src/hook-config.ts`
- Modify if required: `packages/codex/src/hooks.ts`
- Test: `packages/codex/src/check-codex-hooks.ts`
- Documentation: `docs/agent-integrations.md`

**Interfaces:**
- Consumes: official Codex lifecycle events and inline `[hooks]` TOML shape.
- Produces: `open-pets-codex hook|doctor-hooks|install-hooks|uninstall-hooks`.

- [ ] **Step 1: Run the package check**

Run: `pnpm --filter @open-pets/codex check`

Expected: typecheck, build, and smoke checks pass.

- [ ] **Step 2: Validate generated configuration against the installed Codex client**

Generate a temporary config under `D:\DevData\openpets-closure\codex-home`, then invoke the local Codex configuration parser or hook inspector.

Expected: the generated TOML loads without duplicate-key or unsupported-handler errors.

- [ ] **Step 3: Apply only demonstrated contract corrections**

Remove `async = true` because current official documentation says asynchronous command hooks are not supported. If the installed client rejects the inline array form, emit the documented `[[hooks.Event]]` / `[[hooks.Event.hooks]]` tables instead.

- [ ] **Step 4: Re-run the package check**

Run: `pnpm --filter @open-pets/codex check`

Expected: all Codex package checks pass.

### Task 3: Verify desktop behavior and sprite contracts

**Files:**
- Test: `apps/desktop/tests/display.test.ts`
- Inspect/modify if required: `apps/desktop/src/display.ts`
- Inspect/modify if required: `apps/desktop/src/pet-window.ts`
- Inspect/modify if required: `apps/desktop/src/codex-pets-core.ts`
- Inspect/modify if required: `apps/desktop/src/reaction-animation-mapping.ts`

**Interfaces:**
- Consumes: Electron display geometry, installed pet metadata, and spritesheet dimensions.
- Produces: left/right edge hiding and per-pet sprite layouts without changing unrelated motion behavior.

- [ ] **Step 1: Run the desktop test pipeline**

Run: `pnpm --filter @open-pets/desktop test`

Expected: preload, TypeScript, behavior, contract, and dist checks pass.

- [ ] **Step 2: Diagnose any failure at its shared root**

For each failure, trace all callers with `rg`, add or tighten one behavior-focused regression assertion, and make the smallest shared fix.

- [ ] **Step 3: Re-run desktop tests and type checking**

Run: `pnpm --filter @open-pets/desktop test`

Run: `pnpm --filter @open-pets/desktop typecheck`

Expected: both commands exit successfully.

### Task 4: Full verification and Windows smoke

**Files:**
- Documentation: `docs/pets.md`
- Documentation: `docs/agent-integrations.md`

**Interfaces:**
- Consumes: all workspace packages and built Electron assets.
- Produces: evidence for a local closure commit.

- [ ] **Step 1: Run workspace checks**

Run: `pnpm test`

Run: `pnpm check`

Expected: both commands exit successfully with no failing package.

- [ ] **Step 2: Run the Windows Electron smoke**

Launch the built desktop app and verify: normal pet display, left/right snap, feather click restore, feather drag restore, top/bottom no snap, custom 8-column spritesheet rendering, and Codex-window coexistence.

- [ ] **Step 3: Review the final diff**

Run: `git diff --check && git status --short`

Expected: only portable source, tests, assets, docs, and this plan are staged for closure; `.npmrc` remains local.

- [ ] **Step 4: Commit the verified baseline**

Commit subject: `Add Codex-aware desktop pet behaviors`

### Task 5: Research reusable GitHub projects

**Files:**
- Create: `docs/research/2026-08-11-character-workspace-reuse.md`

**Interfaces:**
- Consumes: public GitHub repository metadata, source documentation, releases, and architecture.
- Produces: a ranked reuse matrix with repository, reusable subsystem, integration cost, maintenance activity, and license note.

- [ ] **Step 1: Search the target categories**

Research desktop-pet engines, Live2D/Spine/avatar renderers, agent-event integrations, Windows desktop overlays/widgets, theme packaging, and character asset pipelines.

- [ ] **Step 2: Inspect primary sources**

Open each shortlisted repository and its documentation; reject abandoned demos or projects whose reusable portion duplicates current OpenPets code.

- [ ] **Step 3: Rank candidates**

Use three levels: adopt now, borrow patterns, and watch only. Prefer repositories that replace code we would otherwise need to write.

- [ ] **Step 4: Write the research report**

Record direct GitHub links, exact reusable modules, proposed integration seams, risks, and the smallest next experiment. Do not add dependencies in this task.
