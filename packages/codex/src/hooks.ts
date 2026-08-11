import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir, tmpdir, userInfo } from "node:os";

import { createOpenPetsClient, type OpenPetsClient, type OpenPetsReaction, OpenPetsClientError } from "@open-pets/client";
import { validateHookSpeech as validateSharedHookSpeech } from "@open-pets/agent-events";

import { pickHookSpeech, type HookSpeechCategory } from "./hook-messages.js";

/**
 * Codex lifecycle hooks — mirrors the Claude Code hook integration, adapted to
 * Codex's own hook mechanism (`[hooks]` in ~/.codex/config.toml). Event names
 * and payloads follow OpenAI Codex's lifecycle hook contract; parsing is kept
 * lenient (multiple field spellings) so minor upstream format drift degrades to
 * "no reaction" instead of a broken hook.
 */

export type CodexHookEventName =
  | "SessionStart"
  | "SessionEnd"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "PermissionRequest"
  | "PreCompact"
  | "PostCompact"
  | "SubagentStart"
  | "SubagentStop"
  | "Stop";

export interface CodexHookDecision {
  readonly eventName?: CodexHookEventName;
  readonly reaction?: OpenPetsReaction;
  readonly speechCategory?: HookSpeechCategory;
}

export interface CodexHookOptions {
  readonly client?: OpenPetsClient;
  readonly configuredPetId?: string;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly throttlePath?: string;
  readonly debug?: boolean;
}

const maxHookInputBytes = 64 * 1024;
const speechCooldownMs = 20_000;
const permissionCooldownMs = 3_000;
const reactionCooldownMs = 10_000;

export async function runCodexHookFromStdin(stdin: NodeJS.ReadStream = process.stdin, options: CodexHookOptions = {}): Promise<number> {
  try {
    const raw = await readLimitedStdin(stdin, maxHookInputBytes);
    await handleCodexHookPayload(raw, options);
    return 0;
  } catch (error) {
    if (options.debug || process.env.OPENPETS_DEBUG === "1") {
      process.stderr.write(`OpenPets Codex hook ignored error: ${sanitizeDebugError(error)}\n`);
    }
    return 0;
  }
}

export async function handleCodexHookPayload(raw: string, options: CodexHookOptions = {}): Promise<CodexHookDecision | null> {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseHookPayload(raw);
  } catch {
    return null;
  }
  const decision = mapCodexHookEvent(parsed);
  if (!decision?.reaction) return decision;

  const shouldSpeak = decision.speechCategory ? shouldSendSpeech(decision.speechCategory, options) : false;
  const shouldReact = shouldSendReaction(decision.reaction, options);
  if (!shouldSpeak && !shouldReact) return decision;

  const client = options.client ?? createOpenPetsClient({ connectTimeoutMs: 500, responseTimeoutMs: 500 });
  const lease = options.configuredPetId ? await acquireHookLease(client, options.configuredPetId, options.debug) : undefined;
  try {
    if (decision.speechCategory && shouldSpeak) {
      const message = validateSharedHookSpeech(pickHookSpeech(decision.speechCategory, options.random));
      await client.say(message, { reaction: decision.reaction, leaseId: lease?.leaseId });
    } else {
      await client.react(decision.reaction, { leaseId: lease?.leaseId });
    }
  } catch (error) {
    if (!(error instanceof OpenPetsClientError) && options.debug) {
      process.stderr.write(`OpenPets Codex hook client error: ${sanitizeDebugError(error)}\n`);
    }
  }
  return decision;
}

async function acquireHookLease(client: OpenPetsClient, requestedPetId: string, debug = false): Promise<{ readonly leaseId: string } | undefined> {
  try {
    return await client.acquireLease({ requestedPetId });
  } catch (error) {
    if (debug) process.stderr.write(`OpenPets Codex hook lease unavailable: ${sanitizeDebugError(error)}\n`);
    return undefined;
  }
}

export function parseHookPayload(raw: string): Record<string, unknown> {
  if (Buffer.byteLength(raw, "utf8") > maxHookInputBytes) throw new Error("Codex hook payload is too large.");
  const parsed = JSON.parse(raw || "{}") as unknown;
  return isRecord(parsed) ? parsed : {};
}

function readEventName(payload: Record<string, unknown>): CodexHookEventName | undefined {
  const raw = typeof payload.hook_event_name === "string"
    ? payload.hook_event_name
    : typeof payload.event_name === "string"
      ? payload.event_name
      : typeof payload.event === "string"
        ? payload.event
        : undefined;
  return raw as CodexHookEventName | undefined;
}

