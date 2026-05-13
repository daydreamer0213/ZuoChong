import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

import { isRecord, maxIpcMessageBytes, openPetsIpcProtocol, openPetsIpcVersion, OpenPetsClientError } from "./protocol.js";

export interface OpenPetsDiscoveryFile {
  readonly protocolVersion: 1;
  readonly protocol: "openpets-ipc";
  readonly endpoint: string;
  readonly token: string;
  readonly appVersion: string;
  readonly pid: number;
  readonly platform: NodeJS.Platform;
}

export type ParsedIpcEndpoint =
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

export function readDiscoveryFile(path = getDiscoveryFilePath()): OpenPetsDiscoveryFile {
  let raw: string;
  try {
    const stat = statSync(path);
    if (!stat.isFile()) throw new OpenPetsClientError("invalid_discovery", "OpenPets discovery path is not a file.");
    if (stat.size > maxIpcMessageBytes) throw new OpenPetsClientError("invalid_discovery", "OpenPets discovery file is too large.");
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof OpenPetsClientError) throw error;
    throw new OpenPetsClientError("unavailable", `OpenPets discovery file is unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  if (Buffer.byteLength(raw, "utf8") > maxIpcMessageBytes) {
    throw new OpenPetsClientError("invalid_discovery", "OpenPets discovery file is too large.");
  }

  try {
    return validateDiscovery(JSON.parse(raw) as unknown);
  } catch (error) {
    if (error instanceof OpenPetsClientError) throw error;
    throw new OpenPetsClientError("invalid_discovery", "OpenPets discovery file is malformed JSON.");
  }
}

export function validateDiscovery(value: unknown): OpenPetsDiscoveryFile {
  if (!isRecord(value)) throw new OpenPetsClientError("invalid_discovery", "Discovery must be an object.");
  if (value.protocol !== openPetsIpcProtocol) throw new OpenPetsClientError("invalid_discovery", "Discovery protocol is invalid.");
  if (value.protocolVersion !== openPetsIpcVersion) throw new OpenPetsClientError("invalid_discovery", "Discovery protocol version is invalid.");
  if (typeof value.endpoint !== "string") throw new OpenPetsClientError("invalid_discovery", "Discovery endpoint is invalid.");
  if (typeof value.token !== "string" || value.token.length < 16 || value.token.length > 256) throw new OpenPetsClientError("invalid_discovery", "Discovery token is invalid.");
  if (typeof value.appVersion !== "string") throw new OpenPetsClientError("invalid_discovery", "Discovery app version is invalid.");
  if (typeof value.pid !== "number" || !Number.isInteger(value.pid) || value.pid <= 0) throw new OpenPetsClientError("invalid_discovery", "Discovery pid is invalid.");
  if (value.platform !== "darwin" && value.platform !== "linux" && value.platform !== "win32") throw new OpenPetsClientError("invalid_discovery", "Discovery platform is invalid.");

  const endpoint = parseIpcEndpoint(value.endpoint);
  if (value.platform !== process.platform && !allowsCrossPlatformDiscovery(value.platform, endpoint)) {
    throw new OpenPetsClientError("invalid_discovery", "Discovery platform does not match this client.");
  }

  return {
    protocolVersion: openPetsIpcVersion,
    protocol: openPetsIpcProtocol,
    endpoint: value.endpoint,
    token: value.token,
    appVersion: value.appVersion,
    pid: value.pid,
    platform: value.platform as NodeJS.Platform,
  };
}

export function validateEndpoint(endpoint: string): void {
  parseIpcEndpoint(endpoint);
}

export function parseIpcEndpoint(endpoint: string): ParsedIpcEndpoint {
  if (endpoint.length < 1 || endpoint.length > 240) throw new OpenPetsClientError("invalid_discovery", "Discovery endpoint length is invalid.");
  if (endpoint.includes("\0")) throw new OpenPetsClientError("invalid_discovery", "Discovery endpoint contains NUL.");

  if (endpoint.startsWith("tcp://")) {
    return parseTcpEndpoint(endpoint);
  }

  if (process.platform === "win32") {
    if (!endpoint.startsWith("\\\\.\\pipe\\openpets-") || endpoint.includes("/")) {
      throw new OpenPetsClientError("invalid_discovery", "Discovery endpoint is not an OpenPets named pipe.");
    }
    return { kind: "path", path: endpoint };
  }

  if (!endpoint.startsWith("/") || endpoint.includes("://") || endpoint.includes("..")) {
    throw new OpenPetsClientError("invalid_discovery", "Discovery endpoint is not an absolute Unix socket path.");
  }

  if (!basename(endpoint).startsWith("openpets-") || !basename(endpoint).endsWith(".sock")) {
    throw new OpenPetsClientError("invalid_discovery", "Discovery endpoint filename is not an OpenPets socket.");
  }

  const parent = dirname(endpoint);
  const parentName = basename(parent);
  const isTmpRuntime = parent.startsWith("/tmp/") && parentName.startsWith("openpets-");
  const isXdgRuntime = parentName === "openpets";
  if (!isTmpRuntime && !isXdgRuntime) {
    throw new OpenPetsClientError("invalid_discovery", "Discovery endpoint is outside an expected OpenPets runtime directory.");
  }

  return { kind: "path", path: endpoint };
}

function parseTcpEndpoint(endpoint: string): ParsedIpcEndpoint {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new OpenPetsClientError("invalid_discovery", "Discovery TCP endpoint is invalid.");
  }

  if (url.protocol !== "tcp:" || url.username || url.password || (url.pathname !== "" && url.pathname !== "/") || url.search || url.hash) {
    throw new OpenPetsClientError("invalid_discovery", "Discovery TCP endpoint must be tcp://127.0.0.1:<port>.");
  }

  if (url.hostname !== "127.0.0.1") {
    throw new OpenPetsClientError("invalid_discovery", "Discovery TCP endpoint must use loopback host 127.0.0.1.");
  }

  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535 || String(port) !== url.port) {
    throw new OpenPetsClientError("invalid_discovery", "Discovery TCP endpoint port is invalid.");
  }

  return { kind: "tcp", host: "127.0.0.1", port };
}

function allowsCrossPlatformDiscovery(platform: NodeJS.Platform, endpoint: ParsedIpcEndpoint): boolean {
  return endpoint.kind === "tcp" && platform === "win32" && process.platform === "linux";
}

function getSecureXdgRuntimeDir(): string | null {
  const dir = process.env.XDG_RUNTIME_DIR;
  if (!dir || !existsSync(dir)) return null;
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
