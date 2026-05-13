import { lstatSync, mkdirSync, writeFileSync, renameSync, rmSync, chmodSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";

import { app } from "electron";

import { openPetsIpcProtocol, openPetsIpcVersion } from "./local-ipc-protocol.js";

export interface OpenPetsDiscoveryFile {
  readonly protocolVersion: 1;
  readonly protocol: "openpets-ipc";
  readonly endpoint: string;
  readonly token: string;
  readonly appVersion: string;
  readonly pid: number;
  readonly platform: NodeJS.Platform;
}

export type IpcEndpoint =
  | { readonly kind: "tcp"; readonly host: "127.0.0.1"; readonly port: number }
  | { readonly kind: "path"; readonly path: string };

export function getDiscoveryFilePath(): string {
  if (process.env.OPENPETS_DISCOVERY_FILE) {
    return process.env.OPENPETS_DISCOVERY_FILE;
  }

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "OpenPets", "runtime", "ipc.json");
  }

  if (process.platform === "win32") {
    return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "OpenPets", "runtime", "ipc.json");
  }

  const xdg = getSecureXdgRuntimeDir();
  if (xdg) {
    return join(xdg, "openpets", "ipc.json");
  }

  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "OpenPets", "runtime", "ipc.json");
}

export function createIpcEndpoint(): string {
  if (process.env.OPENPETS_IPC_ENDPOINT) {
    const endpoint = parseIpcEndpoint(process.env.OPENPETS_IPC_ENDPOINT, { allowPortZero: true });
    if (endpoint.kind !== "tcp") {
      throw new Error("OPENPETS_IPC_ENDPOINT only supports loopback TCP endpoints, for example tcp://127.0.0.1:37645.");
    }
    return process.env.OPENPETS_IPC_ENDPOINT;
  }

  if (process.platform === "win32") {
    return `\\\\.\\pipe\\openpets-${randomEndpointPart()}-${process.pid}`;
  }

  const runtimeDir = getSocketRuntimeDir();
  mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
  ensurePrivateRuntimeDir(runtimeDir);
  return join(runtimeDir, `openpets-${process.pid}.sock`);
}

export function parseIpcEndpoint(endpoint: string, options: { readonly allowPortZero?: boolean } = {}): IpcEndpoint {
  if (endpoint.length < 1 || endpoint.length > 240) throw new Error("OpenPets IPC endpoint length is invalid.");
  if (endpoint.includes("\0")) throw new Error("OpenPets IPC endpoint contains NUL.");

  if (endpoint.startsWith("tcp://")) {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new Error("OpenPets TCP IPC endpoint is invalid.");
    }

    if (url.protocol !== "tcp:" || url.username || url.password || (url.pathname !== "" && url.pathname !== "/") || url.search || url.hash) {
      throw new Error("OpenPets TCP IPC endpoint must be tcp://127.0.0.1:<port>.");
    }
    if (url.hostname !== "127.0.0.1") {
      throw new Error("OpenPets TCP IPC endpoint must bind to loopback host 127.0.0.1.");
    }

    const port = Number(url.port);
    const minPort = options.allowPortZero ? 0 : 1;
    if (!Number.isInteger(port) || port < minPort || port > 65_535 || String(port) !== url.port) {
      throw new Error("OpenPets TCP IPC endpoint port is invalid.");
    }

    return { kind: "tcp", host: "127.0.0.1", port };
  }

  return { kind: "path", path: endpoint };
}

export function writeDiscoveryFile(endpoint: string, token: string): OpenPetsDiscoveryFile {
  const discovery: OpenPetsDiscoveryFile = {
    protocolVersion: openPetsIpcVersion,
    protocol: openPetsIpcProtocol,
    endpoint,
    token,
    appVersion: app.getVersion(),
    pid: process.pid,
    platform: process.platform,
  };

  const path = getDiscoveryFilePath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try { chmodSync(dirname(path), 0o700); } catch { /* best effort */ }
  const tempPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(discovery, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try { chmodSync(tempPath, 0o600); } catch { /* best effort */ }
  renameSync(tempPath, path);
  try { chmodSync(path, 0o600); } catch { /* best effort */ }
  return discovery;
}

export function removeDiscoveryFile(discovery: OpenPetsDiscoveryFile | null): void {
  if (!discovery) return;
  const path = getDiscoveryFilePath();
  try {
    const current = JSON.parse(readFileSync(path, "utf8")) as Partial<OpenPetsDiscoveryFile>;
    if (current.pid !== discovery.pid || current.token !== discovery.token || current.endpoint !== discovery.endpoint) {
      return;
    }
    rmSync(path, { force: true });
  } catch {
    // best-effort cleanup only
  }
}

export function cleanupUnixSocket(endpoint: string): void {
  if (endpoint.startsWith("tcp://")) return;
  if (process.platform === "win32") return;
  try {
    rmSync(endpoint, { force: true });
  } catch {
    // bind will report a real failure if cleanup was required but impossible
  }
}

export function protectUnixSocket(endpoint: string): void {
  if (endpoint.startsWith("tcp://")) return;
  if (process.platform === "win32") return;
  try { chmodSync(endpoint, 0o600); } catch { /* best effort */ }
}

function getSocketRuntimeDir(): string {
  const xdg = process.platform === "linux" ? getSecureXdgRuntimeDir() : null;
  if (xdg) {
    return join(xdg, "openpets");
  }

  return join("/tmp", `openpets-${getUserIdForPath()}`);
}

function getSecureXdgRuntimeDir(): string | null {
  const dir = process.env.XDG_RUNTIME_DIR;
  if (!dir) return null;

  try {
    const stat = lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
    if (typeof process.getuid === "function" && stat.uid !== process.getuid()) return null;
    if ((stat.mode & 0o777) !== 0o700) return null;
    return dir;
  } catch {
    return null;
  }
}

function ensurePrivateRuntimeDir(dir: string): void {
  const stat = lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`OpenPets IPC runtime path is not a safe directory: ${dir}`);
  }

  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    throw new Error(`OpenPets IPC runtime directory is not owned by the current user: ${dir}`);
  }

  try { chmodSync(dir, 0o700); } catch { /* best effort */ }
  const updated = lstatSync(dir);
  if ((updated.mode & 0o777) !== 0o700) {
    throw new Error(`OpenPets IPC runtime directory is not private: ${dir}`);
  }
}

function getUserIdForPath(): string {
  if (typeof process.getuid === "function") return String(process.getuid());
  try { return userInfo().username.replace(/[^a-zA-Z0-9_-]/g, "_"); } catch { return "user"; }
}

function randomEndpointPart(): string {
  return randomBytes(8).toString("hex");
}
