import { constants, promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { defaultMaxPluginManifestBytes, readSafePluginManifest } from "./plugin-manifest-reader.js";
import { OPENPETS_PLUGIN_MANIFEST_FILENAME, validatePluginManifest, type OpenPetsPluginManifest } from "./plugin-manifest.js";

export type LocalPluginLoadResult = { readonly manifest: OpenPetsPluginManifest; readonly installPath: string; readonly manifestPath: string };
export type LocalPluginSourceManifest = { readonly manifest: OpenPetsPluginManifest; readonly manifestText: string };

export async function loadLocalPluginSnapshot(options: { readonly sourceFolder: string; readonly userDataPath: string; readonly maxManifestBytes?: number }): Promise<LocalPluginLoadResult> {
  const source = await readLocalPluginSourceManifest({ sourceFolder: options.sourceFolder, maxManifestBytes: options.maxManifestBytes });
  return publishLocalPluginSnapshot({ manifest: source.manifest, manifestText: source.manifestText, userDataPath: options.userDataPath, maxManifestBytes: options.maxManifestBytes });
}

export async function readLocalPluginSourceManifest(options: { readonly sourceFolder: string; readonly maxManifestBytes?: number }): Promise<LocalPluginSourceManifest> {
  const maxBytes = options.maxManifestBytes ?? defaultMaxPluginManifestBytes;
  const sourceStat = await fs.lstat(options.sourceFolder);
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new Error("Selected plugin folder is invalid.");
  const realSourceFolder = await fs.realpath(options.sourceFolder);

  const sourceManifestPath = join(realSourceFolder, OPENPETS_PLUGIN_MANIFEST_FILENAME);
  const manifestStat = await fs.lstat(sourceManifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error("Selected plugin manifest is invalid.");
  if (manifestStat.size > maxBytes) throw new Error("Plugin manifest is too large.");
  const realSourceManifestPath = await fs.realpath(sourceManifestPath);
  if (dirname(realSourceManifestPath) !== realSourceFolder || basename(realSourceManifestPath) !== OPENPETS_PLUGIN_MANIFEST_FILENAME) throw new Error("Selected plugin manifest is invalid.");

  let handle: FileHandle | undefined;
  try {
    const nofollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
    handle = await fs.open(sourceManifestPath, constants.O_RDONLY | nofollow);
    const text = await readBoundedUtf8(handle, maxBytes);
    const parsed = JSON.parse(text) as unknown;
    const result = validatePluginManifest(parsed);
    if (!result.ok) throw new Error("Plugin manifest validation failed.");
    if (!isSafePluginDirectoryName(result.manifest.id)) throw new Error("Plugin id is reserved.");
    return { manifest: result.manifest, manifestText: text };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function publishLocalPluginSnapshot(options: { readonly manifest: OpenPetsPluginManifest; readonly manifestText: string; readonly userDataPath: string; readonly maxManifestBytes?: number }): Promise<LocalPluginLoadResult> {
  const maxBytes = options.maxManifestBytes ?? defaultMaxPluginManifestBytes;
  const devRoot = join(options.userDataPath, "plugins-dev");
  await fs.mkdir(devRoot, { recursive: true });
  await assertRealDirectory(devRoot, "Plugin development directory is invalid.");
  const installPath = join(devRoot, options.manifest.id);
  const manifestPath = join(installPath, OPENPETS_PLUGIN_MANIFEST_FILENAME);
  const tempPath = join(devRoot, `.tmp-${options.manifest.id}-${process.pid}-${Date.now()}`);
  const tempManifestPath = join(tempPath, OPENPETS_PLUGIN_MANIFEST_FILENAME);
  await fs.rm(tempPath, { recursive: true, force: true });
  await fs.mkdir(tempPath, { recursive: true });
  try {
    await assertRealDirectory(tempPath, "Plugin temporary directory is invalid.");
    await fs.writeFile(tempManifestPath, options.manifestText, { mode: 0o600 });
    await readSafePluginManifest({ installPath: tempPath, manifestPath: tempManifestPath, allowedPluginRoots: [devRoot], maxManifestBytes: maxBytes, expectedId: options.manifest.id, expectedVersion: options.manifest.version });
    await ensureWritableInstallDirectory(installPath, manifestPath);
    await fs.rename(tempManifestPath, manifestPath);
  } finally {
    await fs.rm(tempPath, { recursive: true, force: true });
  }
  const copied = await readSafePluginManifest({ installPath, manifestPath, allowedPluginRoots: [devRoot], maxManifestBytes: maxBytes, expectedId: options.manifest.id, expectedVersion: options.manifest.version });
  return { manifest: copied, installPath, manifestPath };
}

async function ensureWritableInstallDirectory(installPath: string, manifestPath: string): Promise<void> {
  try {
    await assertRealDirectory(installPath, "Plugin install directory is invalid.");
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
    if (code !== "ENOENT") throw error;
    await fs.mkdir(installPath, { recursive: false, mode: 0o700 });
    await assertRealDirectory(installPath, "Plugin install directory is invalid.");
  }

  try {
    const manifestStat = await fs.lstat(manifestPath);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error("Plugin install manifest is invalid.");
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
    if (code !== "ENOENT") throw error;
  }
}

async function assertRealDirectory(path: string, message: string): Promise<void> {
  const stat = await fs.lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(message);
}

async function readBoundedUtf8(handle: FileHandle, maxBytes: number): Promise<string> {
  const buffer = Buffer.alloc(maxBytes + 1);
  const { bytesRead } = await handle.read(buffer, 0, maxBytes + 1, 0);
  if (bytesRead > maxBytes) throw new Error("Plugin manifest is too large.");
  return buffer.subarray(0, bytesRead).toString("utf8");
}

function isSafePluginDirectoryName(id: string): boolean {
  return id !== "." && id !== ".." && !id.startsWith(".") && !/[\\/]/.test(id);
}
