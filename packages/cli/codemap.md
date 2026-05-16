# packages/cli/

Main CLI tool for OpenPets agent configuration and pet management.

## Responsibility

Primary user-facing CLI for the OpenPets ecosystem. Provides commands for: installing pets from gallery, configuring projects for Claude/OpenCode/Cursor agents, running MCP server wrapper, executing Claude hooks, and direct pet interaction (status, react, say).

## Design/Patterns

**Command Router**: `main()` dispatches to subcommands based on `process.argv[2]`:
- `install <pet-id>` - Install pet via running app
- `configure` - Interactive project setup for Claude, OpenCode, or Cursor
- `status` - Check OpenPets desktop app connectivity and print JSON status
- `pets` - List installed pets with flags (default, broken)
- `react <reaction>` - Send reaction to desktop app
- `say <message> [--reaction <reaction>]` - Display message on pet
- `mcp` - Spawn MCP server (delegates to `@open-pets/mcp`)
- `hook` - Execute Claude hook from stdin

**Configuration Flow** (`configureProject`):
1. Resolve project directory (symlink/escape checks)
2. Route to agent-specific handler (claude/opencode/cursor)
3. For Claude: Assert availability, list pets, build MCP config, write hooks
4. For OpenCode: Prepare and write OpenCode config via `@open-pets/opencode`
5. For Cursor: Configure MCP in `.cursor/mcp.json`, optional rules in `.cursor/rules/openpets.mdc`

**Cursor Configuration**:
- `--with-rules` - Install MCP + project rules
- `--rules-only` - Install only `.cursor/rules/openpets.mdc`
- `--remove-rules` - Remove managed rules file
- Status classification: `not_installed`, `installed`, `needs_update`, `conflict`, `error`
- Atomic writes with backup creation

**Safety Checks**:
- Project path validation (no symlinks, must be directory)
- `.claude`/`.cursor`/`.opencode` directory safety (no symlinks, path containment)
- Settings file atomic writes (temp + rename pattern)
- Shell argument quoting for command injection prevention

**Pet Resolution** (`resolveConfiguredPet`):
- Validates explicit `--pet` argument
- Otherwise: fetches installed pets, interactive TTY prompt
- Validates selected pet is not broken

## Flow

```
openpets configure --agent claude --pet <id> --cwd <dir>
    ↓
resolveProjectDir() → assertSafeProjectHookPath()
    ↓
assertClaudeAvailable() (spawnSync "claude --version")
    ↓
resolveConfiguredPet() → listPets() → pickPet() (interactive)
    ↓
prepareProjectLocalHooks() → Build hook command with marker
    ↓
runClaudeMcpAddJson() → spawnSync "claude mcp add-json ..."
    ↓
writePreparedHooks() → Atomic write to .claude/settings.local.json

openpets configure --agent cursor --with-rules
    ↓
readCursorMcpConfig() → classifyCursorMcpStatus()
    ↓
readCursorOpenPetsRules() → classifyCursorRulesStatus()
    ↓
planCursorMcpInstall/Replace() → executeCursorMcpWrite()
    ↓
planCursorRulesInstall/Replace() → executeCursorRulesWrite()

openpets status
    ↓
createOpenPetsClient().status() → Print JSON result
```

## Integration Points

**Dependencies**:
- `@open-pets/client` - Pet listing, installation, status, react, say
- `@open-pets/claude` - Hook management, MCP config
- `@open-pets/mcp` - MCP server spawning
- `@open-pets/opencode` - OpenCode project setup
- `@open-pets/cursor` - Cursor project setup (MCP + rules)

**External Commands**:
- `claude` - Claude Code CLI for MCP configuration
- `npx` - For published package execution

**Exports**:
- `cliPackageName` constant
- `configureProject()`, `resolveConfiguredPet()` - Programmatic API
- `parseConfigureArgs()`, `parseInstallArgs()`, `parseReactArgs()`, `parseSayArgs()` - Argument parsing
- `createVersionPinnedCliCommand()`, `createLocalDevCliCommand()` - Command builders
- `installProjectLocalHooks()`, `prepareProjectLocalHooks()` - Hook installation
- `runClaudeMcpAddJson()`, `createClaudeMcpAddJsonArgs()` - MCP integration
