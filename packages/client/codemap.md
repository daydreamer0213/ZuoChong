# packages/client/

Core IPC client library for OpenPets desktop app communication.

## Responsibility

Provides the foundational client library for all OpenPets integrations. Handles discovery file reading, TCP socket connections, request/response protocol, and high-level pet operations (status, list, install, lease, react, say).

## Design

**Protocol Layer** (`protocol.ts`):
- Defines IPC protocol version (v1), message limits (16KB), timeouts (2s connect, 3s response)
- Request/response types with discriminated union (`ok: true/false`)
- Reaction validation against allowed enum values
- Custom `OpenPetsClientError` with error codes

**Discovery Layer** (`discovery.ts`):
- Cross-platform discovery file path resolution (macOS, Windows, Linux/XDG)
- File validation (size, permissions, symlink checks)
- Endpoint validation (named pipes on Windows, Unix sockets on POSIX)
- Security: XDG_RUNTIME_DIR permission checks (0o700, ownership)

**Client Layer** (`index.ts`):
- Factory pattern: `createOpenPetsClient(options)` returns `OpenPetsClient` interface
- Methods: `hello()`, `status()`, `listPets()`, `installPet()`, `acquireLease()`, `heartbeatLease()`, `releaseLease()`, `react()`, `say()`
- Lease-aware operations for multi-pet targeting
- Result parsers with validation

**Socket Management**:
- Node.js `net.createConnection()` for TCP/Unix sockets
- Dual timeout handling (connect + response)
- Line-delimited JSON protocol (`\n` separator)
- Buffer size enforcement (16KB max)

## Flow

```
Client Method Call
    ↓
readDiscoveryFile() → Parse ipc.json (token, endpoint)
    ↓
sendRequest() → Build request (id, version, token, method, params)
    ↓
net.createConnection(endpoint) → Write JSON + newline
    ↓
Wait for response (buffer until newline)
    ↓
parseIpcResponse() → Validate shape, return result or throw
```

## Integration Points

**Consumers** (all depend on this package):
- `@open-pets/cli` - CLI commands
- `@open-pets/mcp` - MCP tool implementations
- `@open-pets/claude` - Hook execution
- `@open-pets/opencode` - Plugin runtime
- `@open-pets/install-pet` - Direct installation fallback

**Desktop App**: Communicates with OpenPets desktop app via local socket (Unix domain socket or Windows named pipe) defined in discovery file.

**Exports**:
- `createOpenPetsClient()` - Main factory
- `sendRequest()` - Low-level request function
- `readDiscoveryFile()`, `getDiscoveryFilePath()` - Discovery utilities
- `OpenPetsClientError`, error codes, types
