# Phase 21 — Pi Integration Plan

## Goal

Add first-class OpenPets support for Pi through a dedicated Pi extension package, with desktop and docs visibility, while keeping the runtime local, safe, and non-blocking.

Target support means:

- Pi agent activity drives OpenPets reactions automatically.
- Pi users can install OpenPets with Pi's package system.
- Pi users can run a small `/openpets` command namespace for status and manual checks.
- OpenPets desktop can show Pi in Integrations using `apps/desktop/assets/integrations/pi.svg`.
- Public docs explain Pi setup as extension-first, not MCP-first.
- The integration never forwards prompts, assistant text, tool output, file contents, URLs, paths, or secrets by default.

## Current OpenPets integration model to mirror

OpenPets currently has three integration layers:

1. **Local IPC client**
   - Shared runtime bridge: `packages/client`.
   - Integrations use it to send reactions and speech to the desktop app.
   - Desktop routes explicit pet targets through lease-managed agent pets.

2. **Dedicated agent packages**
   - Claude Code: `packages/claude` for MCP setup, managed instructions, hooks, and hook event mapping.
   - OpenCode: `packages/opencode` for plugin runtime, config setup, previews, and project/global setup.

3. **Generic fallback**
   - `packages/mcp` exposes `openpets_status`, `openpets_react`, and `openpets_say` for stdio MCP clients.
   - `packages/cli` exposes scriptable direct commands.

Pi should follow the dedicated-package model. Generic MCP can remain a fallback, but it is not the best primary integration surface for Pi.

## Pi source findings

Pi's coding-agent package provides a rich extension and package system.

- Extensions can be auto-discovered from:
  - `~/.pi/agent/extensions/*.ts`
  - `~/.pi/agent/extensions/*/index.ts`
  - `.pi/extensions/*.ts`
  - `.pi/extensions/*/index.ts`
- Settings can load packages and extension paths:
  - `packages: ["npm:@foo/bar@1.0.0", "git:github.com/user/repo@v1"]`
  - `extensions: ["/path/to/local/extension.ts"]`
- `pi install` can install npm, git, URL, or local packages.
- Project-local package install uses `pi install -l` and writes `.pi/settings.json`.
- Pi packages can declare resources in `package.json` under a `pi` key:

```json
{
  "name": "@open-pets/pi",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./dist/extension.js"]
  }
}
```

- Useful extension events include:
  - `session_start`
  - `session_shutdown`
  - `agent_start`
  - `agent_end`
  - `turn_start`
  - `turn_end`
  - `message_start`
  - `message_update`
  - `message_end`
  - `tool_execution_start`
  - `tool_execution_update`
  - `tool_execution_end`
  - `tool_call`
  - `tool_result`
  - `input`
  - `user_bash`
- Extensions can register slash commands with `pi.registerCommand()`.
- Extensions can use `ctx.ui.notify()`, `ctx.ui.setStatus()`, widgets, and custom TUI pieces, but OpenPets should not require custom Pi UI for the first release.
- Pi extensions run with full local system permissions, so OpenPets docs must treat package trust as a security boundary.

## Recommended approach

Implement Pi as a dedicated package:

```text
packages/pi/
```

Published package:

```text
@open-pets/pi
```

Primary install flow:

```bash
pi install npm:@open-pets/pi
```

Project-local install flow:

```bash
pi install -l npm:@open-pets/pi
```

The package should export one Pi extension that uses `@open-pets/client` to send local IPC updates. It should not depend on MCP for core behavior.

## Package contract

Recommended `package.json` shape:

```json
{
  "name": "@open-pets/pi",
  "type": "module",
  "keywords": ["pi-package", "openpets", "coding-agent"],
  "exports": {
    ".": "./dist/index.js",
    "./extension": "./dist/extension.js"
  },
  "pi": {
    "extensions": ["./dist/extension.js"]
  },
  "dependencies": {
    "@open-pets/client": "workspace:*"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*"
  }
}
```

Notes:

- Confirm whether Pi requires `@earendil-works/pi-coding-agent`, `typebox`, or related Pi core packages as `peerDependencies` instead of bundled dependencies before publishing.
- Keep runtime dependencies minimal.
- Build output should be plain ESM JavaScript that Pi can load without TypeScript compilation.
- The extension should tolerate missing OpenPets desktop IPC and keep Pi startup/session flow unaffected.

## Runtime behavior

The extension should:

- Create a small OpenPets runtime wrapper around `@open-pets/client`.
- Cache connection status only briefly; do not assume the desktop app stays available.
- Use short timeouts for OpenPets calls.
- Run automatic event updates fire-and-forget.
- Swallow OpenPets IPC failures by default, with optional debug logging.
- Avoid long-lived timers unless needed for throttling cleanup.
- Clean up on `session_shutdown`.

