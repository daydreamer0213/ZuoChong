import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { canonicalizePluginPermissions, type PluginPermission } from "./plugin-manifest.js";

export const openPetsPluginStateFileName = "openpets-plugin-state.json";

export type PluginSource = "catalog" | "local";

export type PluginUpdateMetadata = {
  readonly availableVersion?: string;
  readonly checkedAt?: string;
  readonly catalogUrl?: string;
};

export type PluginStateRecord = {
  readonly id: string;
  readonly version: string;
  readonly manifestPath: string;
  readonly installPath: string;
  readonly source: PluginSource;
  readonly enabled: boolean;
  readonly approvedPermissions: readonly PluginPermission[];
  readonly config: Record<string, unknown>;
  readonly brokenReason?: string;
  readonly update?: PluginUpdateMetadata;
};

export type OpenPetsPluginStateV1 = {
  readonly version: 1;
  readonly plugins: Record<string, PluginStateRecord>;
};

export type PluginStateStoreOptions =
  | { readonly userDataPath: string; readonly statePath?: never }
  | { readonly statePath: string; readonly userDataPath?: never };

export class PluginStateStore {
  readonly statePath: string;
  #state: OpenPetsPluginStateV1 | null = null;

  constructor(options: PluginStateStoreOptions) {
    this.statePath = options.statePath ?? join(options.userDataPath, openPetsPluginStateFileName);
  }

  initialize(): OpenPetsPluginStateV1 {
    const state = normalizePluginState(readPluginStateFile(this.statePath));
    this.#commit(state);
    return this.snapshot();
  }

  read(): OpenPetsPluginStateV1 {
    const state = normalizePluginState(readPluginStateFile(this.statePath));
    this.#state = state;
    return this.snapshot();
  }

  listRecords(): PluginStateRecord[] {
    return Object.values(this.#getState().plugins).map(cloneRecord).sort((a, b) => a.id.localeCompare(b.id));
  }

  getRecord(id: string): PluginStateRecord | undefined {
    const record = this.#getState().plugins[id];
    return record ? cloneRecord(record) : undefined;
  }

  upsertRecord(record: PluginStateRecord): PluginStateRecord {
    const normalized = normalizePluginRecordForApi(record);
    const state = this.#getState();
    this.#commit({ version: 1, plugins: { ...state.plugins, [normalized.id]: normalized } });
    return cloneRecord(normalized);
  }

  removeRecord(id: string): OpenPetsPluginStateV1 {
    const state = this.#getState();
    const plugins = { ...state.plugins };
    delete plugins[id];
    this.#commit({ version: 1, plugins });
    return this.snapshot();
  }

  setEnabled(id: string, enabled: boolean): PluginStateRecord {
    return this.#updateRecord(id, { enabled });
  }

  updateConfig(id: string, patch: Record<string, unknown>): PluginStateRecord {
    if (!isPlainRecord(patch)) throw new Error("Plugin config patch must be an object.");
    assertJsonCompatibleConfigObject(patch);
    const existing = this.#requireRecord(id);
    return this.#replaceRecord({ ...existing, config: { ...existing.config, ...cloneJsonObject(patch) } });
  }

  replaceConfig(id: string, config: Record<string, unknown>): PluginStateRecord {
    if (!isPlainRecord(config)) throw new Error("Plugin config replacement must be an object.");
    assertJsonCompatibleConfigObject(config);
    const existing = this.#requireRecord(id);
    return this.#replaceRecord({ ...existing, config: cloneJsonObject(config) });
  }

  setBrokenReason(id: string, brokenReason: string): PluginStateRecord {
    if (brokenReason.trim() === "") throw new Error("Plugin broken reason must be a non-empty string.");
    return this.#updateRecord(id, { brokenReason });
  }

  clearBrokenReason(id: string): PluginStateRecord {
    const existing = this.#requireRecord(id);
    const { brokenReason: _brokenReason, ...record } = existing;
    return this.#replaceRecord(record);
  }

  snapshot(): OpenPetsPluginStateV1 {
    return cloneState(this.#getState());
  }

  #updateRecord(id: string, patch: Partial<PluginStateRecord>): PluginStateRecord {
    return this.#replaceRecord({ ...this.#requireRecord(id), ...patch });
  }

  #replaceRecord(record: PluginStateRecord): PluginStateRecord {
    const normalized = normalizePluginRecordForApi(record);
    const state = this.#getState();
    this.#commit({ version: 1, plugins: { ...state.plugins, [normalized.id]: normalized } });
    return cloneRecord(normalized);
  }

  #requireRecord(id: string): PluginStateRecord {
    const record = this.#getState().plugins[id];
    if (!record) throw new Error(`Plugin is not installed: ${id}`);
    return record;
  }

  #getState(): OpenPetsPluginStateV1 {
    if (!this.#state) throw new Error("OpenPets plugin state has not been initialized.");
    return this.#state;
  }

  #commit(state: OpenPetsPluginStateV1): void {
    writePluginStateToDisk(this.statePath, state);
    this.#state = state;
  }
}

