# packages/mcp/src/

## Files

- **index.ts**: Main entry (99 lines). Argument parsing, lease acquisition, heartbeat management, signal handling, graceful shutdown.
- **server.ts**: MCP server factory (32 lines). `createOpenPetsMcpServer()` registers `openpets_status`, `openpets_react`, `openpets_say` tools with metadata.
- **tools.ts**: Tool implementations (181 lines). Zod schemas, `handleStatus()`, `handleReact()`, `handleSay()`, `createToolContext()`, `createMcpStatus()`, throttling integration, error sanitization.
- **args.ts**: CLI argument parsing (57 lines). `parseMcpArgs()`, `validatePetId()`, `createHelpText()`.
- **ensure-executable.ts**: Post-build chmod for Unix (9 lines).
- **check-mcp-contract.ts**: Contract validation (excluded from detailed documentation).
