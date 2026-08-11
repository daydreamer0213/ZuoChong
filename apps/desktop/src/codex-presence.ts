import { execFile } from "node:child_process";

import { hasCodexDesktopWindow, supportsCodexDesktopPresence } from "./codex-presence-core.js";
import { debug, warn } from "./logger.js";

/**
 * Detects whether the Codex desktop app is showing its pet, so the OpenPets
 * default pet can step aside instead of duplicating the same character on
 * screen. On Windows the Codex desktop app runs as a process whose main-window
 * title is "Codex" (it ships inside the ChatGPT app). We poll the window title
 * via `tasklist /v`; the pet is considered visible while such a window exists.
 *
 * Other platforms stay disabled until OpenPets has a reliable window-level
 * detector; process-name matching would mistake the Codex CLI for a desktop
 * task window.
 */

export interface CodexPresenceOptions {
  readonly pollIntervalMs?: number;
}

const defaultPollIntervalMs = 3_000;

let pollTimer: NodeJS.Timeout | null = null;
let lastVisible: boolean | null = null;
let onChangeHandler: ((visible: boolean) => void) | null = null;
let polling = false;

export function startCodexPresenceWatch(onChange: (visible: boolean) => void, options: CodexPresenceOptions = {}): void {
  onChangeHandler = onChange;
  if (pollTimer) return;
  const intervalMs = options.pollIntervalMs ?? defaultPollIntervalMs;
  const tick = (): void => {
    if (polling) return;
    polling = true;
    void detectCodexDesktopVisible()
      .then((visible) => {
        if (lastVisible !== visible) {
          lastVisible = visible;
          debug("app", "codex presence changed", { visible });
          onChangeHandler?.(visible);
        }
      })
      .catch((error: unknown) => {
        warn("app", "codex presence probe failed", { error: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => {
        polling = false;
      });
  };
  tick();
  pollTimer = setInterval(tick, intervalMs);
  pollTimer.unref?.();
}

export function stopCodexPresenceWatch(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  lastVisible = null;
  onChangeHandler = null;
}

export function isCodexDesktopVisible(): boolean | null {
  return lastVisible;
}

export function detectCodexDesktopVisible(): Promise<boolean> {
  if (!supportsCodexDesktopPresence(process.platform)) return Promise.resolve(false);
  return detectWindowsCodexWindow();
}

function detectWindowsCodexWindow(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("tasklist", ["/v", "/fo", "csv", "/nh"], { windowsHide: true, timeout: 10_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        resolve(false);
        return;
      }
      resolve(hasCodexDesktopWindow(stdout));
    });
  });
}
