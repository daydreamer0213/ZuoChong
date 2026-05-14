# Cursor Integration Research and Implementation Plan

This document captures current research for adding Cursor support to OpenPets. It records what Cursor supports, how OpenPets can integrate, recommended phases, risks, and implementation notes for future work.

## Status

- **Research direction:** approved directionally.
- **Phase 1 readiness:** the MCP-only plan is ready; implementation must begin with the validation checklist before any config writes ship.
- **Phase 3 hooks:** research spike required before implementation.

## Verified Cursor facts

Based on official Cursor documentation, these facts are safe to rely on for planning:

| Area | Verified fact | Source |
| --- | --- | --- |
| MCP config | Cursor supports MCP servers. | https://cursor.com/docs/mcp |
| Global MCP config | Cursor documents `~/.cursor/mcp.json`. | https://cursor.com/docs/mcp |
| Project MCP config | Cursor documents `.cursor/mcp.json`. | https://cursor.com/docs/mcp |
| Local MCP transport | Cursor supports local `stdio` MCP servers with `command` and `args`. | https://cursor.com/docs/mcp |
| Rules | Cursor supports project rules under `.cursor/rules`; `.md` and `.mdc` are documented rule formats. | https://cursor.com/docs/rules |
| User rules | Cursor supports user rules through Cursor Settings. No safe file path is assumed here. | https://cursor.com/docs/rules |
| Hooks | Cursor documents global and project hooks for agent/session/tool events. | https://cursor.com/docs/hooks.md |
| Extension API | Cursor documents extension APIs including MCP registration. | https://cursor.com/docs/extension-api |
| Permissions | Cursor documents `~/.cursor/permissions.json`, but OpenPets should not edit it in Phase 1. | https://cursor.com/docs/reference/permissions |

## Assumptions and validation required

These must be validated before implementation relies on them:

- Whether Cursor tolerates unknown fields inside `mcpServers.<name>` entries.
- Whether Cursor reloads MCP config live or requires restart/reload.
- Global/project MCP precedence when both define `mcpServers.openpets`.
- Exact behavior when duplicate server names exist across global and project scopes.
- Whether Cursor config is strict JSON only, or whether JSONC is accepted.
- Exact Cursor hook payload shapes for each event.
- Cursor hook stdout/stderr behavior, timeout behavior, fail-open/fail-closed behavior, and workspace trust behavior.
- Whether hook commands run in local, remote, WSL, or devcontainer environments for common Cursor setups.
- Whether Cursor extension/plugin distribution is worth Phase 4 complexity.

Phase 1A validation update, 2026-05-14:

- Treat MCP config as strict JSON. Cursor MCP docs describe JSON config and do not document JSONC for MCP config.
- Assume Cursor restart/reload is required. Cursor manual MCP install guidance says to save the file and restart Cursor.
- Global and project MCP configs are merged, with project config taking priority for duplicate server names.
- Use only documented stdio fields in Phase 1: `type`, `command`, `args`, optional `env`, optional `envFile`.
- Do not use `cwd` in MCP file entries unless later verified; it is not documented for MCP file config entries.
- Do not write unknown fields inside `mcpServers.openpets` in Phase 1.
- Use direct pinned `@open-pets/mcp@VERSION` for Phase 1 durable config.
- WSL/remote/devcontainer behavior requires caveats; no official MCP execution-location guarantee was found.
- Real Cursor smoke test passed on 2026-05-14: global `~/.cursor/mcp.json` with direct pinned `@open-pets/mcp@2.0.6` showed connected in Cursor with 3 OpenPets tools enabled.

## Managed files table