export function mapCodexHookEvent(payload: Record<string, unknown>): CodexHookDecision | null {
  const eventName = readEventName(payload);
  if (eventName === "UserPromptSubmit") return { eventName, reaction: "thinking" };
  if (eventName === "PermissionRequest") return { eventName, reaction: "waiting", speechCategory: "permission" };
  if (eventName === "Stop") return { eventName, reaction: "success" };
  if (eventName === "SessionStart") return { eventName, reaction: "waving" };
  if (eventName === "SubagentStart") return { eventName, reaction: "thinking" };
  if (eventName === "PreToolUse") return { eventName, reaction: classifyToolReaction(payload) };
  return eventName ? { eventName } : null;
}

function classifyToolReaction(payload: Record<string, unknown>): OpenPetsReaction | undefined {
  const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "";
  if (toolName === "Edit" || toolName === "Write" || toolName === "apply_patch" || toolName === "MultiEdit") return "editing";
  if (toolName === "Bash" || toolName === "shell") {
    const command = extractBashCommand(payload.tool_input);
    return /\b(test|vitest|jest|pytest|npm\s+test|pnpm\s+test|yarn\s+test|cargo\s+test|go\s+test)\b/i.test(command) ? "testing" : undefined;
  }
  return undefined;
}

function extractBashCommand(value: unknown): string {
  return isRecord(value) && typeof value.command === "string" ? value.command.slice(0, 300) : "";
}

export function getDefaultThrottlePath(): string {
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
    return join(base, "OpenPets", "codex-hook-throttle.json");
  }
  const stateHome = process.env.XDG_STATE_HOME || join(homedir(), ".local", "state");
  if (stateHome) return join(stateHome, "openpets", "codex-hook-throttle.json");
  const uid = safeUid();
  return join(tmpdir(), `openpets-${uid}`, "codex-hook-throttle.json");
}

function safeUid(): string {
  try { return String(userInfo().uid); } catch { return "user"; }
}

function shouldSendSpeech(category: HookSpeechCategory, options: CodexHookOptions): boolean {
  const now = options.now?.() ?? Date.now();
  const cooldown = category === "permission" ? permissionCooldownMs : speechCooldownMs;
  return shouldSendThrottleKey(category, cooldown, now, options.throttlePath ?? getDefaultThrottlePath());
}

function shouldSendReaction(reaction: OpenPetsReaction, options: CodexHookOptions): boolean {
  const now = options.now?.() ?? Date.now();
  return shouldSendThrottleKey(`reaction:${reaction}`, reactionCooldownMs, now, options.throttlePath ?? getDefaultThrottlePath());
}

function shouldSendThrottleKey(key: string, cooldown: number, now: number, path: string): boolean {
  const state = readThrottleState(path);
  const previous = typeof state[key] === "number" ? state[key] : 0;
  if (now - previous < cooldown) return false;
  state[key] = now;
  writeThrottleState(path, state);
  return true;
}

function readThrottleState(path: string): Record<string, number> {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isRecord(parsed)) return {};
    const state: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if ((key === "thinking" || key === "success" || key === "error" || key === "permission" || key.startsWith("reaction:")) && typeof value === "number" && Number.isFinite(value)) state[key] = value;
    }
    return state;
  } catch {
    return {};
  }
}

function writeThrottleState(path: string, state: Record<string, number>): void {
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const tempPath = `${path}.${process.pid}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(tempPath, path);
  } catch {
    // Best effort only; throttling must never break hooks.
  }
}

function readLimitedStdin(stdin: NodeJS.ReadStream, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let bytes = 0;
    let settled = false;
    stdin.setEncoding("utf8");
    const cleanup = (): void => {
      stdin.off("data", onData);
      stdin.off("error", onError);
      stdin.off("end", onEnd);
    };
    const onData = (chunk: string): void => {
      if (settled) return;
      bytes += Buffer.byteLength(chunk, "utf8");
      if (bytes > maxBytes) {
        settled = true;
        cleanup();
        stdin.destroy();
        reject(new Error("Codex hook stdin is too large."));
        return;
      }
      buffer += chunk;
    };
    const onError = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onEnd = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(buffer);
    };
    stdin.on("data", onData);
    stdin.on("error", onError);
    stdin.on("end", onEnd);
  });
}

function sanitizeDebugError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(?:[A-Za-z]:)?[\\/][^\s"']{2,}/g, "<path>").slice(0, 200);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
