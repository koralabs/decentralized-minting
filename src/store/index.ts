import { Trie } from "@aiken-lang/merkle-patricia-forestry";

import { valueBuffer } from "./labelSet.js";
import { encode as encodeRegistryValue } from "./registryValue.js";

/**
 * DESIGN LAW — the handle MPT is API-only sourced, NEVER disk-cached.
 *
 * The Merkle Patricia Trie of minted handles is ALWAYS rebuilt fresh,
 * in-memory, from the handle registry API on every invocation, and verified
 * against the on-chain root before use. The engine hard-errors on
 * "Local DB and On Chain Root Hash mismatch" (see src/txs/prepareNewMint.ts)
 * precisely so a wrong local trie can never be minted against. The trie is
 * NEVER persisted to, nor loaded from, local disk.
 *
 * Why no disk cache:
 *  - The on-chain root (read via the API) is the ONLY source of truth. Any
 *    local on-disk copy is a second copy that can silently drift from it.
 *  - The minting engine runs in a Lambda. Local disk (/tmp) is ephemeral and
 *    survives unpredictably across warm invocations — so a disk cache is both
 *    useless (cold starts see nothing) AND a correctness hazard (a warm
 *    container can load a stale root). A cache that "sometimes persists" is
 *    worse than no cache at all.
 *  - Rebuilding from the API is cheap relative to the cost of minting against
 *    stale state. If the API is unreachable, ABORT the mint — there is no
 *    fallback to a local copy.
 *
 * Canonical production build: minting.handle.me `verifyRootHash` /
 * `buildApiRootTrie` — fetch all handles via the `/handles` endpoint and
 * `Trie.fromList(...)`, then verify the computed root equals the on-chain
 * `mpt_root_hash`. `buildTrie` below mirrors that in-memory construction for
 * SDK/CLI consumers.
 *
 * Do NOT reintroduce a disk-backed `Store(folder)` (or `fs`) here. The
 * disk-`Store` path was removed 2026-06-07 after an automated self-fix
 * (PR #43) tried to "repair" a disk-load branch that production never called
 * — fixing dead code and entrenching the very cache pattern this law forbids.
 * The `tests/store.unit.test.ts` guard fails CI if disk coupling returns.
 */

/** An API-sourced handle and its explicit canonical registry label set. */
export interface HandleRegistryEntry {
  name: string;
  labels: string;
}

// Validate the entire input before constructing or mutating a trie. The contract's
// label_set.ak stores sorted, unique four-byte labels; it does not whitelist IDs.
const registryEntries = (handles: readonly HandleRegistryEntry[]) => {
  if (!Array.isArray(handles)) {
    throw new TypeError("Registry handles must be an array of { name, labels } entries (SDK 4)");
  }
  const names = new Set<string>();
  return Array.from(handles, (entry: unknown, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new TypeError(`Registry entry ${index} must be { name, labels }; names-only SDK 3 inputs are unsupported`);
    }
    const { name, labels } = entry as Partial<HandleRegistryEntry>;
    if (typeof name !== "string" || name.length === 0) {
      throw new TypeError(`Registry entry ${index} requires a nonempty string name`);
    }
    if (names.has(name)) {
      throw new TypeError(`Registry entry ${index} repeats a handle name`);
    }
    names.add(name);
    if (typeof labels !== "string") {
      throw new TypeError(`Registry entry ${index} requires explicit string labels; use "" only for a known empty set`);
    }
    const canonical = encodeRegistryValue(labels);
    if (!/^(?:[0-9a-f]{8})*$/.test(canonical)) {
      throw new TypeError(`Registry labels at entry ${index} must contain complete four-byte hex labels`);
    }
    for (let offset = 8; offset < canonical.length; offset += 8) {
      if (canonical.slice(offset - 8, offset) >= canonical.slice(offset, offset + 8)) {
        throw new TypeError(`Registry labels at entry ${index} must be sorted and unique`);
      }
    }
    return { key: name, value: canonical ? valueBuffer(canonical) : "" };
  });
};

/**
 * Build the handle MPT in-memory from the handle list + per-handle label sets (API-sourced).
 * Mirrors the production `buildApiRootTrie`. No disk Store.
 *
 * LABEL-AWARE — labels are REQUIRED per handle (no bare-string overload, on purpose). The registry
 * value at each key is the handle's sorted, unique four-byte label set; "" only when it holds
 * none. A names-only `value:""` trie silently computes the WRONG (label-blind) root and deadlocks
 * every engine-verify mint (the on-chain `demimntmpt` root is label-aware), so the type forbids it.
 * For a handle that genuinely has no labels, pass `{ name, labels: "" }`.
 */
const buildTrie = async (handles: readonly HandleRegistryEntry[]): Promise<Trie> =>
  Trie.fromList(registryEntries(handles));

const inspect = async (db: Trie) => {
  // console.log(db.hash?.toString("hex") || Buffer.alloc(32).toString("hex"));
  console.log(db);
};

/**
 * Incremental in-memory insert helper (CLI / debug). The canonical full-set
 * build is `buildTrie` / `Trie.fromList`; prefer it for constructing the
 * whole handle trie. Operates on whatever in-memory `Trie` is passed.
 */
const fillHandles = async (
  db: Trie,
  handles: readonly HandleRegistryEntry[],
  progress: () => void,
) => {
  const entries = registryEntries(handles);
  for (const { key, value } of entries) {
    await db.insert(key, value);
    progress();
  }
  console.log(db);
};

const addHandle = async (db: Trie, key: string, value: string) => {
  await db.insert(key, value);
  console.log(db);
};

const removeHandle = async (db: Trie, key: string) => {
  await db.delete(key);
  console.log(db);
};

const printProof = async (
  db: Trie,
  key: string,
  format: "json" | "cborHex",
) => {
  const proof = await db.prove(key);
  switch (format) {
    case "json":
      console.log(proof.toJSON());
      break;
    case "cborHex":
      console.log(proof.toCBOR().toString("hex"));
      break;
  }
};

export { addHandle, buildTrie, fillHandles, inspect, printProof, removeHandle };
