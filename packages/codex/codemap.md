# Package: @open-pets/codex

## Responsibility

Connects Codex lifecycle hooks to OpenPets reactions and safely manages the
marker-owned hook block in `~/.codex/config.toml`.

## Design

- `open-pets-codex hook` reads one bounded JSON payload from stdin, classifies
  the event, throttles speech/reactions, and sends best-effort local IPC.
- Hook setup emits Codex array tables (`[[hooks.Event]]` and nested
  `[[hooks.Event.hooks]]`) with POSIX and Windows command fields.
- Install/remove operations preserve unrelated TOML, create timestamped
  backups, validate with `smol-toml`, reject conflicting marker blocks or
  symlinked paths, and replace the target atomically.
- Managed hooks cover session start, prompt submit, selected pre-tool calls,
  permission requests, and stop.

## Integration Points

- Depends on `@open-pets/client` for IPC and `@open-pets/agent-events` for safe
  speech pools.
- Exposes package APIs from `src/index.ts` and the `open-pets-codex` binary.
- Validation runs through `src/check-codex-hooks.ts`.

See [src/codemap.md](src/codemap.md) for the file map.