| File/location | Phase | OpenPets management policy |
| --- | --- | --- |
| `~/.cursor/mcp.json` | Phase 1 | May manage only `mcpServers.openpets` after explicit user action. Preserve unrelated config. |
| `.cursor/mcp.json` | Phase 1+ | Optional project-local mode only after explicit user action. Preserve unrelated config. |
| `.cursor/rules/openpets.md` or `.cursor/rules/openpets.mdc` | Phase 2 | Optional project-local rules only. Preview before writing. |
| `~/.cursor/hooks.json` | Phase 3 | Not managed until hook validation spike is complete. |
| `.cursor/hooks.json` | Phase 3 | Not managed until hook validation spike is complete. |
| `~/.cursor/permissions.json` | Never in Phase 1 | Do not edit. If ever supported, require explicit user consent and never add broad allow rules. |

## Safety invariants

Any Cursor implementation must follow these invariants:

- No silent writes. Every write requires explicit user action.
- Desktop Agent Setup should write global `~/.cursor/mcp.json` only in Phase 1. Project-local `.cursor/mcp.json` should be a CLI/advanced mode unless explicitly added to desktop UX.
- Preview only the OpenPets-managed entry by default. Do not show unrelated Cursor server secrets.
- Redact sensitive fields in any preview or diagnostics: `env`, `headers`, `auth`, `authorization`, `token`, `secret`, `password`, credentials, and token-bearing URLs.
- Do not log hook payload text, prompts, tool inputs/outputs, command strings, transcript paths, user email, workspace paths, or file contents.
- Reject symlinked config files and unsafe config parent paths.
- Read only regular files.
- Use a maximum config file size before parsing.
- Use strict JSON unless JSONC support is verified.
- Do not write if parse/classification fails.
- If creating `~/.cursor/` or `.cursor/`, validate the nearest existing parent and use private/safe permissions where supported.
- Write via temp file plus atomic rename.
- Backup before overwrite.
- Preserve unrelated user config exactly where possible.
- Uninstall removes only OpenPets-managed config.
- Avoid weakening Cursor permissions.
- Include WSL/remote/devcontainer caveats wherever setup may execute outside the desktop app's OS environment.

## Goal

Add Cursor as a first-class OpenPets integration so Cursor users can:

- configure OpenPets MCP tools from the desktop app or CLI;
- optionally install guidance/rules so Cursor knows when to use OpenPets;
- later enable ambient pet reactions from Cursor agent lifecycle hooks;
- uninstall or repair the integration safely.

## Current OpenPets state

OpenPets already has the main building blocks needed for Cursor:

- `@open-pets/mcp` exposes MCP tools:
  - `openpets_status`
  - `openpets_react`
  - `openpets_say`
- `@open-pets/client` talks to the desktop local IPC server.
- Desktop Agent Setup already supports integration cards for Claude Code and OpenCode.
- Cursor icon asset exists at `apps/desktop/assets/integrations/cursor.svg`.
- Cursor Phase 1 is implemented as an MCP-only integration in desktop/CLI. Public docs should mention Cursor only after release packaging is complete.
- Claude and OpenCode packages provide implementation patterns:
  - `packages/claude`: MCP setup + lifecycle hooks.
  - `packages/opencode`: config/status/preview/write flows and event plugin runtime.

## Official Cursor surfaces

### MCP

Cursor supports MCP servers through JSON configuration.

Known config locations:

- Global: `~/.cursor/mcp.json`
- Project: `.cursor/mcp.json`

Cursor supports local `stdio` MCP servers and remote transports. For OpenPets, local `stdio` is the safest first integration because `@open-pets/mcp` already runs as a stdio MCP server.

Example MCP entry shape for planning:

```json
{
  "mcpServers": {
    "openpets": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@open-pets/mcp@VERSION", "--pet", "PET_ID"]
    }
  }
}
```

Durable configs should pin package versions. Do not ship an unpinned `npx -y @open-pets/mcp` entry unless we intentionally want Cursor to float to latest on every run.

For local/bundled modes, do not assume OpenPets ships an external Node runtime. Follow existing OpenPets command-mode patterns and require a usable external `node` command if the selected mode needs one.

Official docs:

- https://cursor.com/docs/mcp

