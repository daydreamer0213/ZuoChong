# packages/cli/

Main CLI tool for OpenPets agent configuration and pet management.

## Responsibility

Primary user-facing CLI for the OpenPets ecosystem. Provides commands for: installing pets from gallery, configuring projects for Claude/OpenCode agents, running MCP server wrapper, and executing Claude hooks.

## Design

**Command Router**: `main()` dispatches to subcommands based on `process.argv[2]`:
- `install <pet-id>` - Install pet via running app or direct download
- `configure` - Interactive project setup for Claude or OpenCode
- `mcp` - Spawn MCP server (delegates to `@open-pets/mcp`)
- `hook` - Execute Claude hook from stdin

**Configuration Flow** (`configureProject`):
1. Resolve project directory (symlink/escape checks)
2. Assert Claude availability (if agent=claude)
3. List installed pets, prompt for selection (if no `--pet`)
4. Build MCP command spec (published vs local dev mode)
5. For Claude: Write MCP config via `claude mcp add-json`, write hook settings
6. For OpenCode: Prepare and write OpenCode config via `@open-pets/opencode`

**Safety Checks**:
- Project path validation (no symlinks, must be directory)
- `.claude` directory safety (no symlinks, path containment)
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
```

## Integration Points

**Dependencies**:
- `@open-pets/client` - Pet listing, installation
- `@open-pets/claude` - Hook management, MCP config
- `@open-pets/mcp` - MCP server spawning
- `@open-pets/opencode` - OpenCode project setup

**External Commands**:
- `claude` - Claude Code CLI for MCP configuration
- `npx` - For published package execution

**Exports**:
- `cliPackageName` constant
- `configureProject()`, `resolveConfiguredPet()` - Programmatic API
- `parseConfigureArgs()`, `parseInstallArgs()` - Argument parsing
- `createVersionPinnedCliCommand()`, `createLocalDevCliCommand()` - Command builders
