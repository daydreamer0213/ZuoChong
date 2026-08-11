# packages/codex/src

## Files

- `cli.ts`: Routes `hook`, `doctor-hooks`, `install-hooks`, and
  `uninstall-hooks`.
- `hooks.ts`: Parses Codex payloads, maps events/tools to reactions, applies
  throttles, and dispatches IPC without blocking Codex.
- `hook-config.ts`: Builds managed TOML array tables, validates complete TOML
  and marker ownership, and performs safe install/doctor/remove operations.
- `hook-messages.ts`: Re-exports validated shared speech pools.
- `index.ts`: Public barrel exports.
- `check-codex-hooks.ts`: Runtime contract and config round-trip checks.
