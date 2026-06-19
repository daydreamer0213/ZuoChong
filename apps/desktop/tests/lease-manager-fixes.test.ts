/**
 * Tests for Fix 1 (idempotent per-clientPid lease reuse) and
 * Fix 4 (terminalOwnerPid liveness check in checkPidLiveness).
 */
import assert from "node:assert/strict";

import { LeaseManager } from "../src/lease-manager.js";

// ---------------------------------------------------------------------------
// T1: Fix 1 — same clientPid re-acquires same lease (pool session, requestedPetId=undefined)
// ---------------------------------------------------------------------------
{
  let now = 1_000;
  const firstOpened: string[] = [];
  let callCount = 0;

  // Use a forward-ref to allow resolveTarget to call countExplicitLeases.
  let mgr!: LeaseManager;
  mgr = new LeaseManager({
    ttlMs: 10_000,
    now: () => now,
    resolveTarget: (_requestedPetId) => {
      // Simulates pool behavior: returns explicit/P only if no explicit lease
      // for P exists yet (the slot is free). Otherwise falls back to default.
      callCount++;
      if (mgr.countExplicitLeases("P") === 0) {
        return { targetKind: "explicit", actualPetId: "P" };
      }
      return { targetKind: "default", actualPetId: "builtin" };
    },
    getDefaultPetId: () => "builtin",
    getPetDisplayName: (petId) => petId,
    onFirstExplicitLease: (petId) => firstOpened.push(petId),
  });

  const s1 = mgr.acquire(undefined, 111);
  assert.equal(s1.targetKind, "explicit", "T1: first acquire should be explicit");
  assert.equal(s1.actualTargetPetId, "P", "T1: first acquire should target P");

  const resolveCallsAfterFirst = callCount;

  now += 100; // advance time slightly (still within TTL)
  const s2 = mgr.acquire(undefined, 111);
  assert.equal(s2.leaseId, s1.leaseId, "T1: second acquire should return SAME leaseId");
  assert.equal(s2.targetKind, "explicit", "T1: reused lease should still be explicit");
  assert.equal(s2.actualTargetPetId, "P", "T1: reused lease should still target P");

  // Fix 1: #resolveTarget must NOT have been called again for the second acquire
  assert.equal(callCount, resolveCallsAfterFirst, "T1: resolveTarget must NOT be called on reuse");

  // onFirstExplicitLease must have fired exactly once
  assert.equal(firstOpened.length, 1, "T1: onFirstExplicitLease fired more than once");
  assert.equal(firstOpened[0], "P", "T1: onFirstExplicitLease fired for wrong pet");

  console.log("T1 (Fix 1 — same clientPid reuse): PASS");
}

// ---------------------------------------------------------------------------
// T2: Fix 1 — different clientPids get distinct leases
// ---------------------------------------------------------------------------
{
  let now = 1_000;
  const firstOpened: string[] = [];
  let callCount = 0;
  const petIds = ["P", "Q"];

  let mgr!: LeaseManager;
  mgr = new LeaseManager({
    ttlMs: 10_000,
    now: () => now,
    resolveTarget: (_requestedPetId) => {
      // Round-robin pool simulation: each call gets a distinct pet
      const petId = petIds[callCount % petIds.length];
      callCount++;
      return { targetKind: "explicit", actualPetId: petId };
    },
    getDefaultPetId: () => "builtin",
    getPetDisplayName: (petId) => petId,
    onFirstExplicitLease: (petId) => firstOpened.push(petId),
  });

  const s1 = mgr.acquire(undefined, 111);
  const s2 = mgr.acquire(undefined, 222);

  assert.notEqual(s1.leaseId, s2.leaseId, "T2: different clientPids must get distinct leaseIds");
  assert.notEqual(s1.actualTargetPetId, s2.actualTargetPetId, "T2: different clientPids must get different pets");
  assert.equal(s1.targetKind, "explicit", "T2: pid 111 lease should be explicit");
  assert.equal(s2.targetKind, "explicit", "T2: pid 222 lease should be explicit");

  // resolveTarget was called once per distinct pid (no reuse across pids)
  assert.equal(callCount, 2, "T2: resolveTarget should be called once per distinct clientPid");

  console.log("T2 (Fix 1 — distinct clientPids not collapsed): PASS");
}

// ---------------------------------------------------------------------------
// T3: Skipped — wiring local-ipc routing guard requires heavy electron-stub
// seam plumbing across multiple handler layers; coverage of the routing logic
// is already provided by local-ipc-confinement.test.ts.
// ---------------------------------------------------------------------------
console.log("T3 (routing guard): SKIPPED — covered by local-ipc-confinement.test.ts");

// ---------------------------------------------------------------------------
// T4: Fix 4 — dead terminalOwnerPid triggers lease release + onLastExplicitLease
// ---------------------------------------------------------------------------
{
  let now = 1_000;
  const lastClosed: string[] = [];

  const mgr = new LeaseManager({
    ttlMs: 60_000,
    now: () => now,
    resolveTarget: (id) => id ? { targetKind: "explicit", actualPetId: id } : { targetKind: "default", actualPetId: "builtin" },
    getDefaultPetId: () => "builtin",
    getPetDisplayName: (petId) => petId,
    onLastExplicitLease: (petId) => lastClosed.push(petId),
  });

  const snap = mgr.acquire("rex", process.pid);
  // Set a dead terminalOwnerPid (process 999_999_999 does not exist)
  mgr.setTerminalIdentity(snap.leaseId, { terminalOwnerPid: 999_999_999, terminalAppName: "Ghostty" });

  const released = mgr.checkPidLiveness();

  assert.equal(released.length, 1, "T4: dead terminalOwnerPid should cause lease release");
  assert.equal(released[0].actualTargetPetId, "rex", "T4: released lease should target rex");
  assert.equal(mgr.get(snap.leaseId), null, "T4: lease should no longer be active");
  assert.equal(lastClosed.join(","), "rex", "T4: onLastExplicitLease('rex') should have fired");

  console.log("T4 (Fix 4 — dead terminalOwnerPid releases lease): PASS");
}

// ---------------------------------------------------------------------------
// T5: Fix 4 — heartbeat does NOT defeat owner-death teardown
// ---------------------------------------------------------------------------
{
  let now = 1_000;
  const lastClosed: string[] = [];

  const mgr = new LeaseManager({
    ttlMs: 60_000,
    now: () => now,
    resolveTarget: (id) => id ? { targetKind: "explicit", actualPetId: id } : { targetKind: "default", actualPetId: "builtin" },
    getDefaultPetId: () => "builtin",
    getPetDisplayName: (petId) => petId,
    onLastExplicitLease: (petId) => lastClosed.push(petId),
  });

  const snap = mgr.acquire("rex", process.pid);
  mgr.setTerminalIdentity(snap.leaseId, { terminalOwnerPid: 999_999_999, terminalAppName: "Ghostty" });

  // Heartbeat refreshes TTL but should NOT protect against dead terminalOwnerPid
  now += 1_000;
  mgr.heartbeat(snap.leaseId);

  const released = mgr.checkPidLiveness();

  assert.equal(released.length, 1, "T5: heartbeat must not protect against dead terminalOwnerPid");
  assert.equal(mgr.get(snap.leaseId), null, "T5: lease should be released even after heartbeat");
  assert.equal(lastClosed.join(","), "rex", "T5: onLastExplicitLease should still fire");

  console.log("T5 (Fix 4 — heartbeat does not defeat owner-death): PASS");
}

console.log("\nAll lease-manager-fixes tests passed.");
