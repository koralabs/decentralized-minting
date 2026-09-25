# Burning bare CIP-25 legacy handles through the MPT root

Status: **contract change on branch `feat/burn-legacy-cip25-handles`, NOT deployed, NOT merged.**

## Problem

A CIP-25 legacy handle is a pre-2023 `$handle` mint under the legacy policy
(`f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a`) whose asset name
is the **bare handle name** (e.g. `xar12345`), with no CIP-67 label prefix.
This differs from every other handle asset the contract already knows about:

- a virtual sub handle -> `000<name>` (`prefix_000`)
- a CIP-68-style root/nft handle (including handles re-minted under the legacy
  policy in the CIP-68 shape) -> `100<name>` (reference) + `222<name>` (owner)

`demimntmpt`'s `BurnLegacyHandles` redeemer (`can_burn_legacy_handles` ->
`process_legacy_handles(amount = -1)`) requires `mint == expected_mint_value`,
and `expected_mint_value` was only ever built from those two label-prefixed
shapes (`update_mint_value` in `lib/validations/minting_data/utils.ak`, driven
by `LegacyHandleProof.is_virtual` via `parse_bool_from_int`, which traps on any
value other than `0`/`1`). A tx that burns a bare-name CIP-25 asset (mint
`-1 name`, no prefix) can never equal that expected value, so it is rejected
by the validator that owns the MPT root. There was no on-chain path to delete
a CIP-25 handle's key from the registry while burning its token in the same,
governor-gated transaction.

This is a **confirmed** finding (verified against the current mainnet-deployed
`demimntmpt` hash, not just repo HEAD — see "Evidence" below), not just a
repo-HEAD bug: the same `process_legacy_handles`/`update_mint_value` shape
predates the WS1 label-registry work and is present in every historically
deployed `demimntmpt`.

## Evidence

- **Deployed vs. repo:** mainnet currently runs `demimntmpt dae8d5a2…`
  (pre-WS1/WS7; see `docs/MAINNET_CUTOVER_PREP.md` §1), not repo HEAD's
  `f2799138…` target. `BurnLegacyHandles`/`LegacyHandleProof` predate WS1
  (`git log -S"BurnLegacyHandles" -- smart-contract` bottoms out at
  `2a4e3fb move main logic to minting_data script with price logic`), so the
  same non-virtual-branch encoding (100+222) is present in the deployed
  mainnet contract too — this is not a HEAD-only regression.
- **CIP-25 names ARE MPT keys:** `api.handle.me/scripts/build-true-root.ts`
  classifies every legacy-policy asset name; anything without a `00`-prefixed
  CIP-67 label is `kind: 'legacy'` and is folded into the candidate root sets
  (`main_legacy`) using its bare name as the key — the exact same key shape
  `LegacyHandleProof.handle_name` already uses. A delete-proof against the
  live root is therefore possible in principle (subject to the live root
  actually including the handle, which that script's own "candidate roots"
  probe exists to verify per-network).