### Rules and instructions

Cursor supports prompt guidance through:

- project rules under `.cursor/rules` (`.md` and `.mdc` are documented formats);
- user rules in Cursor Settings; no safe editable file path is assumed in this plan;
- team rules in Cursor enterprise/team settings;
- `AGENTS.md`-style instructions. These can be root or nested and may affect other agents, so OpenPets should not write them by default.

Rules are not event callbacks. They are context/prompt guidance and should be used to teach Cursor when and how to call OpenPets MCP tools.

Recommended OpenPets rule content should be short and safe:

- Check `openpets_status` before using the pet if needed.
- Use `openpets_react` for short coding-state reactions.
- Use `openpets_say` sparingly for short, user-safe messages.
- Never send secrets, URLs containing tokens, full logs, or private file contents to speech bubbles.

Official docs:

- https://cursor.com/docs/rules

### Hooks

Cursor supports lifecycle hooks for agent/session events. This is the important surface for ambient reactions.

Relevant hook events from research:

- `sessionStart`
- `sessionEnd`
- `afterAgentThought`
- `preToolUse`
- `postToolUse`
- `postToolUseFailure`
- `beforeMCPExecution`
- `afterMCPExecution`
- `beforeShellExecution`
- `afterShellExecution`
- `stop`
- workspace/file/subagent-related hooks

Hooks are command/prompt based. Global hooks live under `~/.cursor/hooks.json`; project hooks can live in `.cursor/hooks.json`.

OpenPets should use command hooks only if hooks are implemented. Prompt hooks are not recommended for OpenPets because they add privacy and latency risk.

This means Cursor can do more than MCP-only manual tool calls. It can trigger OpenPets reactions during the agent loop, similar in spirit to Claude hooks.

Official docs:

- https://cursor.com/docs/hooks.md

### Extension and plugin APIs

Cursor exposes extension/plugin APIs, including dynamic MCP server registration:

- `vscode.cursor.mcp.registerServer(...)`
- `vscode.cursor.mcp.unregisterServer(...)`
- plugin path registration APIs

This is useful for a polished future experience, but it is not required for a first implementation. A desktop/CLI config writer is lower risk and faster.

Official docs:

- https://cursor.com/docs/extension-api
- https://cursor.com/docs/reference/plugins.md

### Permissions and security controls

Cursor has allowlist/permission controls, including `~/.cursor/permissions.json`. These can affect whether commands/tools run automatically. Treat these as convenience controls, not a hard security boundary.

OpenPets must not edit Cursor permissions in Phase 1. If permissions support is ever added later, it must be explicit, documented, and must never add broad allow rules such as wildcard command/tool permissions.

Official docs:

- https://cursor.com/docs/reference/permissions
- https://cursor.com/docs/agent/security.md

## Recommended implementation phases

### Phase 1: MCP-only setup

This should be the first implementation.

#### Scope

- Add Cursor to desktop Agent Setup as an active integration.
- Add config detection for `~/.cursor/mcp.json`; project-local `.cursor/mcp.json` can be a later option or an explicit advanced mode.
- Add preview/write/remove flows for a managed OpenPets MCP server entry.
- Use existing `@open-pets/mcp` package.
- Optionally generate Cursor rules preview, but do not require rules for MCP to work.

#### Why first

- Cursor already supports MCP.
- OpenPets MCP package already exists.
- Lowest risk and quickest path to working user value.
- No lifecycle-hook payload mapping required yet.

#### Expected config behavior

OpenPets should manage only its own `mcpServers.openpets` entry.

The config writer should:

- preserve unrelated Cursor MCP servers;
- preserve unknown top-level fields;
- classify status as installed / missing / needs update / conflict / error;
- create backups before writing;
- provide uninstall that removes only managed OpenPets entries;
- support published/local/bundled command modes, following existing Claude/OpenCode patterns;
- pin the OpenPets package version in durable published configs.

