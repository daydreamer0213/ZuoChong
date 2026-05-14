# Cursor Phase 1 Implementation Spec: MCP-Only Setup

This spec turns `docs/cursor-integration.md` into an implementation-ready Phase 1 plan. Phase 1 is intentionally MCP-only. Cursor hooks, rules installation, permission edits, and extension/plugin work are explicitly out of scope except for discovery/validation notes.

## Status

- **Scope:** Cursor MCP config support only.
- **Target UX:** Desktop Agent Setup global Cursor configuration. CLI support is optional; if included, it must follow existing project-oriented `configure` semantics unless an explicit `--global` flag is added.
- **Required before config writes ship:** validation tasks in this spec must be completed and recorded.
- **Oracle approval:** approved as implementation-ready for Phase 1, with validation spike as the first gated implementation step.

## Goals

1. Let users configure Cursor to use OpenPets MCP tools.
2. Preserve all unrelated Cursor config safely.
3. Provide clear status, preview, install, replace, remove, and doctor flows.
4. Avoid leaking unrelated Cursor secrets in previews, logs, or errors.
5. Keep implementation compatible with desktop and CLI by sharing pure Node helpers in a new `packages/cursor` package.

## Non-goals

- No Cursor hooks installation.
- No Cursor rules writing.
- No Cursor extension/plugin.
- No writes to `~/.cursor/permissions.json`.
- No broad Cursor app detection requirement.
- No automatic project file edits from desktop Agent Setup.

## Phase 1 deliverables

### Package

Create `packages/cursor` as a pure Node package with no Electron dependency.

Exports should include:

- status/classification helpers;
- MCP entry builders;
- preview builders;
- write/remove helpers;
- doctor-style validation helpers;
- shared types for desktop and CLI.

Helper APIs must accept explicit `configPath`, `homeDir`, or `projectDir` inputs where applicable so tests, desktop, and CLI never accidentally touch a real `~/.cursor` path unless explicitly requested.

Required package files:

- `packages/cursor/package.json`
- `packages/cursor/tsconfig.json`
- `packages/cursor/src/index.ts`
- `packages/cursor/src/cursor-mcp.ts`
- `packages/cursor/src/cursor-status.ts`
- `packages/cursor/src/cursor-previews.ts`
- `packages/cursor/src/check-cursor.ts`
- `packages/cursor/codemap.md` after implementation, if codemap workflow is updated.

Required package scripts:

- `build`
- `typecheck`
- `test`
- `check`

### Desktop

Activate Cursor in Agent Setup as a real integration card.

Desktop Phase 1 writes global user config only:

- `~/.cursor/mcp.json`

Desktop should not write project-local `.cursor/mcp.json` in Phase 1 unless a separate advanced UX is explicitly added.

Required desktop UX:

- Cursor card status.
- Cursor detail pane.
- pet selector.
- command mode or preview matching existing Claude/OpenCode patterns.
- install integration.
- replace configuration for conflicts.
- remove integration.
- refresh status.
- copy OpenPets-only config preview.
- warning that Cursor may need restart/reload.
- warning that published `npx` mode may need npm/network/cache availability.

Cursor status text must be **configuration status**, not “Cursor app installed” status, unless reliable app detection is implemented later.

### CLI

If CLI work is included in Phase 1, support:

```bash
openpets configure --agent cursor --pet PET_ID
openpets configure --agent cursor --cwd /path/to/project --pet PET_ID
```

CLI scope must match existing `configure` patterns:

- no `--cwd`: project-local `./.cursor/mcp.json` under `process.cwd()`;
- with `--cwd`: project-local `<cwd>/.cursor/mcp.json`.

Global CLI setup must require an explicit future flag such as `--global`. If global CLI setup is deferred, document that in help output and this spec.

### Release/package plumbing

Update:

- root workspace build/check coverage through existing `packages/*` workspace matching;
- `packages/cli/package.json` dependency on `@open-pets/cursor` if CLI consumes it;
- `apps/desktop/package.json` dependency on `@open-pets/cursor` if desktop consumes it;
- `scripts/release-npm.mjs` publish order if `@open-pets/cursor` is public;
- `apps/desktop/src/check-packaging-contract.ts` if bundled desktop runtime needs cursor helpers packaged.

