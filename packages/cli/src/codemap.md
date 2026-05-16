# packages/cli/src/

TypeScript source files for the OpenPets CLI.

## Files

### index.ts

Main CLI entry point (625 lines). Command routing, argument parsing, project configuration, and all CLI operations.

**Commands:**
- `install <pet-id>` - Install pet via running desktop app
- `configure` - Interactive project setup for Claude, OpenCode, or Cursor
- `status` - Check OpenPets desktop app connectivity
- `pets` - List installed pets
- `react <reaction>` - Send reaction to desktop app
- `say <message> [--reaction <reaction>]` - Display message on pet
- `mcp [--pet <id>]` - Spawn MCP server wrapper
- `hook` - Execute Claude hook from stdin

**Configuration Flow:**
- `configureProject()` - Main entry for project setup
- `configureCursorProject()` - Cursor MCP + rules configuration
- `configureOpenCodeProject()` - OpenCode config setup
- Claude: Hook settings + MCP via `claude mcp add-json`

**Safety Checks:**
- `resolveProjectDir()` - Symlink/escape validation
- `assertSafeProjectHookPath()` - `.claude` directory safety
- `assertClaudeAvailable()` - Claude CLI presence check
- Atomic file writes with temp + rename pattern

**Exports:**
- `cliPackageName` - Package identifier constant
- `configureProject()`, `resolveConfiguredPet()` - Programmatic API
- `parseConfigureArgs()`, `parseInstallArgs()`, `parseReactArgs()`, `parseSayArgs()` - Argument parsers
- `createVersionPinnedCliCommand()`, `createLocalDevCliCommand()` - Command builders
- `installProjectLocalHooks()`, `prepareProjectLocalHooks()` - Hook installation
- `runClaudeMcpAddJson()`, `createClaudeMcpAddJsonArgs()` - MCP integration

### check-cli-contract.ts

Contract validation and integration tests (281 lines). Runtime assertions for CLI behavior.

**Test Coverage:**
- Argument parsing validation for all commands
- Command builder output verification
- Pet resolution (explicit vs interactive)
- Project hook installation and updates
- Claude MCP integration (mocked)
- OpenCode project configuration scenarios
- Cursor project configuration (MCP + rules)
- Error handling and edge cases

**Safety Tests:**
- Symlink detection and rejection
- Path traversal prevention
- Settings file atomic writes
- Backup creation verification

**Integration Tests:**
- OpenCode: Top-level vs `.opencode/` config precedence
- OpenCode: Existing config preservation
- OpenCode: Custom MCP conflict detection
- Cursor: MCP config installation
- Cursor: Rules-only and remove-rules modes
- Cursor: Conflict detection with --force
