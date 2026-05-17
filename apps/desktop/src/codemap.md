# apps/desktop/src/

## Responsibility

Core TypeScript source for the OpenPets desktop application. Organized into: lifecycle management, state persistence, UI windows, pet rendering, IPC server, agent integrations, and pet installation/management.

## Design

- **Modular Controllers**: Separate controllers for default pet vs agent pets (lease-based)
- **Protocol-First IPC**: Versioned JSON protocol over TCP/Unix sockets with token auth
- **Defensive I/O**: All file operations use temp+rename for atomicity, path traversal validation, symlink checks
- **Validation at Boundaries**: Catalog, ZIP entries, pet metadata, and IPC params all strictly validated
- **Lease Pattern**: Agent pets use expiring leases (15s TTL) with heartbeats; default pet is persistent
- **Sandboxed HTML**: All UI is data-URL or file-URL HTML with inline CSS, no external resources
- **Structured Logging**: Scoped logging (app, ipc, lease, pet.*, state, tray, ui) with log rotation and redaction
- **Reaction Animation Mapping**: User-configurable mapping from reaction types to sprite animation states

## Flow

**Main Process Flow**:
```
main.ts
├── lifecycle.ts (app events, cleanup)
├── logger.ts (structured logging init)
├── app-state.ts (state init)
├── tray.ts (tray creation)
├── local-ipc.ts (IPC server start)
└── windows.ts (UI handlers)
```

**IPC Request Flow**:
```
local-ipc.ts → parseIpcRequest() → handleRequest()
├── hello/status/pets.list/pets.install
└── lease.acquire/heartbeat/release
    └── lease-manager.ts
        ├── resolveTarget() (default vs explicit pet)
        ├── onFirstExplicitLease → agent-pet-controller.showAgentPet()
        └── onLastExplicitLease → agent-pet-controller.closeAgentPetIfOpen()
        └── Logging via logger.ts (ipc, lease scopes)
```

**Pet Display Flow**:
```
pet-window.ts
├── createDefaultPetWindow() / createAgentPetWindow()
├── loadDefaultPetContent() / loadExplicitPetContent()
│   ├── HTML generation with CSS sprite animation
│   ├── reaction-animation-mapping.ts (resolveReactionSpriteState)
│   ├── reaction-messages.ts (pickReactionMessage for bubbles)
│   └── Speech bubbles with status badges
└── pet-preload.cjs (renderer IPC for drag/click-through)
```

**Agent Setup Flow**:
```
windows.ts (IPC handlers)
└── agent-setup.ts
    ├── detectClaudeCodeStatus() (claude --version, claude mcp list)
    ├── runAgentSetupAction()
    │   ├── configure/replace/remove (MCP commands)
    │   ├── install-memory (claude-memory.ts)
    │   └── install-hooks/uninstall-hooks/doctor-hooks (@open-pets/claude)
    ├── OpenCode global config management (@open-pets/opencode)
    └── Cursor global MCP config management (@open-pets/cursor)
```

**Pet Installation Flow**:
```
pet-installation.ts
├── installPet()
│   ├── getCatalogPet() → catalog.ts
│   ├── downloadPetZip() → validate ZIP magic
│   ├── extractPetZip() → yauzl with entry validation
│   └── installPetState() → app-state.ts
└── importCodexPet() → codex-pets.ts
```

## Integration Points