## Validation spike before writes ship

Before any install/replace/remove action is enabled by default, validate and record results in `docs/cursor-integration.md` or a follow-up note.

Required validation:

1. Confirm Cursor accepts strict JSON in `~/.cursor/mcp.json` and `.cursor/mcp.json`. **Validated from docs:** Cursor documents MCP config as JSON.
2. Confirm whether Cursor accepts JSONC. **Validated from docs:** no JSONC evidence for MCP config; implementation must assume strict JSON.
3. Confirm whether Cursor requires restart/reload after MCP config changes. **Validated from docs:** manual install guidance says save file and restart Cursor.
4. Confirm global/project precedence when both define `mcpServers.openpets`. **Validated from docs:** global and project configs are merged; project scope takes priority.
5. Confirm duplicate `openpets` server behavior across scopes. **Partially validated:** project priority is documented; UI duplicate behavior has community reports and needs real smoke confirmation.
6. Confirm documented fields for stdio config: `type`, `command`, `args`, and optional supported fields such as `env` or `envFile` if needed. **Validated from docs:** use `type`, `command`, `args`, optional `env`, optional `envFile`; do not use `cwd` in MCP file entries unless later verified.
7. Confirm unknown fields are not needed. **Validated from docs:** unknown fields are not documented; do not write them in Phase 1.
8. Confirm whether command mode should prefer direct `@open-pets/mcp@VERSION` or `@open-pets/cli@VERSION mcp`. **Decision:** prefer direct pinned `@open-pets/mcp@VERSION` for Phase 1.
9. Smoke test a real Cursor MCP connection on at least one machine before marking active in docs. **Passed 2026-05-14:** global `~/.cursor/mcp.json` using direct pinned `@open-pets/mcp@2.0.6` showed connected in Cursor with 3 OpenPets tools enabled.

Do not code final entry builders beyond temporary validation helpers until the command strategy is chosen and recorded in the validation log.

## Command strategy

Phase 1 must use pinned package versions in durable config.

Two acceptable strategies:

### Option A: direct MCP package

```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@open-pets/mcp@2.0.6", "--pet", "PET_ID"]
}
```

Pros:

- direct package already exists;
- smaller command path;
- aligns with the actual MCP server package.

Cons:

- durable config points at `npx` and may need npm/network/cache;
- published version must be updated when OpenPets upgrades.

### Option B: CLI wrapper

```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@open-pets/cli@2.0.6", "mcp", "--pet", "PET_ID"]
}
```

Pros:

- one public user-facing package can own command compatibility;
- may align better with future CLI setup/diagnostics.

Cons:

- extra package layer;
- ensure CLI MCP wrapper is stable and quiet for stdio use.

Phase 1 command decision: use direct pinned `@open-pets/mcp@VERSION` in durable configs. Do not ship unpinned `@open-pets/mcp` in durable config unless release policy explicitly accepts floating latest.

## Config model

Cursor MCP config path:

- global: `~/.cursor/mcp.json`
- project-local: `<cwd>/.cursor/mcp.json`

Expected top-level shape:

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

OpenPets must write only documented fields in Phase 1. No `openpets` metadata object, comments, or custom marker fields.

## Status classification

Define statuses with enough detail for desktop, CLI, and tests.

Suggested status union:

- `missing`: config file or `mcpServers.openpets` does not exist.
- `installed`: managed-looking OpenPets entry matches expected command mode and selected pet.
- `needs-update`: OpenPets entry exists but package version, command, args, or pet id differs from expected managed output.
- `conflict`: `mcpServers.openpets` exists but does not look like an OpenPets-managed entry.
- `invalid`: config exists but is too large, not regular, symlinked, unsafe, or parse-invalid.
- `error`: unexpected I/O or classification failure.

### Status/action matrix

| Status | canInstall | canReplace | canRemove | Write behavior |
| --- | --- | --- | --- | --- |
| `missing` | yes | no | no | Install may create config and add `mcpServers.openpets`. |
| `installed` | no | no | yes | Remove may delete only `mcpServers.openpets`; install is no-op. |
| `needs-update` | yes | yes | yes | Install/update may replace the recognized OpenPets entry with expected output; remove may delete only the recognized OpenPets entry. |
| `conflict` | no | yes | no | Replace may overwrite `mcpServers.openpets` only after explicit user confirmation; remove is disallowed because ownership is unknown. |
| `invalid` | no | no | no | No writes. User must fix config/path manually. |
| `error` | no | no | no | No writes. User must retry or inspect diagnostics. |

