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
- `PHASE-1-FREEVIRTUAL` (contract mint side, DONE): `DSH-101`, `DSH-102`, `DSH-103`
- `PHASE-2-DEMI-BURN` (contract burn side, DONE): `DSH-201`, `DSH-202`, `DSH-203`
- `PHASE-3-PZ-POLICY-BURN` (personalization): `DSH-300` (prereq), `DSH-301`, `DSH-302`, `DSH-303`
- `PHASE-4-PACKAGE` (off-chain pkg): `DSH-401`..`DSH-406`
- `PHASE-5-SERVICES` (engine + BFF): `DSH-501`, `DSH-502`, `DSH-503`
- `PHASE-6-DEPLOY`: `DSH-601`, `DSH-602`, `DSH-603`

> **Parallelism:** PHASE-4-PACKAGE (`DSH-401`/`DSH-402` onward) depends only on the done contract
> tasks, so it proceeds **independently of the blocked pz baseline (`DSH-300`)**. The pz chain
> (`DSH-300`→`301`→…) and the package chain run in parallel; they only rejoin at deploy (PHASE-6).

## Tasks

### PHASE-0-DONE
- [x] `DSH-001` (decentralized-minting) Strip subhandle fees/free-virtual off the legacy path
- [x] `DSH-002` (decentralized-minting) Confirm orders are DeMi-only
- [x] `DSH-003` (decentralized-minting) DeMi subhandle minting on the orders path (owner fee + folded flat fees, virtual 000 / nft 100+222)
- [x] `DSH-004` (decentralized-minting) Owner-fee double-satisfaction tests

### PHASE-1-FREEVIRTUAL
- [x] `DSH-101` (decentralized-minting) `registry_value`: `(count,labels)` → `(free_names,labels)` encoding + helpers (add/remove/has-name, free-iff-`<N`); update `registry_value.test.ak`. deps: DSH-003 — **done f31fdd5**
- [x] `DSH-102` (decentralized-minting) Re-introduce per-order `free_virtual: Option<FreeVirtualData>` (root key MPT proof + current `free_names`) on the orders path; free while `|free_names| < free_virtual_count` (add name) else paid; change `MintNewHandles` proof element; ripple `LabelAssetProof` (`old_free_names`). deps: DSH-101 — **done b0c117e**
- [x] `DSH-103` (decentralized-minting) Free-virtual mint tests (value transition + prepend ordering; full-tx e2e → DSH-401). deps: DSH-102 — **done 4ad4e1e**

### PHASE-2-DEMI-BURN
- [x] `DSH-201` (decentralized-minting) Implement governor `can_burn_handles` (`demimnt`, currently stub `False`): authorize the `-1` mint (allowed-minter + coordinated with the minting-data spend). deps: DSH-003
- [x] `DSH-202` (decentralized-minting) Add `demimntmpt` `BurnNewHandles` redeemer: MPT delete (existence-before/absence-after) + expect `-1` mint value + remove a free virtual's name (reopen slot). deps: DSH-102, DSH-201
- [x] `DSH-203` (decentralized-minting) Burn-path contract tests (nft burn -1 of 100+222, virtual burn -1 of 000, MPT delete, free-name reopen). deps: DSH-202

### PHASE-3-PZ-POLICY-BURN
- [ ] `DSH-300` (handles-personalization) PREREQ: verify the pz contract builds green on `aiken v1.1.21` (the aiken.toml compiler; binary already on PATH). **Found 2026-06-06: baseline is RED — 1 pre-existing failing test** `dispatch_from_tx_update_branch_accepts_private_root_address_change` (Update path, unrelated to burn/policy). Resolve (fix or confirm known) before pz feature work. deps: none
- [ ] `DSH-301` (handles-personalization) Add a `$handle_policies` reader + membership check (decentralized policy registry; mirrors `load_policy_index_root`), then a new NFT/root **burn** redeemer (details unchanged). deps: DSH-300. NOTE: pz uses a newer aiken (cardano/ stdlib) — set up toolchain.
- [ ] `DSH-302` (handles-personalization) Personalization burn tests. deps: DSH-301
- [ ] `DSH-303` (handles-personalization) Make the rest of pz (`Personalize`/`Migrate`/`Revoke`/ownership) validate against `$handle_policies` instead of the hardcoded `f0ff48bb`, so DeMi handles get FULL pz support (parity), not just burn. deps: DSH-301