- **Authorization model (Q3):** the legacy policy is a native script; per the
  code comment on `can_burn_legacy_handles`, "the legacy policy native script
  authorizes the actual burn; this enforces the root update when minting_data
  is spent." The existing CIP-68 self-serve burn
  (`handle.me` `bff/handlers/buildBurnHandleTx`) shows the concrete pattern:
  the wallet must hold and spend the LBL_222 owner token (proven by scanning
  the caller's UTxOs), and the BFF composes the full tx and requires
  `[ownerKeyHash, policy.policyKeyHash]` as extra signers, then returns a
  short-lived JWT (`signBurnAuthorization`, 5 min) binding the co-sign to the
  exact tx hash + handle + assets + old/new root before the backend will add
  its own witness. The backend's `policyKeyHash` is what the legacy native
  script actually requires; the holder cannot burn without it, so the BFF's
  bound-intent co-sign **is** the authorization, not a rubber stamp.

## Design

Extend `LegacyHandleProof` (`lib/validations/minting_data/types.ak`) so its
existing `is_virtual: Int` field becomes a 3-way **kind** selector, at the same
field position (no redeemer-constructor reindexing, no new redeemer, no new
type):

| kind | meaning | mint/burn value |
| --- | --- | --- |
| `0` | non-virtual CIP-68-style root/nft handle under the legacy policy (unchanged) | `±1 (100‖name)` + `±1 (222‖name)` |
| `1` | virtual sub handle (unchanged) | `±1 (000‖name)` |
| `2` | **new** — bare CIP-25 legacy handle, no label prefix | `±1 name` |

`0` and `1` keep their exact original bool semantics (`parse_bool_from_int`
mapped `0 -> False -> non-virtual`, `1 -> True -> virtual`), so every existing
mint/burn tx, on-chain or off-chain, is byte-identical. Kind `2` is
**burn-only**: `all_proofs_are_valid` (shared by both `can_mint_legacy_handles`
and `can_burn_legacy_handles`) rejects `kind == 2` unless `amount == -1`, so
there is no path to mint a fresh bare-name asset under the legacy policy —
only pre-existing ones (already keys in the MPT) can ever be burned.

Holder authorization is at least as strong as the CIP-68 path for the same
reason CIP-68 needs no extra on-chain check here: Cardano's value-balance rule
already forces whoever burns a specific asset to consume a UTxO holding it as
an input (you cannot burn what you cannot also make the ledger equation
balance around), so the wallet holding the CIP-25 token must sign the spend of
its own UTxO. `demimntmpt` only needs to keep enforcing "the MPT key existed
and mint matches exactly," which it now does for kind `2` identically to kinds
`0`/`1`.

### Why not a new redeemer / new proof type

A new `BurnCip25Handles` redeemer was considered and rejected: it would
duplicate all of `process_legacy_handles`' root/mint bookkeeping for one extra
value shape, and would still need every off-chain path that already knows
about `BurnLegacyHandles` to learn a second code path. Widening the existing
`is_virtual` field's domain is the smaller, symmetric change and keeps a
single burn code path for all three legacy handle shapes.

### Validity checks

`check_legacy_handle_validity` is reused unchanged for kind `2` (as a
non-virtual handle, same as kind `0`): same charset/length checks the
contract already applies to every other legacy root handle. Real handle names
conform to that charset, so this does not reject genuine CIP-25 assets.

## Tests (`smart-contract/lib/tests/validations/minting_data/legacy_mint.test.ak`)

All new tests fail without this change: `is_virtual: 2` traps in
`parse_bool_from_int` ("Invalid bool value") before the fix exists, so every
one of the tests below is a valid negative control.

- `cip25_burn_ok` — happy path: root `{handle}` -> empty, mint is exactly
  `-1 handle_name` (no prefix).
- `cip25_burn_wrong_asset_fails` / `cip25_burn_extra_asset_fails` — the burned
  mint value must match the proof exactly (no substitution, no superset).
- `cip25_burn_key_absent_fails` — deleting a key that was never inserted
  traps (`mpt.delete` needs a valid inclusion proof).
- `cip25_burn_wrong_policy_fails` — the burn must be under the legacy policy
  id, not an arbitrary one.
- `cip25_mint_rejected_fails` — kind `2` can never be minted (`amount == 1`
  is rejected), proving the deliberate mint/burn asymmetry.
- `legacy_virtual_burn_still_uses_000_not_bare_name` — regression guard: kind
  `1` (virtual) still burns the `000` token, not the bare name, so the kind
  numbering did not silently swap.
- The full pre-existing suite (`legacy_root_mint_ok`, `legacy_root_burn_ok`,
  every DeMi/label-asset test, etc.) is unaffected — 193/193 pass after this
  change (186 pre-existing + 7 new).

Run: `cd smart-contract && aiken check`.

## Blast radius / what must be redeployed

This changes `demimntmpt`'s compiled code (new unoptimized-blueprint hash),
which changes:

- `minting_data_script_hash` in every `SettingsV1`/`decentralized-minting.yaml`
  desired state (preview/preprod/mainnet) — a real redeploy + settings update,
  following the existing `docs/spec/contract-deployment-pipeline.md` process
  (build with network params -> update yaml -> `deployment-plan:<network>` ->
  deploy ref scripts -> settings tx). Same shape as every prior demimntmpt
  upgrade in this repo's git history (e.g. WS1 label-registry, WS7 policy
  window).
