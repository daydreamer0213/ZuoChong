# apps/

## Responsibility

Container for deployable application packages. Currently hosts the OpenPets desktop Electron application. Acts as the integration layer between workspace packages (`packages/`) and user-facing applications.

## Design

- **Monorepo App Pattern**: Each subdirectory is an independently buildable/deployable application
- **Workspace Dependencies**: Apps consume shared packages via `workspace:*` protocol (pnpm)
- **Electron-First Architecture**: Desktop app uses Electron with tray-centric UX (no traditional main window)
- **Security-First**: CSP headers, sandboxed renderers, context isolation, no nodeIntegration

## Flow

1. Apps bootstrap from `main.ts` entry points
2. State flows: User Data → App State → UI Windows → Tray Menu
3. IPC flows: Agent Tools → Local IPC Server → Lease Manager → Pet Controllers → Window Updates
4. Pet display flows: Catalog/Codex → Installation → State → Window Rendering

## Integration Points

- **packages/**: Consumes `@open-pets/agent-events`, `@open-pets/claude`, `@open-pets/cli`, `@open-pets/mcp`, `@open-pets/opencode`
- **External**: GitHub Releases API (update checks), openpets.dev (catalog), zip.openpets.dev (pet downloads)
- **System**: Claude Code CLI, OpenCode CLI, OS tray/dock, file system (userData, ~/.codex, ~/.claude)