### PHASE-4-PACKAGE (`@koralabs/handles-decentralized-minting` / decentralized-minting `src/`)
- [x] `DSH-401` (pkg) **Proof/redeemer ABI to match the contract.** Add `OrderProof { mpt_proof, free_virtual: Option<FreeVirtualData> }` + `FreeVirtualData { root_proof, root_free_names, root_labels }` + `BurnProof` TS types + CBOR encoders; change `MintNewHandles` redeemer to `(List<OrderProof>, Int)` and add `BurnNewHandles(List<BurnProof>)`; change `LabelAssetProof` `old_free_virtual_count`→`old_free_names: ByteArray[]`. `contracts/types/*` + `contracts/data/*`. deps: DSH-102, DSH-202 — **done 119194f**: also dropped `LegacyHandleProof.free_virtual` + `LegacyHandle.privateVirtual` (legacy carries no free-virtual per DSH-001), removed dead `encodeRegistryValue`/`cborUint`; redeemer ABI CBOR pinned in tests; 66 vitest pass
- [x] `DSH-402` (pkg) **registry_value off-chain replication (CRITICAL).** `registry_value.ts` `encode(free_names, labels)` byte-identical to `registry_value.ak` (`[]`→labels; else `0xff ++ serialise_data(free_names) ++ labels`). Unit-test pinned to the contract's exact bytes — if these diverge, every free-virtual `mpt.update` fails on-chain. deps: DSH-101 — **done**: `src/store/registryValue.ts` + `tests/registryValue.test.ts` (10 tests); `serialise_data(List<ByteArray>)` CBOR confirmed against aiken v1.0.29
- [ ] `DSH-403` (pkg) **Mint build relocation.** Build DeMi subhandle orders on the orders/`MintNewHandles` path (not legacy `prepareLegacyMint`); construct free-virtual proofs (root proof taken AFTER the sub key insert + current `free_names`); trie maintenance — insert the sub key AND bump the root key's `free_names`. deps: DSH-401, DSH-402
- [ ] `DSH-404` (pkg) **Burn build.** `BurnNewHandles` redeemer + the coordinated burn tx: governor `BurnHandles` withdraw + `demimntmpt` `BurnNewHandles` + pz burn redeemer, in one tx; trie delete + `free_names` removal. deps: DSH-401, DSH-402, DSH-301
- [ ] `DSH-405` (pkg) **e2e tests with a real Trie** (the contract e2e deferred from DSH-103/203): free-virtual mint (free under allowance, paid over, public never free), free-virtual burn reopen, nft/virtual burn. deps: DSH-403, DSH-404
- [ ] `DSH-406` (pkg) **Blueprints + config.** Regenerate optimized/unoptimized blueprints (ABI changed → new `demimntmpt`/`demimnt` hashes); update the pinned-hash test + `deploy/preview` config (`minting_data_script_hash`, `mint_governor`). deps: DSH-401, DSH-202

### PHASE-5-SERVICES (`minting.handle.me` + `handle.me/bff`)
- [ ] `DSH-501` (engine) **Mint.** Move the additive fee outputs onto the orders path (owner→`payment_address`, flat minter→an allowed minter, flat treasury→`treasury_address`, folded into the batch minter/treasury outputs; token outputs BEFORE owner-fee outputs); write free-virtual names to tx metadata; trie via the package. Verify the engine reads the new `SettingsV1` fee fields + `free_virtual_count`. deps: DSH-403
- [ ] `DSH-502` (engine) **Burn.** Build the coordinated DeMi burn tx end-to-end via the package builders. deps: DSH-404, DSH-501
- [ ] `DSH-503` (bff) **pz `$handle_policies` ref input (easy-to-miss ripple).** Once pz requires `$handle_policies` (DSH-303), attach that admin-handle reference input to EVERY personalization tx the BFF builds — existing personalize/migrate flows included, or they break. Confirm `buy_down` fully removed + fee display matches the additive model. deps: DSH-303, DSH-401

### PHASE-6-DEPLOY (preview only; preprod/mainnet are follow-on — see Deferred)
- [ ] `DSH-601` (handles-personalization + api) **Deploy the new pz contract version** (pz deploy process); register the new `persprx` hash in the api script registry so DeMi handles resolve to it. deps: DSH-302, DSH-303
- [ ] `DSH-602` (decentralized-minting + adahandle-deployments) **Deploy DeMi.** Regenerate the Phase-1 bundle (new `demimntmpt`/`demimnt` hashes); publish the package; deploy the engine. **USER ACTION (reserved for the end): multisig signature in Eternl for the ref-script deploys + settings update; agent admin-signs the MPT migration.** deps: DSH-406, DSH-502, DSH-503, DSH-601
- [ ] `DSH-603` (preview) **Verify on-chain:** nft sub mint, virtual sub mint, owner-fee payout, 3 free virtuals, free-name reopen on burn, nft burn (222-check), virtual burn (`Revoke`), MPT delete. deps: DSH-602

## Deferred (out of scope for THIS run)
- **preprod propagation, then mainnet — mainnet requires EXPLICIT per-deploy user authorization** (never auto-propagate to mainnet).
- Voluntary holder-burn UX + the migrate-then-burn frontend flow.
- Migrating the 50k+ tokens at old pz contracts (migration is already built; runs as users interact — not a blocker).
