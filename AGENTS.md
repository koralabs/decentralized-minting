# AGENTS.md

## Master AGENTS.md
- [REQUIREMENT] Read the AGENTS.md in this project's parent folder for complete instructions and inter-project references

## DESIGN LAW — Handle MPT is API-only sourced, NEVER disk-cached
The Merkle Patricia Trie of minted handles is **always rebuilt fresh,
in-memory, from the handle registry API on every invocation**, verified
against the on-chain root, and **never persisted to or loaded from local
disk**. The on-chain root (read via the API) is the only source of truth; the
engine runs in a Lambda where a local `/tmp` cache is ephemeral, drift-prone,
and worse than no cache. If the API is unreachable, **abort the mint** — there
is no local fallback.

Do **not** add a disk-backed `Store(folder)` or `fs` persistence to
`src/store/index.ts`, and do not "fix" code toward loading the trie from disk.
A self-fix (PR #43, denied) once tried exactly that against dead code — see
[`docs/spec/mpt-trie-sourcing.md`](./docs/spec/mpt-trie-sourcing.md) for the
full law, the production path (`minting.handle.me` `verifyRootHash` /
`buildApiRootTrie`), and the CI guard in `tests/store.unit.test.ts`.
