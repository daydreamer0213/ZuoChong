import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, parse as parsePath, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

import { parse as parseToml } from "smol-toml";

export const openPetsHookMarker = "--openpets-managed";
export const codexHookEvents = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "Stop"] as const;

export type CodexHookInstallStatus = "not_installed" | "installed" | "needs_update" | "error";

export interface CodexHookDoctorResult {
  readonly status: CodexHookInstallStatus;
  readonly configPath: string;
  readonly exists: boolean;
  readonly valid: boolean;
  readonly message: string;
  readonly backupPath?: string;
  readonly preview: string;
}

export interface CodexHookWriteResult extends CodexHookDoctorResult {
  readonly changed: boolean;
}

const managedBeginMarker = "# begin openpets-managed: @open-pets/codex";
const managedEndMarker = "# end openpets-managed: @open-pets/codex";

export function getCodexConfigPath(): string {
  return join(homedir(), ".codex", "config.toml");
}

export function getLocalCodexCliPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "cli.js");
}

/**
 * Build the hook command strings Codex will run. Local absolute CLI path is used
 * so hooks pay no per-invocation package resolution cost. Codex exposes two
 * command fields: `command` (POSIX-style shell) and `commandWindows`
 * (Windows CreateProcess-style, where backslashes are literal).
 */
export function createOpenPetsHookCommand(explicitCliPath?: string, nodeCommand = "node"): string {
  const cliPath = explicitCliPath ?? getLocalCodexCliPath();
  return `${shellQuote(nodeCommand)} ${shellQuote(cliPath)} hook ${openPetsHookMarker}`;
}

export function createOpenPetsHookWindowsCommand(explicitCliPath?: string, nodeCommand = "node"): string {
  const cliPath = explicitCliPath ?? getLocalCodexCliPath();
  return `${shellQuoteWindows(nodeCommand)} ${shellQuoteWindows(cliPath)} hook ${openPetsHookMarker}`;
}

/** Render appendable hook array tables for Codex config.toml. */
export function createOpenPetsHooksTomlBlock(nodeCommand = "node", explicitCliPath?: string): string {
  const command = createOpenPetsHookCommand(explicitCliPath, nodeCommand);
  const commandWindows = createOpenPetsHookWindowsCommand(explicitCliPath, nodeCommand);
  const lines: string[] = [managedBeginMarker];
  for (const event of codexHookEvents) {
    lines.push(`[[hooks.${event}]]`);
    if (event === "PreToolUse") lines.push(`matcher = "^(Edit|Write|apply_patch|Bash|shell)$"`);
    lines.push(
      `[[hooks.${event}.hooks]]`,
      `type = "command"`,
      `command = ${tomlQuote(command)}`,
      `commandWindows = ${tomlQuote(commandWindows)}`,
      `timeout = 3`,
      "",
    );
  }
  lines.push(managedEndMarker);
  return lines.join("\n");
}

export function doctorCodexHooks(configPath = getCodexConfigPath(), nodeCommand = "node", explicitCliPath?: string): CodexHookDoctorResult {
  const preview = createOpenPetsHooksTomlBlock(nodeCommand, explicitCliPath);
  try {
    const raw = readCodexConfig(configPath);
    validateCodexConfig(raw);
    const status = getHookInstallStatus(raw, preview);
    return {
      status,
      configPath,
      exists: existsSync(configPath),
      valid: true,
      message: status === "installed"
        ? "OpenPets Codex hooks are installed."
        : status === "needs_update"
          ? "OpenPets Codex hooks need update."
          : "OpenPets Codex hooks are not installed.",
      preview,
    };
  } catch (error) {
    return { status: "error", configPath, exists: existsSync(configPath), valid: false, message: error instanceof Error ? error.message : "Codex config is invalid.", preview };
  }
}

export function installCodexHooks(configPath = getCodexConfigPath(), nodeCommand = "node", explicitCliPath?: string): CodexHookWriteResult {
  const raw = readCodexConfig(configPath);
  validateCodexConfig(raw);
  const block = createOpenPetsHooksTomlBlock(nodeCommand, explicitCliPath);
  const status = getHookInstallStatus(raw, block);
  if (status === "installed") return { ...doctorCodexHooks(configPath, nodeCommand, explicitCliPath), changed: false };
  const backupPath = backupConfig(configPath);
  const next = insertManagedBlock(raw, block);
  validateCodexConfig(next);
  writeCodexConfig(configPath, next);
  return { ...doctorCodexHooks(configPath, nodeCommand, explicitCliPath), backupPath, changed: true };
}

export function uninstallCodexHooks(configPath = getCodexConfigPath()): CodexHookWriteResult {
  const raw = readCodexConfig(configPath);
  validateCodexConfig(raw);
  const managed = inspectManagedBlock(raw);
  if (managed.kind === "absent") return { ...doctorCodexHooks(configPath), changed: false };
  const backupPath = backupConfig(configPath);
  const next = removeManagedBlock(raw, managed);
  validateCodexConfig(next);
  writeCodexConfig(configPath, next);
  return { ...doctorCodexHooks(configPath), backupPath, changed: true };
}