Desktop Phase 1 status should be a Cursor **configuration status**, not Cursor app detection, unless reliable Cursor app detection is intentionally implemented.

#### Managed entry shape

Default implementation must write only documented Cursor MCP fields. Do not write undocumented `openpets` metadata fields unless a validation spike proves Cursor tolerates them.

Recommended published-mode entry:

```json
{
  "mcpServers": {
    "openpets": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@open-pets/mcp@VERSION", "--pet", "PET_ID"]
    }
  }
}
```

Published mode caveat: `npx -y @open-pets/mcp@VERSION` may require npm/network access or an existing npm cache, and it executes the pinned npm package. The desktop UI should explain this, matching the style of existing OpenCode setup warnings.

Classify managed entries by:

- server name `openpets`;
- command path or package name;
- args containing `@open-pets/mcp@VERSION`, `@open-pets/mcp`, or packaged MCP entry;
- optional `--pet PET_ID` argument.

If a marker is truly needed, validate Cursor behavior first or use a documented `env` value only if Cursor MCP docs guarantee it is passed safely and harmlessly.

#### Config read/write safety

Phase 1 must match the defensive style used by existing OpenPets config writers:

- cap config file size before reading;
- read only regular files;
- reject symlinked config files and unsafe `.cursor` parents;
- parse strict JSON unless JSONC is verified;
- classify conflicts instead of overwriting unknown OpenPets-looking entries;
- preserve unrelated servers and fields;
- backup before writing;
- write with temp file plus atomic rename;
- avoid writing on parse errors, unsafe path errors, or classification errors.

#### Preview safety

Desktop and CLI previews must not display the user's full Cursor MCP config by default.

Safe preview options:

1. Show only the OpenPets entry that would be written.
2. If showing merged config is necessary, redact unrelated secrets and sensitive fields including `env`, `headers`, `auth`, `authorization`, `token`, `secret`, `password`, credentials, and token-bearing URLs.

### Phase 2: Cursor rules guidance

Add optional rules/instructions after MCP-only setup works.

Possible locations:

- project-local: `.cursor/rules/openpets.mdc`
- global/user instructions: if Cursor provides a safe editable user rules file or setting path
- `AGENTS.md`: only if user wants project instructions and understands it may affect other agents

Recommended default: offer project-local Cursor rules only, with preview and explicit install.

Example rule:

```md
---
description: OpenPets desktop companion guidance
alwaysApply: true
---

OpenPets is available through MCP tools.

- Use `openpets_react` for short coding-state reactions such as thinking, working, testing, success, or error.
- Use `openpets_say` only for short safe user-facing messages.
- Do not send secrets, credentials, private file contents, raw logs, stack traces, or token-bearing URLs to OpenPets.
- Prefer subtle reactions over frequent speech bubbles.
```

### Phase 3: Cursor hooks for ambient reactions

Add hooks only after MCP setup is stable and a hook validation spike is complete.

#### Required validation spike

Before implementation, verify:

- exact `hooks.json` schema;
- global/project hook precedence;
- hook payload fixtures for target events;
- stdout/stderr expectations;
- timeout behavior;
- fail-open/fail-closed behavior;
- trusted workspace behavior;
- whether hooks run locally, remotely, in WSL, or in a devcontainer for common setups.

#### New package recommendation

Create `packages/cursor` similar to `packages/claude`:

- hook payload parser;
- event-to-reaction mapper;
- command entry point for Cursor hooks;
- hook settings/config management;
- status/doctor helpers;
- tests with fixture payloads.

Possible commands:

```bash
openpets cursor-hook
```

or package binary:

```bash
open-pets-cursor-hook
```

#### Event mapping draft

