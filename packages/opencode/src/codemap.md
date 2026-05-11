# packages/opencode/src/

## Files

- **index.ts**: Barrel export (6 lines). Re-exports all public modules.
- **plugin.ts**: OpenCode plugin definition (10 lines). Default export with `id` and `server` factory.
- **opencode-plugin-runtime.ts**: Plugin hook implementations (229 lines). `createOpenPetsOpenCodeHooks()`, event classification, tool reaction mapping, lease management, throttling.
- **opencode-config.ts**: Config file management (221 lines). Path resolution, JSONC parsing, safe file operations, atomic writes with backups.
- **opencode-project-setup.ts**: Project-level setup (182 lines). `prepareOpenCodeProjectSetup()`, `writePreparedOpenCodeProjectSetup()`, instruction block management.
- **opencode-global-setup.ts**: Global setup management (354 lines). `prepareOpenCodeGlobalSetup()`, cleanup writes, doctor command, global state classification.
- **opencode-status.ts**: Status classification (136 lines). `classifyOpenCodeMcpStatus()`, `classifyOpenCodeInstructionsStatus()`, `classifyOpenCodePluginStatus()`, entry detection functions.
- **opencode-previews.ts**: Config entry builders (52 lines). `buildOpenCodeMcpEntry()`, `buildOpenCodePluginPreview()`, `buildOpenCodeInstructionPath()`, `validateOpenPetsPetArg()`.
- **check-opencode-foundation.ts**: Contract validation (excluded from detailed documentation).
- **check-opencode-plugin.ts**: Plugin contract validation (excluded from detailed documentation).