function getHookInstallStatus(raw: string, expected = createOpenPetsHooksTomlBlock()): CodexHookInstallStatus {
  const managed = inspectManagedBlock(raw);
  if (managed.kind === "absent") return "not_installed";
  if (managed.kind === "conflict") return "error";
  return managed.block === expected ? "installed" : "needs_update";
}

type ManagedBlockInspection =
  | { readonly kind: "absent" }
  | { readonly kind: "conflict" }
  | { readonly kind: "valid"; readonly start: number; readonly end: number; readonly block: string };

function inspectManagedBlock(raw: string): ManagedBlockInspection {
  const begins = findMarkerOffsets(raw, managedBeginMarker);
  const ends = findMarkerOffsets(raw, managedEndMarker);
  if (begins.length === 0 && ends.length === 0) return { kind: "absent" };
  if (begins.length !== 1 || ends.length !== 1 || ends[0] <= begins[0]) return { kind: "conflict" };
  const start = begins[0];
  const end = ends[0] + managedEndMarker.length;
  return { kind: "valid", start, end, block: raw.slice(start, end) };
}

function findMarkerOffsets(raw: string, marker: string): number[] {
  const offsets: number[] = [];
  let offset = 0;
  while (offset < raw.length) {
    const found = raw.indexOf(marker, offset);
    if (found < 0) break;
    offsets.push(found);
    offset = found + marker.length;
  }
  return offsets;
}

function validateCodexConfig(raw: string): void {
  const managed = inspectManagedBlock(raw);
  if (managed.kind === "conflict") throw new Error("Codex config contains conflicting OpenPets managed markers.");
  if (raw.trim() !== "") parseToml(raw);
}

function insertManagedBlock(raw: string, block: string): string {
  const managed = inspectManagedBlock(raw);
  if (managed.kind === "conflict") throw new Error("Codex config contains conflicting OpenPets managed markers.");
  if (managed.kind === "valid") return `${raw.slice(0, managed.start)}${block}${raw.slice(managed.end)}`;
  if (raw === "") return `${block}\n`;
  const separator = raw.endsWith("\n\n") ? "" : raw.endsWith("\n") ? "\n" : "\n\n";
  return `${raw}${separator}${block}\n`;
}

function removeManagedBlock(raw: string, managed = inspectManagedBlock(raw)): string {
  if (managed.kind === "conflict") throw new Error("Codex config contains conflicting OpenPets managed markers.");
  if (managed.kind === "absent") return raw;
  const after = raw.slice(managed.end);
  const suffix = after.startsWith("\r\n") ? after.slice(2) : after.startsWith("\n") ? after.slice(1) : after;
  return `${raw.slice(0, managed.start)}${suffix}`;
}

function readCodexConfig(path: string): string {
  if (!existsSync(path)) return "";
  assertSafeConfigPath(path);
  return readFileSync(path, "utf8");
}

function writeCodexConfig(path: string, content: string): void {
  assertSafeConfigPath(path);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  assertSafeConfigPath(path);
  const tempPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tempPath, content, { encoding: "utf8", mode: 0o600 });
  renameSync(tempPath, path);
}

function backupConfig(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const backupPath = `${path}.openpets-backup-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}.toml`;
  writeFileSync(backupPath, readFileSync(path), { mode: 0o600 });
  try { chmodSync(backupPath, 0o600); } catch { /* best effort */ }
  return backupPath;
}

function assertSafeConfigPath(path: string): void {
  const absolutePath = resolve(path);
  const root = parsePath(absolutePath).root;
  const segments = dirname(absolutePath).slice(root.length).split(sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    if (!existsSync(current)) break;
    const parent = lstatSync(current);
    if (parent.isSymbolicLink() || !parent.isDirectory()) throw new Error("Codex config parent must not contain symlink segments.");
  }
  if (existsSync(absolutePath)) {
    const stat = lstatSync(absolutePath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Codex config path must be a regular file.");
  }
}

/** Quote a string for a TOML basic string literal. */
export function tomlQuote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("\n", "\\n").replaceAll("\r", "\\r").replaceAll("\t", "\\t")}"`;
}

function shellQuote(value: string): string {
  if (/^[a-zA-Z0-9_@%+=:,./-]+$/.test(value)) return value;
  if (/[\r\n"]/.test(value) || value.includes("\0")) throw new Error("Codex hook path contains unsupported shell characters.");
  return `"${value.replaceAll("\\", "\\\\").replaceAll("$", "\\$").replaceAll("`", "\\`")}"`;
}

function shellQuoteWindows(value: string): string {
  if (/^[a-zA-Z0-9_@%+=:,.\\/-]+$/.test(value)) return value;
  if (/[\r\n"]/.test(value) || value.includes("\0")) throw new Error("Codex hook path contains unsupported shell characters.");
  return `"${value.replaceAll("\"", "\\\"").replaceAll("$", "\\$")}"`;
}
