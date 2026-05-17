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
  - IPC network security: loopback/private address filtering for TCP mode
- **State Management**: File-based JSON state with atomic writes (temp + rename)
- **Pet Architecture**: 
  - Default pet (always visible when enabled)
  - Agent pets (lease-based, appear on explicit agent requests)
  - Built-in fallback pet (bundled spritesheet)
  - Speech bubbles with reaction messages and status badges
  - User-configurable reaction-to-animation mapping
- **Lease Manager**: 15s TTL leases for agent pet routing with heartbeat renewal
- **Logging**: Structured logging with scopes, log rotation (2MB max), and sensitive data redaction

## Flow

**Startup**: `main.ts` → `installAppLifecycle()` → `initializeAppState()` → `initializeLogger()` → `createAppTray()` → `startLocalIpcServer()` → optionally `showDefaultPet()`/`openTaskWindow("onboarding")`

**Pet Display**: IPC Request → `local-ipc.ts` → `LeaseManager.acquire()` → `agent-pet-controller.ts` → `pet-window.ts` → HTML/CSS spritesheet animation with reaction-to-animation mapping

**Installation**: Catalog fetch (V3 with pagination fallback to V2) → ZIP download → `yauzl` extraction → validation → state update → tray refresh

**Agent Setup**: UI → `agent-setup.ts` → Claude/OpenCode/Cursor CLI detection → MCP config modification → hooks installation → memory file management

## Integration Points

- **Workspace Packages**: `@open-pets/agent-events`, `@open-pets/claude`, `@open-pets/cli`, `@open-pets/cursor`, `@open-pets/mcp`, `@open-pets/opencode`
- **External Services**: 
  - `https://openpets.dev/pets/catalog.v2.json` (pet catalog V2)
  - `https://openpets.dev/pets/catalog.v3.json` (pet catalog V3 with pagination)
  - `https://zip.openpets.dev/pets/{id}.zip` (pet downloads)
  - GitHub API (release checks)
- **System Integration**:
  - Claude Code: `~/.claude/CLAUDE.md`, `~/.claude/settings.json`, `claude mcp` commands
  - OpenCode: `~/.opencode/config.json`
  - Cursor: `~/.cursor/mcp.json`, `.cursor/rules/openpets.mdc`
  - Codex: `~/.codex/pets/` (local pet development)
  - IPC: Discovery file at platform-specific path, Unix socket/Windows named pipe/TCP
  - Logs: `userData/logs/openpets.log`
- **Build**: `electron-builder` with ASAR, cross-platform (macOS/Windows/Linux)

## Key Files

- `main.ts`: Entry point, lifecycle coordination
- `tray.ts`: System tray icon and menu
- `windows.ts`: Task window management (pet-manager, agent-setup, settings, onboarding)
- `local-ipc.ts`: TCP/Unix socket server for CLI communication
- `lease-manager.ts`: Pet routing lease lifecycle
- `pet-window.ts`: Pet rendering (transparent frameless windows, CSS sprite animation, speech bubbles, status badges)
- `default-pet-controller.ts`/`agent-pet-controller.ts`: Pet visibility/state management with transient displays
- `app-state.ts`: Persistent state management (JSON file)
- `agent-setup.ts`: Claude/OpenCode/Cursor integration logic
- `pet-installation.ts`: Catalog ZIP download and extraction
- `codex-pets.ts`: Local Codex pet import
- `catalog.ts`: Remote catalog fetching with V3 pagination and fixture fallback
- `logger.ts`: Structured logging with scopes (app, ipc, lease, pet, state, tray, ui)
- `reaction-animation-mapping.ts`: Reaction-to-animation state mapping with user overrides
- `reaction-messages.ts`: Message pools for each reaction type
- `preload.cjs`/`pet-preload.cjs`: Renderer preload scripts (contextBridge APIs)
- `electron-builder.yml`: Packaging configuration
- `scripts/release-local.mjs`: macOS-local release automation with GitHub draft creation
- `contracts/catalog-fixture.contract.ts`: Catalog V2 validation contract tests against fixture data
- `contracts/local-ipc-protocol.contract.ts`: IPC protocol validation contract tests for request/response parsing

## Test Structure

- **Behavior tests** (`tests/*.test.ts`): Unit tests for lease manager, state management, version checking, ZIP safety, Codex pets, Claude memory, and reaction animation mapping. Compiled to `.test-dist/tests/`.
- **Contract tests** (`contracts/*.contract.ts`): Public API boundary validation for catalog fixtures and IPC protocol. Compiled to `.test-dist/contracts/`.
- **Runtime checks** (`src/check-*.ts`): Remaining runtime validation checks compiled to `dist/`.
- **Test runner** (`scripts/run-tests.mjs`): Orchestrates preload syntax checks → test compilation → behavior tests → contract tests → dist checks.