export function initializePluginState(options: PluginStateStoreOptions): PluginStateStore {
  const store = new PluginStateStore(options);
  store.initialize();
  return store;
}

function readPluginStateFile(path: string): unknown {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    console.error(`Failed to read OpenPets plugin state from ${path}; using defaults.`, error);
    return undefined;
  }
}

function normalizePluginState(value: unknown): OpenPetsPluginStateV1 {
  const plugins: Record<string, PluginStateRecord> = {};
  if (isPlainRecord(value) && isPlainRecord(value.plugins)) {
    for (const [id, record] of Object.entries(value.plugins)) {
      const normalized = normalizePluginRecordFromDisk(id, record);
      if (normalized) plugins[normalized.id] = normalized;
    }
  }
  return { version: 1, plugins };
}

function normalizePluginRecordFromDisk(key: string, value: unknown): PluginStateRecord | null {
  if (!isPlainRecord(value) || value.id !== key) return null;
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.version) || !isNonEmptyString(value.manifestPath) || !isNonEmptyString(value.installPath)) return null;
  if (value.source !== "catalog" && value.source !== "local") return null;
  if (typeof value.enabled !== "boolean" || !isPlainRecord(value.config)) return null;
  let approvedPermissions: readonly PluginPermission[];
  try {
    approvedPermissions = canonicalizePermissions(value.approvedPermissions);
  } catch {
    return null;
  }
  try {
    return {
      id: value.id,
      version: value.version,
      manifestPath: value.manifestPath,
      installPath: value.installPath,
      source: value.source,
      enabled: value.enabled,
      approvedPermissions,
      config: normalizeConfigObjectFromDisk(value.config),
      brokenReason: isNonEmptyString(value.brokenReason) ? value.brokenReason : undefined,
      update: normalizeUpdateMetadata(value.update),
    };
  } catch {
    return null;
  }
}

function normalizePluginRecordForApi(record: PluginStateRecord): PluginStateRecord {
  if (!isPlainRecord(record) || record.id.trim() === "" || record.version.trim() === "" || record.manifestPath.trim() === "" || record.installPath.trim() === "") throw new Error("Invalid plugin state record.");
  if (record.source !== "catalog" && record.source !== "local") throw new Error("Invalid plugin state record.");
  if (typeof record.enabled !== "boolean" || !isPlainRecord(record.config)) throw new Error("Invalid plugin state record.");
  assertJsonCompatibleConfigObject(record.config);
  return {
    id: record.id,
    version: record.version,
    manifestPath: record.manifestPath,
    installPath: record.installPath,
    source: record.source,
    enabled: record.enabled,
    approvedPermissions: canonicalizePermissions(record.approvedPermissions),
    config: cloneJsonObject(record.config),
    brokenReason: isNonEmptyString(record.brokenReason) ? record.brokenReason : undefined,
    update: normalizeUpdateMetadata(record.update),
  };
}

function canonicalizePermissions(value: unknown): PluginPermission[] {
  try {
    return canonicalizePluginPermissions(value);
  } catch (error) {
    const message = error instanceof Error ? error.message.replace("Plugin permissions", "Plugin approved permissions") : "Invalid plugin approved permissions.";
    throw new Error(message);
  }
}

function normalizeConfigObjectFromDisk(value: Record<string, unknown>): Record<string, unknown> {
  assertJsonCompatibleConfigObject(value);
  return cloneJsonObject(value);
}

function assertJsonCompatibleConfigObject(value: Record<string, unknown>): true {
  assertJsonCompatibleValue(value, "config");
  return true;
}

function assertJsonCompatibleValue(value: unknown, path: string): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Plugin config value at ${path} must be JSON-compatible.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonCompatibleValue(item, `${path}[${index}]`));
    return;
  }
  if (isPlainRecord(value)) {
    for (const [key, item] of Object.entries(value)) assertJsonCompatibleValue(item, `${path}.${key}`);
    return;
  }
  throw new Error(`Plugin config value at ${path} must be JSON-compatible.`);
}

function normalizeUpdateMetadata(value: unknown): PluginUpdateMetadata | undefined {
  if (!isPlainRecord(value)) return undefined;
  const update: PluginUpdateMetadata = {
    availableVersion: isNonEmptyString(value.availableVersion) ? value.availableVersion : undefined,
    checkedAt: isNonEmptyString(value.checkedAt) ? value.checkedAt : undefined,
    catalogUrl: isNonEmptyString(value.catalogUrl) ? value.catalogUrl : undefined,
  };
  return update.availableVersion || update.checkedAt || update.catalogUrl ? update : undefined;
}

function writePluginStateToDisk(path: string, state: OpenPetsPluginStateV1): void {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(tempPath, path);
}

function cloneState(state: OpenPetsPluginStateV1): OpenPetsPluginStateV1 {
  return structuredClone(state) as OpenPetsPluginStateV1;
}

function cloneRecord(record: PluginStateRecord): PluginStateRecord {
  return structuredClone(record) as PluginStateRecord;
}

function cloneJsonObject(value: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(value) as Record<string, unknown>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
