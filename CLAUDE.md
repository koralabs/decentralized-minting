# CLAUDE.md

Read [`AGENTS.md`](./AGENTS.md) first (and the master AGENTS.md in the parent
folder). The points below are load-bearing rules for this repo.

## DESIGN LAW — Handle MPT is API-only sourced, NEVER disk-cached

The Merkle Patricia Trie of minted handles is **always rebuilt fresh,
in-memory, from the handle registry API on every invocation**, verified
against the on-chain root, and **never persisted to or loaded from local
disk**.

- The on-chain root (read via the API) is the **only** source of truth. A
  local on-disk trie is a second copy that can silently drift from it.
- The minting engine runs in a **Lambda**. Local disk (`/tmp`) is ephemeral
  and survives unpredictably across warm invocations — a disk cache is both
  useless and a correctness hazard. A cache that "sometimes persists" is worse
  than none.
- If the API is unreachable, **abort the mint**. There is no local fallback.

**Do not** reintroduce a disk-backed `Store(folder)` or `fs` persistence into
`src/store/index.ts`, and do not "repair" code toward loading the trie from
disk. An automated self-fix (PR #43, denied 2026-06-07) did exactly that —
against dead code production never called — fixing nothing real and
entrenching the cache pattern this law forbids.

References:
- Full spec: [`docs/spec/mpt-trie-sourcing.md`](./docs/spec/mpt-trie-sourcing.md)
- Production build: `minting.handle.me` → `verifyRootHash` / `buildApiRootTrie`
  (`Trie.fromList` over the `/handles` API), then the engine's hard root check
  in `src/txs/prepareNewMint.ts`.
- CI guard: `tests/store.unit.test.ts` fails if disk `Store` / `fs` coupling
  returns to `src/store/index.ts`.