- **Within src/**:
  - `main.ts` → all modules (orchestrator)
  - `local-ipc.ts` ↔ `lease-manager.ts` ↔ `agent-pet-controller.ts`
  - `windows.ts` ↔ `app-state.ts`, `agent-setup.ts`, `catalog.ts`, `codex-pets.ts`
  - `pet-window.ts` ↔ `default-pet-controller.ts`, `agent-pet-controller.ts`
  - `pet-installation.ts` ↔ `app-state.ts`, `catalog.ts`, `zip-safety.ts`

- **To packages/**:
  - `@open-pets/claude`: `buildClaudeMcpPreview`, `installClaudeHooks`, `doctorClaudeHooks`, etc.
  - `@open-pets/opencode`: `prepareOpenCodeGlobalSetup`, `doctorOpenCodeGlobalSetup`
  - `@open-pets/cursor`: `planCursorMcpInstall`, `executeCursorMcpWrite`, `buildCursorRulesPreview`, etc.
  - `@open-pets/cli`: Version lookup for bundled mode

- **To System**:
  - File system: `app.getPath("userData")`, `~/.codex/pets/`, `~/.claude/`, `~/.opencode/`
  - Network: `fetch()` to openpets.dev, GitHub API
  - Processes: `spawn()` for `claude`, `opencode`, `node`

## Key Modules

**Core**:
- `main.ts`: Entry, single-instance lock, bootstrap sequence
- `lifecycle.ts`: App event handlers (quit, window-all-closed, second-instance) with logging
- `state.ts`: Simple shell pause state
- `app-state.ts`: Persistent JSON state with V1 schema, atomic writes, reaction animation overrides
- `app-state-core.ts`: Pet scale options, onboarding normalization
- `logger.ts`: Structured logging with scopes (app, ipc, lease, pet.default, pet.agent, pet.window, state, tray, ui), log rotation, redaction

**UI**:
- `tray.ts`: Tray icon (nativeImage), context menu builder, update status integration, logs folder
- `windows.ts`: BrowserWindow factory, IPC handler registration, HTML generators for task windows, reaction animation settings
- `assets.ts`: Tray icon loading with generated fallback
- `display.ts`: Screen geometry helpers, pet window positioning

**Pets**:
- `pet-window.ts`: Window creation (transparent, frameless, always-on-top), HTML/CSS generation, sprite animation states, speech bubbles, status badges, transient displays
- `default-pet-controller.ts`: Default pet visibility, position persistence, transient reactions, status badges, logging
- `agent-pet-controller.ts`: Lease-triggered pet windows, dismissal tracking, transient displays, status badges, logging
- `built-in-pet.ts`: Built-in pet constant
- `reaction-messages.ts`: Message pools for each reaction type
- `reaction-animation-mapping.ts`: Reaction-to-animation state mapping, user-configurable overrides, sprite state definitions

**IPC**:
- `local-ipc.ts`: net.Server implementation, request routing, discovery file management, network security (loopback/private address filtering), logging
- `local-ipc-protocol.ts`: Protocol constants, request/response types, validation functions
- `local-ipc-paths.ts`: Platform-specific socket paths and discovery file locations
- `lease-manager.ts`: Lease lifecycle (acquire, heartbeat, release, cleanup), target resolution

**Installation**:
- `pet-installation.ts`: ZIP download, yauzl extraction with safety limits, pet validation
- `pet-paths.ts`: Safe path resolution for pet directories
- `codex-pets.ts`: Import from `~/.codex/pets/` with validation
- `codex-pets-core.ts`: Codex metadata validation constants
- `catalog.ts`: Remote catalog fetch with V3 pagination support, search, fixture fallback
- `catalog-validation.ts`: CatalogV2/V3 schema validation
- `zip-safety.ts`: ZIP entry path validation (traversal prevention, case collision detection)

**Agent Integration**:
- `agent-setup.ts`: Claude/OpenCode/Cursor detection, MCP configuration, hooks management, action journaling
- `claude-memory.ts`: Claude instructions file management (`~/.claude/openpets.md`)
- `update-checker.ts`: GitHub release polling, update status
- `update-version.ts`: Version parsing and comparison

**Tests** (excluded from detailed codemap coverage per repository conventions):
- Behavior tests live in `tests/*.test.ts` (compiled to `.test-dist/tests/`)
- Contract tests live in `contracts/*.contract.ts` (compiled to `.test-dist/contracts/`)
- Runtime checks (`check-*.ts`) remain in `src/` for packaging/validation (compiled to `dist/`)

## Data Flow Summary

| Source | Destination | Data |
|--------|-------------|------|
| Catalog API | `catalog.ts` | `CatalogV2/V3` JSON with pagination |
| ZIP Download | `pet-installation.ts` | Extracted to `userData/pets/{id}/` |
| `app-state.ts` | `userData/openpets-state.json` | Atomic JSON writes with reaction animation overrides |
| CLI via IPC | `local-ipc.ts` | `pet.react`, `pet.say`, `lease.*` |
| `lease-manager.ts` | `agent-pet-controller.ts` | Show/close agent pets |
| `windows.ts` | Renderer | State snapshots via IPC invoke |
| `agent-setup.ts` | Claude/OpenCode/Cursor CLI | MCP add/remove, config writes |
| All modules | `logger.ts` | Structured logs to `userData/logs/openpets.log` |