Action labels should be clear:

- `missing`: “Install integration”.
- `needs-update`: “Update integration” or “Replace managed entry”.
- `conflict`: “Replace conflicting entry”.
- `installed`: “Remove integration”.

Classification should return:

- status;
- human-readable message;
- target config path;
- whether install is available;
- whether replace is available;
- whether remove is available;
- OpenPets-only preview entry;
- redacted details only.

## Managed entry detection

Since Phase 1 writes no custom marker, managed-looking detection is structural:

- server key is exactly `openpets`;
- `type` is `stdio`;
- command/args match one of the accepted OpenPets command strategies;
- args include a pinned OpenPets package or a bundled/local OpenPets MCP entry;
- optional `--pet PET_ID` is recognized and validated.

Unknown `openpets` entries should be `conflict`, not overwritten without explicit replace.

## Schema validation

Before classification or writing:

- top-level config must be an object;
- `mcpServers`, if present, must be an object;
- `mcpServers.openpets`, if present, must be an object;
- for an OpenPets-managed entry, `type` must be `stdio`;
- for an OpenPets-managed entry, `command` must be a string;
- for an OpenPets-managed entry, `args` must be an array of strings;
- malformed non-OpenPets `mcpServers.openpets` should classify as `conflict` if the surrounding config is otherwise safe;
- malformed top-level config or malformed `mcpServers` should classify as `invalid`;
- no writes are allowed for `invalid` or `error`;
- no writes are allowed for `conflict` except explicit replace of only `mcpServers.openpets` after user confirmation.

## Read safety

Implement config reads defensively:

- Resolve target path from global home or validated `--cwd`.
- Validate nearest existing parent before creating `.cursor`.
- Reject symlink config file.
- Reject non-regular config file.
- Enforce max file size before reading. Suggested maximum: 256 KiB.
- Parse strict JSON unless JSONC support is validated.
- Treat empty/missing config as `{ "mcpServers": {} }` for preview only.
- Existing empty config files are `missing` and installable if the file path is otherwise safe; install should replace the empty file with a valid object containing `mcpServers.openpets`.
- Do not write after parse or safety errors.

## Write safety

Implement config writes defensively:

- Require explicit install/replace/remove action.
- Preserve unrelated top-level fields and unrelated MCP servers.
- Backup existing config before overwrite.
- Write temp file in same directory.
- Use atomic rename.
- Use private/safe permissions where supported.
- If creating `.cursor`, create it only after validating nearest existing parent.
- Do not follow symlinks.
- Remove only `mcpServers.openpets` on uninstall.
- If removing leaves `mcpServers` empty, keep or remove `mcpServers` consistently and document behavior.

## Preview and diagnostics safety

Default preview must show only the OpenPets entry that would be written.

Do not display the full merged Cursor config unless all unrelated sensitive fields are redacted.

Sensitive fields to redact:

- `env`
- `headers`
- `auth`
- `authorization`
- `token`
- `secret`
- `password`
- credentials
- URLs with token-like query parameters

Logs should include status and path metadata only. Do not log full config contents.

## Desktop UX details

### Card

Replace the current Cursor “Soon” card with active status.

Possible labels:

- `Checking`
- `Not configured`
- `Configured`
- `Needs update`
- `Conflict`
- `Config error`

### Detail pane

Sections:

1. Status summary.
2. Pet routing selector.
3. Command mode and warnings.
4. Install/replace/remove actions.
5. OpenPets-only MCP preview.
6. Restart/reload note.

### Warnings

Include:

- “Cursor may need to be restarted or reloaded after MCP config changes.”
- “Published mode uses `npx` and may require npm/network/cache access.”
- “OpenPets only edits its own `mcpServers.openpets` entry.”

## CLI UX details

If included:

```bash
openpets configure --agent cursor --pet PET_ID
openpets configure --agent cursor --cwd /path/to/project --pet PET_ID
```

