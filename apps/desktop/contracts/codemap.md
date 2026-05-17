# apps/desktop/contracts/

## Responsibility

Public API boundary contract tests for the OpenPets desktop application. These contracts validate that critical external-facing interfaces (catalog data, IPC protocol) conform to expected schemas and behavior. Contract tests are compiled to `.test-dist/contracts/` and executed during `pnpm test`.

## Design

- **Schema Validation Contracts**: Test catalog validation logic against fixture data and invalid cases
- **Protocol Contracts**: Verify IPC request/response parsing, token validation, and message constraints
- **Fixture-Based Testing**: Uses real fixture data (`catalog.v2.fixture.json`) to ensure validation matches production data
- **Negative Testing**: Includes invalid cases to ensure proper rejection of malformed data
- **Standalone Execution**: Each contract file is executable Node.js code that runs independently

## Flow

**Catalog Fixture Contract** (`catalog-fixture.contract.ts`):
```
Load catalog.v2.fixture.json → validateCatalogV2() → Assert valid
→ Test invalid cases (bad IDs, duplicates, HTTP URLs, wrong hosts, reserved IDs)
→ Assert each invalid case is properly rejected
```

**Local IPC Protocol Contract** (`local-ipc-protocol.contract.ts`):
```
Test parseIpcRequest() with valid/invalid tokens, versions, methods
→ Test validateReaction() with valid/invalid reaction types
→ Test validateSayMessage() with valid/invalid messages (length, newlines, code blocks, URLs, paths, secrets)
→ Test maxIpcMessageBytes boundary
→ Test errorResponse() structure
```

## Integration Points

- **Source modules**: Imports from `../src/catalog-validation.js`, `../src/local-ipc-protocol.js`
- **Fixture data**: `catalog.v2.fixture.json` in parent directory
- **Test runner**: Executed by `scripts/run-tests.mjs` in the contract tests phase
- **Build output**: Compiled to `.test-dist/contracts/*.contract.js` via `tsconfig.tests.json`

## Key Contracts

- `catalog-fixture.contract.ts`: Validates catalog V2 schema against fixture and invalid cases (duplicate IDs, bad URL schemes, wrong hosts, reserved "builtin" ID)
- `local-ipc-protocol.contract.ts`: Validates IPC protocol parsing, token auth, reaction types, message constraints, and error response formatting
