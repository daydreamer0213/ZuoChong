import { randomBytes } from "node:crypto";
import net from "node:net";

import { applyAgentPetReaction, applyAgentPetSay, clearAgentPetLeaseState, showAgentPet } from "./agent-pet-controller.js";
import { getAppStateSnapshot } from "./app-state.js";
import { builtInPet } from "./built-in-pet.js";
import { applyExternalPetReaction, applyExternalPetSay, getDefaultPetPaused, isDefaultPetVisible } from "./default-pet-controller.js";
import { createStaleLeaseStatus, LeaseManager } from "./lease-manager.js";
import { cleanupUnixSocket, createIpcEndpoint, protectUnixSocket, removeDiscoveryFile, writeDiscoveryFile, type OpenPetsDiscoveryFile } from "./local-ipc-paths.js";
import { errorResponse, IpcProtocolError, isRecord, maxIpcMessageBytes, okResponse, parseIpcRequest, validateInstallPetId, validateOptionalLeaseId, validateReaction, validateRequestedPetId, validateSayMessage, type OpenPetsIpcRequest } from "./local-ipc-protocol.js";
import { installPet } from "./pet-installation.js";

let ipcServer: net.Server | null = null;
let ipcDiscovery: OpenPetsDiscoveryFile | null = null;
let leaseCleanupTimer: NodeJS.Timeout | null = null;
const leaseManager = new LeaseManager({
  resolveTarget: resolveLeaseTarget,
  getDefaultPetId: () => getCurrentDefaultPet().id,
  getPetDisplayName: (petId, targetKind) => targetKind === "default" ? getCurrentDefaultPet().displayName : getPetDisplayName(petId),
  onFirstExplicitLease: showAgentPet,
  onLastExplicitLease: handleLastExplicitLease,
});

const safePetIdPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export async function startLocalIpcServer(): Promise<void> {
  if (ipcServer) return;

  const endpoint = createIpcEndpoint();
  const token = randomBytes(32).toString("base64url");
  cleanupUnixSocket(endpoint);

  const server = net.createServer((socket) => handleSocket(socket, token));
  server.on("error", (error) => {
    console.error("OpenPets local IPC server error.", error);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(endpoint, () => {
      server.off("error", reject);
      protectUnixSocket(endpoint);
      resolve();
    });
  });

  ipcServer = server;
  ipcDiscovery = writeDiscoveryFile(endpoint, token);
  leaseCleanupTimer = setInterval(() => leaseManager.cleanupExpired(), 5_000);
  leaseCleanupTimer.unref?.();
  console.log(`OpenPets local IPC listening at ${endpoint}.`);
}

export function stopLocalIpcServer(): void {
  const server = ipcServer;
  const discovery = ipcDiscovery;
  ipcServer = null;
  ipcDiscovery = null;
  if (leaseCleanupTimer) clearInterval(leaseCleanupTimer);
  leaseCleanupTimer = null;
  removeDiscoveryFile(discovery);

  if (server) {
    server.close();
  }

  if (discovery) {
    cleanupUnixSocket(discovery.endpoint);
  }
}

function handleSocket(socket: net.Socket, token: string): void {
  socket.setEncoding("utf8");
  socket.setTimeout(3_000, () => socket.destroy());

  let buffer = "";
  let handled = false;

  socket.on("data", (chunk) => {
    if (handled) return;
    buffer += chunk;

    if (Buffer.byteLength(buffer, "utf8") > maxIpcMessageBytes) {
      handled = true;
      writeResponse(socket, errorResponse(null, new IpcProtocolError("invalid_request", "IPC request is too large.")));
      return;
    }

    const newline = buffer.indexOf("\n");
    if (newline === -1) return;

    handled = true;
    const raw = buffer.slice(0, newline);
    void handleRawRequest(raw, token).then((response) => writeResponse(socket, response));
  });

  socket.on("error", (error) => {
    if (isBenignSocketCloseError(error)) return;
    console.error("OpenPets local IPC client socket error.", error);
  });
}