CLI should print:

- target config path;
- status before write;
- OpenPets-only preview;
- backup path if written;
- restart/reload note;
- command to remove or repair.

CLI must not print unrelated Cursor config secrets.

If CLI support is included in Phase 1, it must not make no-`--cwd` mean global only for Cursor. Use project-local default or add an explicit `--global` flag.

## Tests

### Package tests

`packages/cursor/src/check-cursor.ts` should cover:

- missing config classification;
- empty config classification;
- existing unrelated MCP servers preserved;
- installed status for expected OpenPets entry;
- needs-update status for old package version;
- needs-update status for different pet id;
- conflict status for non-OpenPets `mcpServers.openpets`;
- invalid status for parse error;
- invalid status for oversized file;
- symlink rejection;
- non-regular file rejection if feasible in temp tests;
- backup creation;
- atomic write result;
- uninstall removes only OpenPets entry;
- preview redacts or excludes unrelated secrets.
- non-object top-level config;
- non-object `mcpServers`;
- malformed `mcpServers.openpets`;
- no write on `invalid`;
- no write on `conflict` unless explicit replace;
- explicit replace overwrites only `mcpServers.openpets` and preserves unrelated servers/top-level fields;
- recursive and case-insensitive redaction.

### Desktop contract tests

Update `apps/desktop/src/check-packaging-contract.ts` to assert:

- Cursor card is active, not `Soon`.
- Cursor detail pane exists.
- Cursor actions are bound in preload.
- `@open-pets/cursor` runtime is packaged if desktop imports it.
- Cursor icon remains bundled.

### CLI tests

Update CLI contract checks to assert:

- `cursor` is an accepted configure agent;
- `--cwd` project-local path maps to `.cursor/mcp.json`;
- no-`--cwd` Cursor configure uses the same project default semantics as existing configure agents, unless explicit `--global` is implemented;
- preview does not include unrelated secrets.

## Implementation sequence

1. Run validation spike for JSON/JSONC, restart behavior, precedence, duplicate names, and command strategy.
2. Create `packages/cursor` with pure helpers and tests.
3. Add CLI support if included in Phase 1.
4. Add desktop Agent Setup status/actions/detail pane.
5. Add contract tests.
6. Run `pnpm check`.
7. Dogfood with real Cursor MCP config.
8. Ask external Cursor users to confirm on macOS/Windows/Linux.
9. Update public docs only after real Cursor smoke succeeds.

## Out-of-scope backlog

- Cursor rules install/remove.
- Cursor hooks install/remove/doctor.
- Cursor extension/plugin.
- Cursor permissions management.
- Duplicate global/project config auto-resolution beyond clear status messaging.

## Open questions for validation log

Record answers here before implementation ships:

| Question | Result | Date | Notes |
| --- | --- | --- | --- |
| Strict JSON or JSONC? | Strict JSON for implementation | 2026-05-14 | Cursor MCP docs describe JSON config; JSONC is not documented for MCP config. |
| Restart/reload required? | Restart/reload required for reliable pickup | 2026-05-14 | Cursor manual MCP install docs say save file and restart Cursor. |
| Global/project precedence? | Project config takes priority | 2026-05-14 | Cursor docs state global/project configs are merged with project priority. |
| Duplicate server behavior? | Project priority documented; UI duplicate reports exist | 2026-05-14 | Avoid writing both scopes for same user path; desktop uses global only in Phase 1. |
| Documented stdio fields? | `type`, `command`, `args`, optional `env`, optional `envFile` | 2026-05-14 | `cwd` is not documented for MCP file entries. |
| Unknown fields? | Avoid in Phase 1 | 2026-05-14 | No official tolerance guarantee. |
| Command strategy chosen? | Direct `@open-pets/mcp@VERSION` | 2026-05-14 | Smaller process surface and aligns with existing MCP package. |
| WSL/remote/devcontainer behavior? | Caveat required | 2026-05-14 | No clear official MCP execution-location guarantee; document local command environment requirements. |
| Real Cursor MCP smoke result? | Passed | 2026-05-14 | Global `~/.cursor/mcp.json` using direct pinned `@open-pets/mcp@2.0.6` showed connected in Cursor with 3 OpenPets tools enabled. |
