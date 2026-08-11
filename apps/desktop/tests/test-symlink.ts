import { symlinkSync } from "node:fs";

export function createTestSymlink(target: string, path: string, type: "dir" | "file"): boolean {
  try {
    symlinkSync(target, path, type);
    return true;
  } catch (error) {
    if (process.platform !== "win32" || !isPermissionError(error)) throw error;
    if (type === "dir") {
      symlinkSync(target, path, "junction");
      return true;
    }
    console.error(`Skipping file-symlink assertion because Windows symlink privilege is unavailable: ${path}`);
    return false;
  }
}

function isPermissionError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EPERM";
}
