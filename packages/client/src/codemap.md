# packages/client/src/

## Files

- **index.ts**: Main client implementation. `createOpenPetsClient()` factory, all client methods, result parsers (`parsePetListResult`, `parsePetInstallResult`), and `sendRequest()` for low-level IPC.
- **protocol.ts**: IPC protocol constants, request/response types, `parseIpcResponse()`, `validateReaction()`, `OpenPetsClientError` class.
- **discovery.ts**: Discovery file handling. `getDiscoveryFilePath()`, `readDiscoveryFile()`, `validateDiscovery()`, `validateEndpoint()`, platform-specific path logic, XDG security checks.
- **smoke.ts**: Manual testing CLI for client operations (hello, status, react, say, invalid-token).
- **check-client-protocol.ts**: Contract validation (excluded from detailed documentation).
