import { Trie } from "@aiken-lang/merkle-patricia-forestry";

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

/**
 * Build the handle MPT in-memory from a handle list (API-sourced). Mirrors
 * the production `buildApiRootTrie` (`Trie.fromList`). No disk Store.
 */
const buildTrie = async (handles: string[]): Promise<Trie> =>
  Trie.fromList(handles.map((handle) => ({ key: handle, value: "" })));

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
  handles: string[],
  progress: () => void,
) => {
  for (const handle of handles) {
    await db.insert(handle, "");
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
