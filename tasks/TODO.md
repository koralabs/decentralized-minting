# DeMi SubHandle Minting + Burn (Unattended)

Source inputs:
- `docs/product/demi-subhandle-minting.md` (authoritative spec + work breakdown roadmap)
- `docs/product/legacy-parity-plan.md` (background)
- root + local `AGENTS.md`
- Cross-repo: `handles-personalization`, `minting.handle.me`, `handle.me/bff`

Generated: 2026-06-05

Objective:
- Relocate DeMi subhandle minting onto the orders path under the DeMi policy `6c32db33`
  (done), add the free-virtual name-set allowance, build the DeMi + personalization burn
  paths, cascade off-chain, and deploy+verify on preview.

> This is a **multi-repo** effort. Each task names its repo. Commit to that repo. Doc updates
> apply to the relevant repo's `docs/`. `docs/spec/gaps.md` does not exist; this TODO is the
> coverage map. Source-of-truth for progress is `tasks/TASK_STATE.md`.

## Phase coverage

- `PHASE-0-DONE` (already landed): `DSH-001`, `DSH-002`, `DSH-003`, `DSH-004`
- `PHASE-1-FREEVIRTUAL` (contract mint side): `DSH-101`, `DSH-102`, `DSH-103`
- `PHASE-2-DEMI-BURN` (contract burn side): `DSH-201`, `DSH-202`, `DSH-203`
- `PHASE-3-PZ-BURN` (personalization): `DSH-301`, `DSH-302`
- `PHASE-4-CASCADE` (package + engine + BFF): `DSH-401`, `DSH-402`, `DSH-403`, `DSH-501`, `DSH-502`, `DSH-503`
- `PHASE-5-DEPLOY`: `DSH-601`, `DSH-602`

## Tasks

### PHASE-0-DONE
- [x] `DSH-001` (decentralized-minting) Strip subhandle fees/free-virtual off the legacy path
- [x] `DSH-002` (decentralized-minting) Confirm orders are DeMi-only
- [x] `DSH-003` (decentralized-minting) DeMi subhandle minting on the orders path (owner fee + folded flat fees, virtual 000 / nft 100+222)
- [x] `DSH-004` (decentralized-minting) Owner-fee double-satisfaction tests

### PHASE-1-FREEVIRTUAL
- [x] `DSH-101` (decentralized-minting) `registry_value`: `(count,labels)` → `(free_names,labels)` encoding + helpers (add/remove/has-name, free-iff-`<N`); update `registry_value.test.ak`. deps: DSH-003 — **done f31fdd5**
- [ ] `DSH-102` (decentralized-minting) Re-introduce per-order `free_virtual: Option<FreeVirtualData>` (root key MPT proof + current `free_names`) on the orders path; free while `|free_names| < free_virtual_count` (add name) else paid; change `MintNewHandles` proof element; ripple `LabelAssetProof` (`old_free_names`). deps: DSH-101
- [ ] `DSH-103` (decentralized-minting) Free-virtual mint tests (free under allowance, paid over, public never free, encoding round-trip). deps: DSH-102

### PHASE-2-DEMI-BURN
- [ ] `DSH-201` (decentralized-minting) Implement governor `can_burn_handles` (`demimnt`, currently stub `False`): authorize the `-1` mint (allowed-minter + coordinated with the minting-data spend). deps: DSH-003
- [ ] `DSH-202` (decentralized-minting) Add `demimntmpt` `BurnNewHandles` redeemer: MPT delete (existence-before/absence-after) + expect `-1` mint value + remove a free virtual's name (reopen slot). deps: DSH-102, DSH-201
- [ ] `DSH-203` (decentralized-minting) Burn-path contract tests (nft burn -1 of 100+222, virtual burn -1 of 000, MPT delete, free-name reopen). deps: DSH-202

### PHASE-3-PZ-BURN
- [ ] `DSH-301` (handles-personalization) New NFT/root burn redeemer: release the held `100` ref **iff** the matching `222` is also being burned in the tx (owner consent). Covers roots + nft subs, DeMi + legacy. (Virtual `Revoke` already exists — no change.) deps: none
- [ ] `DSH-302` (handles-personalization) Personalization burn tests. deps: DSH-301

### PHASE-4-CASCADE
- [ ] `DSH-401` (decentralized-minting pkg) Relocate subhandle build legacy→orders path; build the richer free-virtual proofs (root proof + free_names). deps: DSH-102
- [ ] `DSH-402` (decentralized-minting pkg) Burn tx builders (governor `BurnHandles` + `demimntmpt` `BurnNewHandles` + pz burn/`Revoke`). deps: DSH-202, DSH-301
- [ ] `DSH-403` (decentralized-minting pkg) Regenerate blueprints (redeemer ABI changed → new hashes); update pinned-hash test + deploy config. deps: DSH-102, DSH-202
- [ ] `DSH-501` (minting.handle.me) Move additive fee outputs legacy→orders path (owner→payment_address, flat minter→allowed_minter, flat treasury→treasury_address, folded; token outputs before owner-fee outputs); write free-virtual names to tx metadata. deps: DSH-401
- [ ] `DSH-502` (minting.handle.me) Build burn txs end-to-end. deps: DSH-402, DSH-501
- [ ] `DSH-503` (handle.me/bff) Confirm `buy_down` fully removed; align fee display with the additive model. deps: DSH-401

### PHASE-5-DEPLOY
- [ ] `DSH-601` (decentralized-minting + adahandle-deployments) Regenerate Phase-1 bundle with final hashes; deploy new pz contract; publish package; deploy engine. **multisig sign + admin sign required.** deps: DSH-403, DSH-302, DSH-502, DSH-503
- [ ] `DSH-602` (preview) Verify on-chain: nft sub mint, virtual sub mint, owner-fee payout, 3 free virtuals, admin refund, nft burn (222-check), virtual burn (Revoke), MPT delete. deps: DSH-601

## Deferred (out of scope for this run)
- Voluntary holder-burn UX
- Migrating the 50k+ tokens at old pz contracts into the burn-capable new contract (admin `Migrate`)