async function handleRawRequest(raw: string, token: string) {
  let requestId: string | null = null;
  try {
    const request = parseIpcRequest(raw, token);
    requestId = request.id;
    return okResponse(request.id, await handleRequest(request));
  } catch (error) {
    return errorResponse(requestId, error);
  }
}

async function handleRequest(request: OpenPetsIpcRequest): Promise<unknown> {
  if (request.method === "hello") {
    return {
      ok: true,
      protocol: "openpets-ipc",
      protocolVersion: 1,
      appVersion: ipcDiscovery?.appVersion ?? "0.0.0",
    };
  }

  if (request.method === "status") {
    const params = isRecord(request.params) ? request.params : {};
    const leaseId = validateOptionalLeaseId(params.leaseId);
    if (leaseId) {
      const lease = leaseManager.get(leaseId);
      if (!lease) return createStaleLeaseStatus(leaseId);
      return { ok: true, appRunning: true, ...lease };
    }
    const state = getAppStateSnapshot();
    const defaultPet = state.pets.installed.find((pet) => pet.id === state.preferences.defaultPetId) ?? builtInPet;
    return {
      ok: true,
      appRunning: true,
      protocolVersion: 1,
      appVersion: ipcDiscovery?.appVersion ?? "0.0.0",
      defaultPet: {
        id: defaultPet.id,
        displayName: defaultPet.displayName,
        builtIn: defaultPet.builtIn,
        broken: "broken" in defaultPet && defaultPet.broken === true,
      },
      paused: getDefaultPetPaused(),
      defaultPetVisible: isDefaultPetVisible(),
      openDefaultPetOnLaunch: state.preferences.openDefaultPetOnLaunch,
      speechBubblesEnabled: state.preferences.speechBubblesEnabled,
    };
  }

  if (request.method === "pets.list") {
    const state = getAppStateSnapshot();
    return {
      ok: true,
      pets: state.pets.installed.map((pet) => ({
        id: pet.id,
        displayName: pet.displayName,
        builtIn: pet.builtIn,
        broken: pet.broken === true,
      })),
      defaultPetId: state.preferences.defaultPetId,
    };
  }

  if (request.method === "pets.install") {
    const params = isRecord(request.params) ? request.params : {};
    const petId = validateInstallPetId(params.petId);
    const state = await installPet(petId);
    const installed = state.pets.installed.find((pet) => pet.id === petId);
    if (!installed) throw new IpcProtocolError("install_failed", "Pet install did not complete.");
    return { ok: true, petId: installed.id, displayName: installed.displayName, installed: true };
  }

  if (request.method === "lease.acquire") {
    const params = isRecord(request.params) ? request.params : {};
    return leaseManager.acquire(validateRequestedPetId(params.requestedPetId));
  }

  if (request.method === "lease.heartbeat") {
    const params = isRecord(request.params) ? request.params : {};
    const leaseId = validateRequiredLeaseId(params.leaseId);
    try {
      return leaseManager.heartbeat(leaseId);
    } catch {
      throw new IpcProtocolError("unknown_lease", "Unknown or expired lease.");
    }
  }

  if (request.method === "lease.release") {
    const params = isRecord(request.params) ? request.params : {};
    return leaseManager.release(validateRequiredLeaseId(params.leaseId));
  }

  if (request.method === "pet.react") {
    const params = isRecord(request.params) ? request.params : {};
    const reaction = validateReaction(params.reaction);
    const lease = getLeaseTarget(params.leaseId);
    if (lease?.targetKind === "explicit") {
      if (getDefaultPetPaused()) return { ok: true, reaction, shown: false, reason: "paused", leaseId: lease.leaseId };
      const applied = applyAgentPetReaction(lease.actualTargetPetId, reaction);
      return { ok: true, reaction, shown: applied.shown, reason: applied.reason, leaseId: lease.leaseId };
    }
    const applied = applyExternalPetReaction(reaction);
    return { ok: true, reaction, shown: applied.shown, reason: applied.reason };
  }

  const params = isRecord(request.params) ? request.params : {};
  const message = validateSayMessage(params.message);
  const reaction = params.reaction === undefined ? undefined : validateReaction(params.reaction);
  const lease = getLeaseTarget(params.leaseId);
  if (lease?.targetKind === "explicit") {
    if (getDefaultPetPaused()) return { ok: true, shown: false, reason: "paused", reaction, leaseId: lease.leaseId };
    const applied = applyAgentPetSay(lease.actualTargetPetId, message, reaction);
    return { ok: true, shown: applied.shown, reason: applied.reason, reaction, leaseId: lease.leaseId };
  }
  const applied = applyExternalPetSay(message, reaction);
  return { ok: true, shown: applied.shown, reason: applied.reason, reaction };
}

