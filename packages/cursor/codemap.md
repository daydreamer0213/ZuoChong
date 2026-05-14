# Package: @open-pets/cursor

## Responsibility

Pure Node.js package for Cursor editor MCP configuration management. Provides helpers for detecting, installing, updating, and removing OpenPets MCP entries in Cursor's `mcp.json` config files.

## Entry Points

- `src/index.ts`: Public API exports
- `src/cursor-mcp.ts`: MCP entry builders and path utilities
- `src/cursor-status.ts`: Status classification and config read/write operations
- `src/cursor-previews.ts`: Config preview and redaction helpers
- `src/check-cursor.ts`: Contract validation tests

## Key Behaviors

### Config Paths
- Global: `<homeDir>/.cursor/mcp.json`
- Project: `<projectDir>/.cursor/mcp.json`
- Explicit `configPath` accepted by all APIs

### Safety Rules
- Strict JSON only (no JSONC)
- Max config size: 256 KiB
- Reject symlinks and non-regular files
- Validate parent directories before creating `.cursor`
- Atomic writes with temp files and backups
- Private file permissions (0o600) where supported

### Status Classification
- `missing`: No config or no openpets entry
- `installed`: Matching OpenPets entry
- `needs-update`: Old version or different pet
- `conflict`: Non-OpenPets openpets entry
- `invalid`: Parse error, oversized, unsafe path
- `error`: Unexpected I/O failure

### MCP Entry Format
```json
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@open-pets/mcp@VERSION", "--pet", "PET_ID"]
}
```

### Redaction
Recursive, case-insensitive redaction of: `env`, `headers`, `auth`, `authorization`, `token`, `secret`, `password`, `credentials`, and URLs with token-like query params.

## Exported APIs

### From cursor-mcp.ts
- `buildCursorMcpEntry(options)`: Build MCP entry object
- `formatCursorMcpConfig(options)`: Build full config with openpets entry
- `getCursorGlobalMcpPath(homeDir)`: Get global config path
- `getCursorProjectMcpPath(projectDir)`: Get project config path
- `validateOpenPetsPetId(id)`: Validate and return pet ID
- `isValidPetId(id)`: Check if pet ID is valid

### From cursor-status.ts
- `classifyCursorMcpStatus(result, path, expected)`: Classify config status
- `readCursorMcpConfig(path)`: Read and validate config file
- `planCursorMcpInstall(path, options, allowReplace?)`: Plan install operation
- `planCursorMcpReplace(path, options)`: Plan replace operation
- `planCursorMcpRemove(path)`: Plan remove operation
- `executeCursorMcpWrite(plan)`: Execute planned write atomically
- `isManagedOpenPetsMcpEntry(value)`: Check if entry is OpenPets-managed
- `maxCursorConfigBytes`: 256 KiB limit constant

### From cursor-previews.ts
- `buildOpenPetsOnlyPreview(options)`: Build OpenPets-only preview
- `redactCursorConfig(config)`: Redact sensitive fields from config

## Test Coverage

`check-cursor.ts` validates:
- Pet ID validation (valid/invalid patterns)
- MCP entry building (published/local modes)
- Config formatting
- Path helpers
- Missing config classification
- Empty config classification
- Installed status detection
- Needs-update status (old version, different pet)
- Conflict status (non-OpenPets entry)
- Invalid status (parse error, oversized, symlink)
- Non-object top-level config rejection
- Non-object mcpServers rejection
- Malformed mcpServers.openpets handling
- Backup creation
- Atomic write behavior
- Uninstall preserves unrelated entries
- No writes on invalid/error status
- No conflict write without explicit replace
- Explicit replace preserves unrelated servers/fields
- Recursive and case-insensitive redaction
- URL token parameter redaction
- Symlink parent rejection
- Empty mcpServers kept as empty object after remove