- The `handle_root@handle_settings` (minting-data) UTxO must migrate from the
  old `demimntmpt` address to the new one (address-move tx; the planner
  already detects and emits this — see `MAINNET_CUTOVER_PREP.md` §2A). The
  root datum (`mpt_root_hash`) itself does not need to change value, only
  location.
- `demimnt` (the governor) is parameterized by `minting_data_script_hash`, so
  its hash also changes and its withdraw-0 reward account needs a fresh stake
  registration before first use (see `MAINNET_CUTOVER_PREP.md` §2B) — the same
  requirement every past demimntmpt upgrade has carried.
- Off-chain builders that construct `LegacyHandleProof` (`is_virtual`) or the
  `BurnLegacyHandles` redeemer must be updated to emit kind `2` for CIP-25
  burns and keep emitting `0`/`1` unchanged elsewhere: the minting engine's
  proof-building helpers and `handle.me`'s
  `bff/lib/cardano/mintingDataBurn.ts` (`RevokedLegacyHandle.isVirtual: boolean`
  needs a third state, or a parallel `kind`/`isCip25` field).
- Reference-script UTxOs for `demimntmpt` (and `demimnt`) need redeploying on
  every network that adopts this change.

This repo does not deploy, does not touch settings/handlecontract datums,
and does not submit any tx as part of this change — see "Deploy plan" below
for the sequencing an operator would run afterward.

## Deploy plan (future work, operator-gated — NOT executed here)

1. Build `demimntmpt` (+ dependent `demimnt`) with each network's params;
   record new unoptimized + optimized CBOR under `deploy/<network>/`.
2. Update `deploy/<network>/decentralized-minting.yaml` build parameters /
   target hashes; run `npm run deployment-plan:<network>` and review drift —
   expect a `script_hash_only` classification (root datum content unchanged).
3. Deploy the new `demimntmpt`/`demimnt` reference scripts (manual
   local-planner -> Eternl per `MANUAL-DEPLOY-RUNBOOK.md`, mirroring how prior
   WS1/WS7 upgrades were staged).
4. Register `demimnt`'s new reward (stake) account before first withdrawal use.
5. Run the planner-generated `handle_root@handle_settings` address-migration
   tx (moves the minting-data UTxO to the new `demimntmpt` address; root value
   unchanged).
6. Update `SettingsV1.mint_governor` / `minting_data_script_hash` via the
   operator multisig (handlecontract signers).
7. Update the minting engine's legacy-burn proof builder and
   `handle.me`'s `bff/lib/cardano/mintingDataBurn.ts` /
   `bff/handlers/buildBurnHandleTx` to:
   - detect a CIP-25 (bare-name, non-`00`-prefixed) legacy handle,
   - build a `LegacyHandleProof` with `is_virtual: 2` and a bare-name mint
     value (`-1 name`, no prefix) instead of the current always-100+222 shape,
   - keep requiring the wallet to hold+spend the bare CIP-25 asset (mirroring
     today's LBL_222 possession check) and the same
     `[ownerKeyHash, policy.policyKeyHash]` required-signer + bound-intent JWT
     co-sign pattern.
   - `admin.handle.me`'s "Danger Zone" burn UI/selector needs to stop
     excluding CIP-25 handles from the burn flow (if it currently does) and
     route them through the updated `buildBurnHandleTx` path — same UX,
     new handle-shape branch.
8. Re-verify with scalus before/after, per the existing DeMi cutover runbook.

### Operator-decision checklist

- [ ] Confirm which network(s) should get this first (preview/preprod before
      mainnet, per repo convention).
- [ ] Confirm the live on-chain root already contains the target CIP-25
      handle(s) as keys (or reconcile via the WS1-era `computeMptRootHash` /
      `build-true-root.ts` tooling) before attempting any real burn.
- [ ] Approve the mainnet-side deploy (per this repo's higher-risk-mainnet
      merge rule — this touches minting/burning authorization data).
- [ ] Decide whether `admin.handle.me`'s Danger Zone should ship the CIP-25
      burn UI at the same time as the contract deploy, or gate it behind a
      follow-up release once the new `demimntmpt` is live everywhere it needs
      to be.