function validateRequiredLeaseId(value: unknown): string {
  const leaseId = validateOptionalLeaseId(value);
  if (!leaseId) throw new IpcProtocolError("invalid_params", "Lease id is required.");
  return leaseId;
}

function getLeaseTarget(value: unknown) {
  const leaseId = validateOptionalLeaseId(value);
  if (!leaseId) return null;
  const lease = leaseManager.get(leaseId);
  if (!lease) throw new IpcProtocolError("unknown_lease", "Unknown or expired lease.");
  return lease;
}

function handleLastExplicitLease(petId: string): void {
  clearAgentPetLeaseState(petId);
}

function writeResponse(socket: net.Socket, response: unknown): void {
  if (socket.destroyed || !socket.writable) return;
  socket.end(`${JSON.stringify(response)}\n`);
}

function isBenignSocketCloseError(error: NodeJS.ErrnoException): boolean {
  return error.code === "EPIPE" || error.code === "ECONNRESET" || error.code === "ERR_STREAM_DESTROYED";
}

function resolveLeaseTarget(requestedPetId: string | undefined): { readonly targetKind: "default" | "explicit"; readonly actualPetId: string; readonly fallbackReason?: "invalid_pet_id" | "pet_not_installed" | "pet_broken" | "default_broken_fallback_builtin" } {
  const defaultPet = getCurrentDefaultPetWithFallback();
  if (!requestedPetId || requestedPetId === builtInPet.id || requestedPetId === defaultPet.id) {
    return { targetKind: "default", actualPetId: defaultPet.id, fallbackReason: defaultPet.fallbackReason };
  }
  if (!safePetIdPattern.test(requestedPetId)) {
    return { targetKind: "default", actualPetId: defaultPet.id, fallbackReason: "invalid_pet_id" };
  }
  const pet = getAppStateSnapshot().pets.installed.find((candidate) => candidate.id === requestedPetId);
  if (!pet) return { targetKind: "default", actualPetId: defaultPet.id, fallbackReason: "pet_not_installed" };
  if (pet.broken) return { targetKind: "default", actualPetId: defaultPet.id, fallbackReason: "pet_broken" };
  return { targetKind: "explicit", actualPetId: pet.id };
}

function getCurrentDefaultPet(): { readonly id: string; readonly displayName: string } {
  const pet = getCurrentDefaultPetWithFallback();
  return { id: pet.id, displayName: pet.displayName };
}

function getCurrentDefaultPetWithFallback(): { readonly id: string; readonly displayName: string; readonly fallbackReason?: "default_broken_fallback_builtin" } {
  const state = getAppStateSnapshot();
  const configuredDefault = state.pets.installed.find((pet) => pet.id === state.preferences.defaultPetId);
  if (configuredDefault && !configuredDefault.broken) return configuredDefault;
  return { ...builtInPet, fallbackReason: "default_broken_fallback_builtin" };
}

function getPetDisplayName(petId: string): string {
  return getAppStateSnapshot().pets.installed.find((pet) => pet.id === petId)?.displayName ?? petId;
}