| Cursor event | OpenPets behavior |
| --- | --- |
| `sessionStart` | `thinking` |
| `afterAgentThought` | `thinking` |
| `preToolUse` | classify tool; `editing`, `testing`, or throttled `working` only when useful |
| `postToolUse` | usually no reaction; `success` only for meaningful completion events |
| `postToolUseFailure` | `error` |
| `beforeMCPExecution` | usually no reaction; suppress OpenPets MCP self-calls |
| `afterMCPExecution` | usually no reaction; suppress OpenPets MCP self-calls |
| `beforeShellExecution` | classify test-like commands as `testing`; otherwise usually no reaction or throttled `working` |
| `afterShellExecution` success | usually no reaction; `success` only for meaningful completion events |
| `afterShellExecution` failure | `error` |
| `stop` completed | `success`, then idle naturally |
| `stop` aborted/error | `error` |

#### Hook behavior rules

- Hook handler must read bounded stdin.
- Must fail open and never block Cursor for long.
- Must not print noisy output unless Cursor expects structured output.
- Must avoid leaking prompt/file contents to logs or pet messages.
- Must never forward `prompt`, `text`, `tool_input`, `tool_output`, `command`, `transcript_path`, `user_email`, workspace paths, or file contents.
- Must suppress self-reactions for OpenPets MCP tools (`openpets_status`, `openpets_react`, `openpets_say`, and prefixed variants).
- Must throttle speech/reactions like existing Claude/OpenCode integrations.
- Must support lease routing for explicit selected pet.

### Phase 4: Extension/plugin polish

Consider after config and hook semantics are proven.

Possible benefits:

- dynamic MCP registration using `vscode.cursor.mcp.registerServer(...)`;
- packaged rules/hooks in a Cursor-friendly plugin format;
- better install/uninstall UX inside Cursor;
- less manual JSON editing.

Costs:

- extra package/distribution surface;
- extension compatibility maintenance;
- signing/marketplace or side-loading decisions;
- enterprise policy interactions.

## Desktop UI plan

Cursor should follow the existing Agent Setup card pattern.

Initial card states:

- `Checking`
- `Not installed`
- `Installed`
- `Needs update`
- `Conflict`
- `Error`

Initial actions:

- `Install integration`
- `Replace configuration`
- `Remove integration`
- `Refresh status`
- `Copy config preview`

Future optional actions:

- `Install rules`
- `Remove rules`
- `Install hooks`
- `Check hooks`
- `Remove hooks`
- `Open Cursor config folder`

## CLI plan

The CLI should eventually support:

```bash
openpets configure --agent cursor --pet PET_ID
openpets configure --agent cursor --cwd /path/to/project --pet PET_ID
openpets doctor --agent cursor
```

Follow existing `configure --agent claude/opencode` patterns where possible.

Initial scope recommendation:

- Desktop Agent Setup: global user config at `~/.cursor/mcp.json`.
- CLI `--cwd` mode: project-local config at `<cwd>/.cursor/mcp.json`, if project-local mode is included in Phase 1.

## Files and modules likely needed

### Phase 1 MCP config

Potential new package:

- `packages/cursor/`

Package/release plumbing likely needed:

- `packages/cursor/package.json`
- `packages/cursor/src/*`
- package `build`, `typecheck`, `test`, and `check` scripts
- `packages/cli/package.json` dependency on `@open-pets/cursor`
- `apps/desktop/package.json` dependency on `@open-pets/cursor`
- `pnpm-workspace.yaml` already covers `packages/*`, but release checks should include the package
- `scripts/release-npm.mjs` publish order update if `@open-pets/cursor` becomes public
- package/desktop contract checks for bundled runtime if desktop consumes it

Potential source modules:

- `cursor-mcp.ts`
  - build MCP entry;
  - parse `~/.cursor/mcp.json`;
  - classify setup status;
  - write/remove managed entry.
- `cursor-status.ts`
  - high-level status summary.
- `cursor-previews.ts`
  - command and JSON preview builders.
- `check-cursor.ts`
  - contract tests with temporary config files.

Desktop integration:

- `apps/desktop/src/agent-setup.ts`
  - add Cursor status/actions.
