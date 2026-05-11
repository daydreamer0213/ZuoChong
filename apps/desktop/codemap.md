# apps/desktop/

## Responsibility

OpenPets desktop companion application. Tray-first Electron app providing animated desktop pets that react to coding agent events. Manages pet installations, agent integrations (Claude Code, OpenCode), and local IPC for CLI communication.

## Design

- **Tray-First UX**: No main window; all interaction via tray menu or task windows (pet-manager, agent-setup, settings, onboarding)
- **Single Instance**: Uses `app.requestSingleInstanceLock()` with second-instance focusing
- **Security Model**: 
  - Sandboxed renderers with contextIsolation
  - Preload scripts expose limited APIs via `contextBridge`
  - CSP: `default-src 'none'`, inline styles only
  - Mock keychain to prevent OS credential prompts
- **State Management**: File-based JSON state with atomic writes (temp + rename)
- **Pet Architecture**: 
  - Default pet (always visible when enabled)
  - Agent pets (lease-based, appear on explicit agent requests)
  - Built-in fallback pet (bundled spritesheet)
- **Lease Manager**: 15s TTL leases for agent pet routing with heartbeat renewal

## Flow

**Startup**: `main.ts` → `installAppLifecycle()` → `initializeAppState()` → `createAppTray()` → `startLocalIpcServer()` → optionally `showDefaultPet()`/`openTaskWindow("onboarding")`

**Pet Display**: IPC Request → `local-ipc.ts` → `LeaseManager.acquire()` → `agent-pet-controller.ts` → `pet-window.ts` → HTML/CSS spritesheet animation

**Installation**: Catalog fetch → ZIP download → `yauzl` extraction → validation → state update → tray refresh

**Agent Setup**: UI → `agent-setup.ts` → Claude/OpenCode CLI detection → MCP config modification → hooks installation → memory file management

## Integration Points

- **Workspace Packages**: `@open-pets/claude` (MCP/hooks), `@open-pets/opencode` (global setup), `@open-pets/cli` (bundled commands)
- **External Services**: 
  - `https://openpets.dev/pets/catalog.v2.json` (pet catalog)
  - `https://zip.openpets.dev/pets/{id}.zip` (pet downloads)
  - GitHub API (release checks)
- **System Integration**:
  - Claude Code: `~/.claude/CLAUDE.md`, `~/.claude/settings.json`, `claude mcp` commands
  - OpenCode: `~/.opencode/config.json`
  - Codex: `~/.codex/pets/` (local pet development)
  - IPC: Discovery file at platform-specific path, Unix socket/Windows named pipe
- **Build**: `electron-builder` with ASAR, cross-platform (macOS/Windows/Linux)

## Key Files

- `main.ts`: Entry point, lifecycle coordination
- `tray.ts`: System tray icon and menu
- `windows.ts`: Task window management (pet-manager, agent-setup, settings, onboarding)
- `local-ipc.ts`: TCP/Unix socket server for CLI communication
- `lease-manager.ts`: Pet routing lease lifecycle
- `pet-window.ts`: Pet rendering (transparent frameless windows, CSS sprite animation)
- `default-pet-controller.ts`/`agent-pet-controller.ts`: Pet visibility/state management
- `app-state.ts`: Persistent state management (JSON file)
- `agent-setup.ts`: Claude/OpenCode integration logic
- `pet-installation.ts`: Catalog ZIP download and extraction
- `codex-pets.ts`: Local Codex pet import
- `catalog.ts`: Remote catalog fetching with fixture fallback
- `preload.cjs`/`pet-preload.cjs`: Renderer preload scripts (contextBridge APIs)
- `electron-builder.yml`: Packaging configuration
- `scripts/release-local.mjs`: macOS-local release automation with GitHub draft creation