If configured with a pet id, the package should request or reuse an agent-pet lease where practical. If lease behavior is too heavy for MVP, the first version may target the default pet and defer explicit pet routing to a later subphase.

## Event mapping

Default mapping should favor silent reactions over speech.

| Pi event | Condition | OpenPets reaction | Speech |
| --- | --- | --- | --- |
| `session_start` | Pi starts, resumes, or reloads. | `waving` | Optional short connected message, throttled. |
| `agent_start` | Agent loop begins. | `thinking` | None. |
| `turn_start` | New turn begins. | `working` | None. |
| `tool_execution_start` | Tool looks like edit, write, patch, or apply. | `editing` | None. |
| `tool_execution_start` | Tool or shell command looks test-like. | `testing` | None. |
| `tool_execution_start` | Shell/bash command, non-test. | `running` | None. |
| `tool_execution_start` | Other tool. | `working` | None. |
| `tool_execution_end` | Tool result is error. | `error` | Optional short error-pool message, throttled. |
| `agent_end` | Agent loop finishes. | `success` | None. |
| `session_shutdown` | Quit, reload, new, resume, or fork. | `idle` | None. |

Classification rules:

- Tool names may be inspected.
- Tool arguments may be inspected only for coarse classification, such as test detection.
- Never place raw tool arguments, command text, output, stack traces, prompt text, or assistant text in pet speech.
- Ignore OpenPets-related commands/tools to prevent self-trigger loops.

## Slash command namespace

Register one command namespace:

```text
/openpets
```

Suggested subcommands:

| Command | Behavior |
| --- | --- |
| `/openpets status` | Check whether the OpenPets desktop app is reachable and which pet is targeted. |
| `/openpets test` | Send a short safe test message and `waving` or `success` reaction. |
| `/openpets react <reaction>` | Set one allowed reaction. |
| `/openpets say <message>` | Show one validated short speech bubble. |
| `/openpets help` | Show available subcommands. |

Allowed manual reactions should match the public OpenPets reaction set:

```text
idle, thinking, working, editing, running, testing, waiting, waving, success, error, celebrating
```

Manual speech must use the same validation rules as other OpenPets surfaces:

- single line;
- short, user-facing, non-sensitive;
- no code, logs, paths, URLs, prompts, secrets, or raw errors.

## Safety and privacy requirements

The Pi integration must preserve the OpenPets safety model.

- No automatic prompt forwarding.
- No automatic assistant-message forwarding.
- No automatic tool-output forwarding.
- No automatic command-output forwarding.
- No file contents, URLs, file paths, diffs, logs, stack traces, secrets, or tokens in speech.
- Speech is rare and generated from fixed message pools or explicit user command input.
- Manual `/openpets say` input is validated before sending.
- OpenPets failures never block Pi model calls or tool execution.
- Pi package docs warn that Pi extensions run with local system permissions.

## Desktop integration UI

Desktop already has `apps/desktop/assets/integrations/pi.svg` available.

Implementation should:

- Add Pi to the bundled integration icon map in `apps/desktop/src/windows.ts`.
- Add `pi.svg` to the packaging contract in `apps/desktop/src/check-packaging-contract.ts`.
- Add a Pi card to the Integrations grid.
- Initially mark the card as planned/coming soon unless `@open-pets/pi` setup is implemented in the desktop app.
- If setup is implemented, expose a simple detail panel with:
  - Pi command detection, if practical;
  - install instructions using `pi install npm:@open-pets/pi`;
  - project-local install instructions using `pi install -l npm:@open-pets/pi`;
  - status/check guidance;
  - remove guidance using `pi remove npm:@open-pets/pi`.

Do not add risky desktop-managed writes to Pi settings until the package contract is stable. The first desktop release can be documentation/install-command oriented.

## Public docs

Add or keep a public integration guide at:

```text
web/content/en/integrations/pi.md
```

The page should explain:

- Pi uses an extension package, not MCP-first setup.
- OpenPets desktop must be running for pet updates.
- Global install command.
- Project-local install command.
- `/openpets` commands.
- Event-to-reaction mapping.
- Privacy model.
- Package trust warning.
- Current status if not yet released.

When `@open-pets/pi` is actually published and supported, update the frontmatter from planned/inactive to active/supported and link it from active integration surfaces.

## Non-goals

- Do not modify Pi upstream.
- Do not require MCP for Pi's automatic reactions.
- Do not add new public OpenPets MCP tools.
- Do not expose pet install/remove/default controls to the Pi model in MVP.
- Do not send raw prompts, assistant text, tool inputs, tool output, file paths, command output, logs, diffs, URLs, or secrets to pet speech.
- Do not build custom Pi TUI widgets in MVP.
- Do not make OpenPets availability affect Pi startup, model requests, or tool execution.

## Proposed subphase sequence

### Phase 21A — Pi Package Foundation

