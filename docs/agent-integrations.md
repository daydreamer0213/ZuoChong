# Agent Integrations & CLI

OpenPets reacts to coding agents. Each supported agent has an integration
package that does two jobs: **configure** the agent to talk to OpenPets, and at
runtime **translate** the agent's activity into safe pet reactions sent over
local IPC. This doc covers all five integrations (Claude Code, MCP, OpenCode,
Cursor, Pi), the shared speech-safety layer, and the CLI that orchestrates them.

For the wire protocol they all use, see [ipc.md](ipc.md). Source maps live in
each `packages/*/codemap.md`.

## The shared shape

Every integration follows the same contract, which is worth internalizing once:

- **Configuration is atomic and reversible.** Writes go through temp-file +
  rename with a backup first; paths are validated against traversal/symlink
  escape; managed entries are marked so they can be detected, updated, and
  removed without clobbering the user's own config. Status is always classified
  (`missing`/`installed`/`needs-update`/`conflict`/`invalid`/…), so the UI and
  CLI can offer the right action.
- **Runtime is fire-and-forget.** Agent events are classified into a reaction
  and/or a speech category, dispatched non-blocking, and any IPC failure is
  swallowed. The pet must never slow down or break the agent.
- **Speech is always safe.** Automatic messages come from validated pools (see
  below), never from raw prompt/output text.
- **Leases route the pet.** Integrations acquire a lease on first activity,
  heartbeat it, and release on shutdown. See the lease model in [ipc.md](ipc.md).

## Safe speech: `@open-pets/agent-events`

`packages/agent-events/` is the shared guardrail. It provides curated speech
pools by category — `thinking`, `success`, `error`, `permission` — and the
validators that keep messages safe: single line, 1–140 chars, and rejecting
code, URLs, file paths, and secret-like tokens. `pickHookSpeech(category)`
selects a message; `validateHookSpeech()` enforces the rules. `claude`,
`opencode`, and `pi` all depend on it so no integration can leak sensitive text
into a bubble.

## Claude Code — `@open-pets/claude`

The deepest integration, because Claude Code has a rich hook system.

- **MCP setup** (`claude-code.ts`): registers an MCP server named `openpets`
  using `claude mcp add/get/remove`. Command modes: `published`
  (`npx -y @open-pets/mcp`), `local`, `bundled` (ASAR-unpacked path). Paths are
  validated to stay within expected directories.
- **Hooks** (`hook-settings.ts` + `hooks.ts`): installs command hooks into
  `~/.claude/settings.json` for the lifecycle events `UserPromptSubmit`,
  `PreToolUse`, `PermissionRequest`, `Notification`, `Stop`, `StopFailure`. Each
  managed entry carries the `--openpets-managed` marker. `runClaudeHookFromStdin()`
  maps an event to a reaction: prompt submit → thinking, permission → waiting,
  stop → success, stop-failure → error, and `PreToolUse` is classified by tool
  (Edit/Write/MultiEdit → editing, Bash test commands → testing).
- **Project-local awareness**: if a project defines its own OpenPets hook
  (`.claude/settings.local.json` with `--project-local`), the global hook stands
  down to avoid double-firing.
- **Throttling**: ~20s speech / ~3s permission / ~10s reaction cooldowns via a
  JSON state file, so the pet doesn't chatter.
- **Memory**: the desktop's `claude-memory.ts` manages `~/.claude/openpets.md`
  (the instructions file telling Claude how to use the pet).

Doctor/install/uninstall helpers (`installClaudeHooks`, `doctorClaudeHooks`, …)
are what the Control Center Integrations page and the CLI call.

## MCP server — `@open-pets/mcp`

A standalone stdio MCP server (`open-pets-mcp`) for any MCP-capable agent. It
registers exactly three tools — `openpets_status`, `openpets_react`,
`openpets_say` — with Zod-validated input and read-only/idempotent annotations.
On startup it acquires a lease, heartbeats every ~5s, and releases on
SIGINT/SIGTERM. Errors are sanitized so IPC paths/tokens/sockets never leak into
tool output. It is spawned by the CLI (`runMcp()`) which forwards stdio and
signals. `--pet <id>` targets a specific pet.

## OpenCode — `@open-pets/opencode`

Ships both a config manager and a runtime plugin.

- **Config** (`opencode-config.ts`, JSONC-aware): manages `mcp`, `instructions`,
  and `plugin` arrays in the effective OpenCode config (project `.opencode/` or
  global `~/.config/opencode/`), choosing the right file among `config.json` /
  `opencode.json` / `opencode.jsonc` and preserving user arrays. Managed
  instruction blocks use `<!-- OPENPETS:START/END -->` markers. Full
  prepare/write/remove/doctor lifecycle.
- **Runtime** (`opencode-plugin-runtime.ts`, plugin id `open-pets-opencode`):
  hooks `event`, `chat.message`, `tool.execute.before/after`, classifies them to
  reactions/speech, manages a lease (renew with a 2s buffer), and applies the
  same throttle windows as Claude.

## Cursor — `@open-pets/cursor`

Pure file management for Cursor, no runtime hooks (Cursor drives the pet via the
MCP server). It manages the `openpets` entry in `mcp.json` (global
`~/.cursor/mcp.json` or project `.cursor/mcp.json`) and optional project rules at
`.cursor/rules/openpets.mdc`. Strong safety posture: strict JSON only, size caps
(256 KiB config / 64 KiB rules), symlink rejection at every path level, atomic
writes with backup, recursive redaction of sensitive keys/values, and refusal of
unpinned versions (`@latest`). Rules ownership requires an exact
`OPENPETS:CURSOR_RULES:START/END` marker pair. The desktop uses preview/copy;
the CLI writes project rules.

## Pi — `@open-pets/pi`

A Pi coding-agent extension (declared in `pi.extensions`). It maps Pi lifecycle
events (`session_start`, `agent_start`, `turn_start`, …) to reactions and
registers a `/openpets` slash command namespace (`status`, `test`,
`react <reaction>`, `say <message>`). MVP scope is default-pet-only and
non-blocking; it registers **no** model-callable tools, and never forwards
prompt/assistant/tool/command text, paths, URLs, or secrets.

## The CLI — `@open-pets/cli`

The user-facing front door (`openpets`), and the package that composes the
others. Commands:

| Command | Does |
|---------|------|
| `configure` | Configure Claude / OpenCode / Cursor for a project (atomic, safe-path) |
| `install <pet-id>` | Install a pet via the client |
| `status` | Print app/pet status JSON over IPC |
| `pets` | List installed pets |
| `react <reaction>` / `say <message>` | Drive the active pet |
| `mcp` | Launch the MCP stdio server |
| `hook` | Run a Claude Code lifecycle hook |
| `plugin validate <dir>` | Validate a plugin before install/release |
| `plugin new <name> --template <t>` | Scaffold an SDK v3 plugin |

The plugin subcommands are the author-side DX entry point — see
[plugins.md](plugins.md), [sdk.md](sdk.md), and [development.md](development.md).
The CLI enforces safe project paths and atomic config writes throughout.

## Quick orientation

| Agent | Config home | Runtime mechanism |
|-------|-------------|-------------------|
| Claude Code | `~/.claude/` (settings, MCP, `openpets.md`) | lifecycle hooks |
| MCP (generic) | agent's MCP config | stdio MCP tools |
| OpenCode | `.opencode/` or `~/.config/opencode/` | plugin event hooks |
| Cursor | `.cursor/mcp.json` + rules | MCP tools |
| Pi | `pi.extensions` | extension events + `/openpets` |
</content>