- `apps/desktop/src/windows.ts`
  - activate Cursor integration card and detail pane.
- `apps/desktop/preload.cjs`
  - bind Cursor setup actions.
- `apps/desktop/src/check-packaging-contract.ts`
  - assert Cursor assets/runtime/config paths.

CLI integration:

- `packages/cli/src/index.ts`
  - add `cursor` to agent choices and configure flow.

### Phase 3 hooks

Potential modules:

- `cursor-hooks.ts`
  - parse payloads;
  - map event names to reactions;
  - call OpenPets client;
  - throttle safely.
- `cursor-hook-settings.ts`
  - install/uninstall/doctor for `hooks.json`.
- `check-cursor-hooks.ts`
  - fixture-based tests.

## Open questions to verify during implementation

- Does Cursor tolerate unknown fields inside `mcpServers.<name>` entries?
- Does Cursor require restart after global/project MCP config changes?
- Does Cursor accept JSONC in MCP config, or strict JSON only?
- What is global/project MCP precedence when both define `openpets`?
- Exact current hook payload shapes for each event.
- Exact hook stdout/stderr, timeout, fail-open/fail-closed, and workspace trust behavior.
- Whether hook config supports global and project scopes exactly as documented across platforms.
- Whether hook commands receive environment variables that help identify workspace/session.
- Whether Cursor rules should be `.md`, `.mdc`, or both for current stable versions.
- Where Cursor executes MCP/hook commands in WSL, remote, and devcontainer setups.
- Whether a Cursor extension can be distributed easily enough to justify Phase 4.

## Security and privacy requirements

- Never log Cursor MCP tokens or permission secrets.
- Never show full Cursor config previews unless unrelated secrets are redacted.
- Do not write config without explicit user action.
- Preserve unrelated user config exactly where possible.
- Reject symlinked/non-regular config files and unsafe config parent directories.
- Enforce max config file size before reading.
- Use strict JSON unless JSONC support is verified.
- Do not write on parse/classification errors.
- Use atomic temp+rename writes.
- Backup before writes.
- Provide uninstall.
- Avoid auto-editing project files unless user selects project-local setup.
- Do not edit `~/.cursor/permissions.json` in Phase 1.
- Document WSL/remote/devcontainer caveats when MCP/hook commands may not reach desktop IPC.
- Hook payloads may contain paths, tool input, prompt text, or shell commands. Only extract safe metadata for logs and pet messages.
- Speech bubbles must not include secrets, raw logs, stack traces, private file contents, or token-bearing URLs.

## Recommended first implementation checklist

1. Validate strict JSON vs JSONC, restart behavior, and global/project precedence.
2. Decide command strategy: pinned `@open-pets/mcp@VERSION` direct command vs pinned `@open-pets/cli@VERSION mcp`.
3. Create `packages/cursor` with MCP config helpers only.
4. Add temp-file tests for Cursor MCP config read/classify/write/remove, including secret-redacted previews.
5. Add CLI `--agent cursor` MCP-only configure support using existing `--cwd` terminology.
6. Activate Cursor desktop card with MCP-only install/remove/preview.
7. Add internal docs updates, but do not mark public Cursor support active yet.
8. Ask Cursor users to confirm config works across macOS, Windows, Linux, WSL, and remote/devcontainer setups.
9. Add public docs and website updates marking Cursor MCP support active only after real Cursor smoke succeeds.
10. Only then run a hook validation spike.
11. Only then add hooks.

## References

- Cursor MCP docs: https://cursor.com/docs/mcp
- Cursor Rules docs: https://cursor.com/docs/rules
- Cursor Hooks docs: https://cursor.com/docs/hooks.md
- Cursor extension API: https://cursor.com/docs/extension-api
- Cursor plugins reference: https://cursor.com/docs/reference/plugins.md
- Cursor permissions reference: https://cursor.com/docs/reference/permissions
- Cursor security notes: https://cursor.com/docs/agent/security.md
