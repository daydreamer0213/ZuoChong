# WSL and cross-OS IPC

OpenPets normally uses OS-native local IPC:

- Windows desktop app: Windows named pipe
- macOS/Linux desktop app: Unix socket

That works when the desktop app and MCP process run in the same OS environment. For Windows desktop + WSL agent workflows, use the opt-in loopback TCP transport instead.

## Supported transport

Set the desktop app to listen on loopback TCP:

```powershell
$env:OPENPETS_IPC_ENDPOINT = "tcp://127.0.0.1:37645"
OpenPets.exe
```

The endpoint must be `tcp://127.0.0.1:<port>`. OpenPets rejects hostnames, non-loopback addresses, paths, credentials, and invalid ports.

## WSL client setup

The WSL-side MCP/client process also needs to read the Windows discovery file so it can get the current endpoint and per-run token.

Example:

```bash
export OPENPETS_DISCOVERY_FILE="/mnt/c/Users/<WindowsUser>/AppData/Roaming/OpenPets/runtime/ipc.json"
npx -y @open-pets/mcp
```

Use the same environment variable in your OpenCode or MCP server configuration.

## Notes and limitations

- TCP is opt-in. Same-OS setups continue to use named pipes or Unix sockets by default.
- TCP binds only to `127.0.0.1` and still requires the per-run token from the discovery file.
- WSL networking differs by version and configuration. Some WSL2 NAT setups may not reach a Windows process bound to `127.0.0.1`; mirrored networking or localhost forwarding may be required.
- Do not bind OpenPets IPC to LAN or wildcard addresses. Cross-machine IPC is not supported.

## Quick health check

After starting the desktop app with `OPENPETS_IPC_ENDPOINT` and exporting `OPENPETS_DISCOVERY_FILE` in WSL, run:

```bash
npx -y @open-pets/mcp
```

Then use your MCP client’s `openpets_status` tool to confirm the desktop app is reachable.
