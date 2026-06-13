# Handle MPT Trie Sourcing — API-only, never disk-cached

**Design law:** the Merkle Patricia Trie (MPT) of minted handles is **always
rebuilt fresh, in-memory, from the handle registry API on every invocation**,
verified against the on-chain root before use, and **never persisted to or
loaded from local disk**.

This is a hard rule, not a preference. It must not be "optimized" into a disk
cache.

## Why no disk cache

- **The on-chain root is the only source of truth.** The authoritative MPT
  root lives on-chain and is read via the API (`mpt_root_hash` /
  `datum_mpt_root_hash`). Any local on-disk copy of the trie is a *second
  copy* that can silently drift from it.
- **The engine runs in a Lambda.** Local disk (`/tmp`) is ephemeral and
  survives *unpredictably* across warm invocations. A disk cache is therefore
  both **useless** (cold starts see nothing) and a **correctness hazard** (a
  warm container can load a stale root). A cache that "sometimes persists" is
  worse than no cache at all — it manufactures drift while looking like
  persistence.
- **Rebuilding is cheap relative to the failure mode.** Re-fetching the
  handle set and building the trie costs far less than minting against stale
  state. If the API is unreachable, **abort the mint** — there is no fallback
  to a local copy.

## How it actually works (production)

1. **`minting.handle.me` → `verifyRootHash()`**
   (`src/helpers/legacyMinting/utils.ts`): fetches the API root + the on-chain
   `datum_mpt_root_hash`, and throws `RootHashMismatchError` (aborts the mint)
   if they disagree.
2. **`buildApiRootTrie()`**: fetches all handles via the API `/handles`
   endpoint (`fetchHandlesApiTextPaginated`) and builds the trie in-memory with
   `Trie.fromList(...)`. No disk `Store`.
3. The built `db: Trie` is handed to the engine
   (`decentralized-minting` → `prepareNewMintTransaction`), which **hard-errors
   on `"Local DB and On Chain Root Hash mismatch"`** (`src/txs/prepareNewMint.ts`)
   before it will build any mint proofs.

The SDK helper `buildTrie(handles)` in `src/store/index.ts` mirrors this
in-memory construction (`Trie.fromList`) for CLI / SDK consumers.

## Guardrails

- `src/store/index.ts` carries the DESIGN LAW as a header comment and contains
  **no `Store(folder)` / `fs`** coupling.
- `tests/store.unit.test.ts` has a CI guard that **fails the build** if a disk
  `Store` or `fs` import is reintroduced into `src/store/index.ts`.

## History

The disk-`Store` path (`init(folder)`, `clear(folder)`) was removed
2026-06-07. It was dead code — production never called it — but an automated
self-fix (PR #43) "repaired" its empty-trie behaviour and tried to merge a
disk-load path into the engine. That fixed dead code and entrenched exactly
the cache pattern this law forbids. The PR was denied; the disk path was
removed so it can't be mistaken for a real persistence layer again.
