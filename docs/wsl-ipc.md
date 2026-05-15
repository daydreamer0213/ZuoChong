# WSL and cross-OS IPC

OpenPets normally uses OS-native local IPC:

- Windows desktop app: Windows named pipe
- macOS/Linux desktop app: Unix socket

That works when the desktop app and MCP process run in the same OS environment. For Windows desktop + WSL agent workflows, use the opt-in TCP transport instead.

## Modes of operation

### Mirrored mode (recommended)

WSL2 with **mirrored networking mode** allows WSL processes to reach Windows services bound to `127.0.0.1`. This is the simplest and safest configuration.

**Windows (PowerShell):**
```powershell
$env:OPENPETS_IPC_BIND = "tcp://127.0.0.1:37645"
$env:OPENPETS_IPC_ENDPOINT = "tcp://127.0.0.1:37645"
OpenPets.exe
```

**WSL (Bash):**
```bash
export OPENPETS_DISCOVERY_FILE="/mnt/c/Users/<WindowsUser>/AppData/Roaming/OpenPets/runtime/ipc.json"
npx -y @open-pets/mcp
```

### NAT mode

WSL2 with **NAT networking mode** requires the Windows app to listen on an address WSL can reach and to advertise the Windows host IP to WSL clients.

**Step 1: Get the Windows host IP from WSL**

```bash
# In WSL, get the Windows host IP
WIN_HOST=$(ip route show | grep -i default | awk '{ print $3 }')
echo "Windows host IP: $WIN_HOST"
```

**Step 2: Configure Windows desktop app**

```powershell
# Bind to all interfaces for incoming connections from WSL.
# This can expose the port on private/LAN interfaces if Windows Firewall allows it.
$env:OPENPETS_IPC_BIND = "tcp://0.0.0.0:37645"
# Advertise the Windows host IP to WSL clients
$env:OPENPETS_IPC_ENDPOINT = "tcp://172.25.32.1:37645"  # Replace with your actual WIN_HOST
OpenPets.exe
```

If you know the specific Windows virtual adapter address that WSL can reach, you can bind that address instead of `0.0.0.0` to reduce exposure.

**Step 3: Configure WSL client**

```bash
export OPENPETS_DISCOVERY_FILE="/mnt/c/Users/<WindowsUser>/AppData/Roaming/OpenPets/runtime/ipc.json"
npx -y @open-pets/mcp
```

## Environment variables reference

| Variable | Purpose | Example |
|----------|---------|---------|
| `OPENPETS_IPC_BIND` | TCP endpoint to bind the server to; setting this opts into TCP IPC | `tcp://0.0.0.0:37645` |
| `OPENPETS_IPC_ENDPOINT` | TCP endpoint advertised in discovery file; this does not start TCP listening by itself | `tcp://172.25.32.1:37645` |
| `OPENPETS_DISCOVERY_FILE` | Path to the discovery JSON file (client-side) | `/mnt/c/Users/.../ipc.json` |

### Variable combinations

- **Neither set**: Uses platform default (named pipe on Windows, Unix socket on macOS/Linux)
- **Only `OPENPETS_IPC_ENDPOINT`**: Invalid. `OPENPETS_IPC_ENDPOINT` only advertises; set `OPENPETS_IPC_BIND` to opt into TCP IPC.
- **Only `OPENPETS_IPC_BIND`**: Binds to the specified endpoint and advertises the same (cannot use `0.0.0.0` alone)
- **Both set**: Binds to `OPENPETS_IPC_BIND`, advertises `OPENPETS_IPC_ENDPOINT` (required for NAT mode with `0.0.0.0`)

## Security considerations

⚠️ **Important security warnings:**

1. **Never bind to public IPs**: Only use `127.0.0.1` (loopback), `0.0.0.0` with a private advertised endpoint, or private network addresses (10.x.x.x, 172.16-31.x.x, 192.168.x.x, 169.254.x.x).

2. **Always use the discovery token**: Even with TCP, clients must present the per-run token from the discovery file. The token is randomly generated on each app start.

3. **Firewall considerations**: Binding to `0.0.0.0` listens on all Windows interfaces, including private/LAN interfaces. Ensure Windows Firewall blocks external access to the OpenPets port except from the WSL virtual network.

4. **Network isolation**: In NAT mode, the advertised Windows host IP is intended for WSL. Binding to `0.0.0.0` can still expose the listener more broadly if firewall rules permit it.

5. **Host validation**: The desktop app validates that incoming TCP connections originate from private/local addresses when bound to non-loopback interfaces.

## Supported endpoint formats

- `tcp://127.0.0.1:<port>` - Loopback only (safest)
- `tcp://0.0.0.0:<port>` - All interfaces (requires separate advertised endpoint)
- `tcp://10.x.x.x:<port>` - Private network (RFC 1918)
- `tcp://172.16.x.x:<port>` to `tcp://172.31.x.x:<port>` - Private network (RFC 1918)
- `tcp://192.168.x.x:<port>` - Private network (RFC 1918)
- `tcp://169.254.x.x:<port>` - Link-local (APIPA)

**Not allowed:**
- Hostnames (e.g., `tcp://localhost:<port>`)
- `0.0.0.0` as advertised endpoint
- Public routable IPs

## Notes and limitations

- TCP is opt-in. Same-OS setups continue to use named pipes or Unix sockets by default.
- WSL networking differs by version and configuration. Mirrored mode is recommended when available.
- Cross-machine IPC is not intended or supported. Private LAN peers may still be able to reach a `0.0.0.0` listener if Windows Firewall allows it, so restrict the port to the WSL virtual network.

## Quick health check

After starting the desktop app with the appropriate environment variables and exporting `OPENPETS_DISCOVERY_FILE` in WSL, run:

```bash
npx -y @open-pets/mcp
```

Then use your MCP client's `openpets_status` tool to confirm the desktop app is reachable.