**Goal:** Add `packages/pi` with extension loading shape, shared event classification, command parsing, and no desktop UI changes beyond packaging contracts.

**Scope:**

- Add workspace package `@open-pets/pi`.
- Export a Pi extension entry compatible with Pi's package loader.
- Add a small OpenPets client wrapper with timeout and failure swallowing.
- Add event classification helpers.
- Add speech safety and throttling helpers, preferably reusing existing shared agent-event utilities where possible.
- Register `/openpets` command with `status`, `test`, `react`, `say`, and `help` subcommands.
- Add unit tests for command parsing, reaction validation, speech rejection, and event classification.

**Acceptance criteria:**

- Built extension can be imported from `dist/extension.js`.
- Extension factory returns quickly and does not require OpenPets desktop to be running.
- Automatic event handlers do not await IPC in a way that blocks Pi.
- `/openpets say` rejects unsafe text.
- Existing Claude/OpenCode/MCP behavior remains unchanged.

**Checks:**

- `pnpm --filter @open-pets/pi check`
- `pnpm --filter @open-pets/client check`
- `pnpm --filter @open-pets/agent-events check`

### Phase 21B — Pi Event Runtime and Manual Smoke Test

**Goal:** Verify the extension inside Pi and refine event mapping against real Pi behavior.

**Scope:**

- Install/load the local package in Pi using a local package path or `pi -e` flow.
- Confirm event names and payload shapes against the current Pi release.
- Confirm that handlers are safe in interactive, print, and non-interactive modes.
- Confirm that unavailable OpenPets desktop app does not produce noisy failures.
- Add a manual smoke-test checklist.
- Adjust mapping for any event names that differ from the researched API.

**Acceptance criteria:**

- Pi can load the local OpenPets extension.
- `/openpets status` reports reachable/unreachable clearly.
- Tool start/end events produce expected reactions when OpenPets is running.
- No prompts, outputs, or commands appear in pet speech during normal automation.
- Pi continues normally when OpenPets is closed.

**Checks:**

- `pnpm --filter @open-pets/pi check`
- Manual Pi smoke test with OpenPets running.
- Manual Pi smoke test with OpenPets closed.

### Phase 21C — Desktop Integration Card and Asset Wiring

**Goal:** Show Pi in desktop Integrations and ensure `pi.svg` is packaged safely.

**Scope:**

- Add `pi.svg` to `apps/desktop/src/windows.ts` integration icon data URLs.
- Add `pi.svg` to `apps/desktop/src/check-packaging-contract.ts` SVG safety list.
- Add Pi card to the Integrations grid.
- If desktop-managed install is not implemented, mark Pi as planned/manual and show install commands only.
- Add detail copy that explains global and project-local Pi package install commands.
- Ensure no desktop code edits Pi settings automatically unless explicitly added and tested.

**Acceptance criteria:**

- Packaging contract checks `pi.svg`.
- Desktop Integrations renders Pi with the uploaded asset.
- Pi card status accurately reflects whether setup is manual/planned or actively supported.
- No broken icon or missing asset in packaged builds.

**Checks:**

- `pnpm --filter @open-pets/desktop check`
- Desktop manual visual check of Integrations grid.

### Phase 21D — Public Docs, Release, and Support Status

**Goal:** Publish clear Pi setup docs and update support status only when package behavior is verified.

**Scope:**

- Update `web/content/en/integrations/pi.md` with final install commands and supported behavior.
- Update home/integration listings to active only after the package is released.
- Add README/release notes entry.
- Document tested Pi version or commit date.
- Add troubleshooting:
  - Pi package not loading;
  - OpenPets desktop unavailable;
  - commands work but automatic reactions do not;
  - removing global/project-local package install.

**Acceptance criteria:**

- Docs match actual package behavior.
- Privacy claims are backed by implementation behavior.
- Install/remove commands are reproducible.
- Release notes mention Pi support and package trust warning.

**Checks:**

- `pnpm --filter @open-pets/pi check`
- `pnpm --filter @open-pets/desktop check`
- Web docs build/check command for the web workspace.

## Open questions

- Should MVP support explicit `--pet` / selected pet routing, or should it target the default pet first?
- Does Pi's package loader prefer ESM-only packages, CJS-compatible exports, or both?
- Should `@earendil-works/pi-coding-agent` stay a peer dependency with `"*"`, or should the package pin/test a supported range?
- Can desktop safely run `pi install` for users, or should it remain manual until Pi settings semantics are stable?
- Should automatic `session_start` speech be disabled by default to avoid noise?
- Where should debug logging go for extension failures without polluting Pi output?

## Initial recommendation

Start with Phases 21A and 21B only. Keep desktop and public docs marked planned/manual until the extension package has been loaded in a real Pi session and event payloads are verified.

After that, wire the uploaded `pi.svg` into the desktop UI in Phase 21C and only mark the public integration as supported in Phase 21D.
