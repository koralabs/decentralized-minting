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
a CIP-25 handle's key from the registry while burning its token in the same
transaction.

Note: a legacy-policy burn is **not** governor-gated. `demimnt`'s
`can_burn_handles` (the withdraw-0 governor) is only ever invoked for the
**DeMi**-policy `BurnDeMiHandles` path. A legacy burn is authorized entirely
by (a) the legacy policy's own native script (whichever key it requires to
authorize burning that asset) and (b) the ledger's ordinary value-balance rule
forcing the holder to spend the UTxO containing the asset being burned;
`demimntmpt`'s `BurnLegacyHandles` only keeps the MPT root in sync with
whatever the native-script-authorized burn already did — see "Authorization
model (Q3)" below.

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

Additionally, kind `2` explicitly rejects any `root@sub`-shaped name
(`is_sub_handle_name`, `lib/validations/minting_data/utils.ak`). CIP-25
predates SubHandles, so no bare `root@sub` asset was ever minted — a kind-2
proof naming one could never have a real MPT key or mint to match anyway, but
the contract rejects the shape outright rather than relying on that.

`update_legacy_mint_value`'s `when kind is { 0 -> …, 1 -> …, 2 -> …, _ -> fail }`
match is exhaustive: any kind outside `{0,1,2}` traps there even if a caller
managed to bypass the `expect kind == 0 || kind == 1 || kind == 2` domain
guard in `all_proofs_are_valid` (defense in depth — the mint-value builder is
not a de-facto "anything else is CIP-25" catch-all).

## Tests (`smart-contract/lib/tests/validations/minting_data/legacy_mint.test.ak`)

On master, `is_virtual: 2` (or `3`) traps in `parse_bool_from_int` before kind
2 exists at all — but for a `test ... fail { .. }`, a trap is exactly what
`fail` expects, so **aiken reports every `fail`-annotated test below as PASS
on master, not fail** (verified directly: ran this test file against master's
validation code). Only `cip25_burn_ok` (no `fail` annotation, the happy path)
genuinely fails on master. "It fails on master" is therefore not evidence any
test exercises the mechanism its name claims — that is established instead by
mutation testing against the committed fix, in an isolated `/tmp` scratch
copy (not committed): the specific line was deleted/changed, `aiken check`
was rerun, and the test flipped red. That mapping is recorded in the test
file's header comment.

`legacy_virtual_burn_still_uses_000_not_bare_name` is different in kind from
the rest: kind `1` already exists on master, so this test is a genuine
regression guard that already PASSES on master (correctly) — it is not a
"new capability" test at all, it exists to catch a future accidental
renumbering of kinds 0/1.

- `cip25_burn_ok` — happy path: root `{handle}` -> empty, mint is exactly
  `-1 handle_name` (no prefix). Red if the kind-2 mint-value branch is
  changed to emit 100+222 instead.
- `cip25_burn_wrong_asset_fails` / `cip25_burn_extra_asset_fails` /
  `cip25_burn_wrong_policy_fails` — the burned mint value must match the
  proof exactly (no substitution, no superset, right policy). All three go
  red if `expect mint == expected_mint_value` is disabled; `cip25_burn_ok`
  and `cip25_burn_key_absent_fails` are unaffected by that same mutation,
  confirming the mapping is specific and not coincidental.
- `cip25_burn_key_absent_fails` — deleting a key that was never inserted
  traps (`mpt.delete` needs a valid inclusion proof) — the same call site
  kinds 0/1 already share for their own burns.
- `cip25_burn_wrong_policy_fails` — the burn must be under the legacy policy
  id, not an arbitrary one.
- `cip25_burn_subhandle_shape_rejected_fails` — a `root@sub`-shaped kind-2
  name is rejected outright. Red if the `is_sub_handle_name` guard is deleted.
- `cip25_mint_rejected_fails` — kind `2` can never be minted (`amount == 1`
  is rejected). Red if `expect kind != 2 || amount == -1` is deleted.
- `legacy_kind3_mint_fails` / `legacy_kind3_burn_fails` — kind `3` (or any
  kind outside `{0,1,2}`) is rejected. Verified to STILL fail even with both
  domain-guard `expect`s in `all_proofs_are_valid` deleted, because
  `update_legacy_mint_value`'s match is exhaustive — proving the mint-value
  builder does not fall back to treating an unknown kind as CIP-25.
- `legacy_virtual_burn_still_uses_000_not_bare_name` — regression guard
  (passes on both master and this branch): kind `1` (virtual) still burns the
  `000` token, not the bare name, so the kind numbering did not silently swap.
- The full pre-existing suite (`legacy_root_mint_ok`, `legacy_root_burn_ok`,
  every DeMi/label-asset test, etc.) is unaffected — **196/196 pass** after
  this change (186 pre-existing + 10 new).

Run: `cd smart-contract && aiken check`.

## Blast radius / what must be redeployed

This changes `demimntmpt`'s compiled code, which changes `minting_data_script_hash`
(and, downstream, the `demimnt` governor's hash, since it is parameterized by
that hash). **The delta is not the same on every network** — preview/preprod
and mainnet are on different `demimntmpt` generations today, verified by
rebuilding master and this branch with each network's real build parameters
(`legacy_policy_id`, `admin_verification_key_hash`, and the WS7 slot anchor
from `src/contracts/config.ts` `getSlotAnchor`) using `aiken blueprint apply`
+ `aiken blueprint hash` directly — the same parameter-application path a
real deploy uses, and the same method that exactly reproduces preview's and
preprod's live deployed hashes from master's plutus.json (see "Exact commands"
below for the literal invocations and CBOR parameter encodings used):

| network | currently deployed `demimntmpt` | this branch (`b5939c6`), same params |
| --- | --- | --- |
| preview | `86e193d6a9e5efa615122913b5fee430d995f74e77f3722a39e6575c` | `92367457e3f279a83391d1d58d83ba552c6f9ca79de4aba031a7c6b9` |
| preprod | `9c3fcd4bbc1f2db49fa76d50304deedb85517cf14a439c09d96ed823` | `74b2c62ea8d42a78a4577d73d2f28c6d10b7a18efac36cd701c3af63` |
| mainnet | `dae8d5a2…` (pre-WS1/WS7; see `MAINNET_CUTOVER_PREP.md` §1) | `10db6dde1525e8263373be65f64df7f02fda91df6ad5ad8d0abd20e4` |

(`demimnt`, this branch (`b5939c6`), same params: preview
`ce46ee523fc31f5e669cdbede69dd98eacf58dd9f46471fbd1f1b19c`, preprod
`a9edd503ad711bec9d5dad251ded387c10ec659b7b4ed03ea39be104`, mainnet
`aa9d62d4bfd182fb4e220d634a984e711ec8c1f8b67341c4ce24a468`.)

**All six values above are for commit `b5939c6` only. Rebuild and confirm at
deploy time — any later contract change (including a future commit on this
branch) invalidates them.**

Separately, rebuilding **`master` @ HEAD (before this branch)** with the same
method reproduces preview's and preprod's exact live hashes
(`demimntmpt 86e193d6…` / `9c3fcd4bbc1f…`), which is the evidence for the
claim below that preview/preprod already run master.

### Exact commands used to produce the table above

```sh
cd smart-contract
aiken build   # regenerate plutus.json from this branch's source (commit b5939c6)

# CBOR-encode each parameter as Plutus Data (byte strings: CBOR major-type-2
# header + hex; unsigned ints: plain CBOR major-type-0). Values below are for
# legacy_policy_id / admin_verification_key_hash (network-independent) and
# each network's WS7 slot anchor from src/contracts/config.ts getSlotAnchor:
#   legacy_policy_id            = 581cf0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a
#   admin_verification_key_hash = 581c4da965a049dfd15ed1ee19fba6e2974a0b79fc416dd1796a1f97f5e1
#   preview: anchor_slot=0            -> 00
#            anchor_time_ms=1666656000000 -> 1b000001840c705800
#            slot_length_ms=1000       -> 1903e8
#   preprod: anchor_slot=86400        -> 1a00015180
#            anchor_time_ms=1655769600000 -> 1b00000181838f1000
#            slot_length_ms=1000       -> 1903e8
#   mainnet: anchor_slot=4492800      -> 1a00448e00
#            anchor_time_ms=1596059091000 -> 1b000001739c890038
#            slot_length_ms=1000       -> 1903e8

# apply demimntmpt's 5 parameters IN ORDER (plutus.json's declared parameter
# order: legacy_policy_id, admin_verification_key_hash, anchor_slot,
# anchor_time_ms, slot_length_ms), chaining -o into the next -i, one CBOR
# hex arg per invocation, e.g. for preview:
aiken blueprint apply -i plutus.json          -m demimntmpt -v demimntmpt -o /tmp/preview-1.json 581cf0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a
aiken blueprint apply -i /tmp/preview-1.json  -m demimntmpt -v demimntmpt -o /tmp/preview-2.json 581c4da965a049dfd15ed1ee19fba6e2974a0b79fc416dd1796a1f97f5e1
aiken blueprint apply -i /tmp/preview-2.json  -m demimntmpt -v demimntmpt -o /tmp/preview-3.json 00
aiken blueprint apply -i /tmp/preview-3.json  -m demimntmpt -v demimntmpt -o /tmp/preview-4.json 1b000001840c705800
aiken blueprint apply -i /tmp/preview-4.json  -m demimntmpt -v demimntmpt -o /tmp/preview-5.json 1903e8
aiken blueprint hash  -i /tmp/preview-5.json  -m demimntmpt -v demimntmpt
# -> 92367457e3f279a83391d1d58d83ba552c6f9ca79de4aba031a7c6b9

# repeat with preprod's / mainnet's anchor values for the other two rows.

# demimnt takes ONE parameter: minting_data_script_hash (the demimntmpt hash
# just computed above), CBOR-encoded the same way (28-byte hash -> 581c + hex):
aiken blueprint apply -i plutus.json -m demimnt -v demimnt -o /tmp/preview-demimnt.json 581c92367457e3f279a83391d1d58d83ba552c6f9ca79de4aba031a7c6b9
aiken blueprint hash  -i /tmp/preview-demimnt.json -m demimnt -v demimnt
# -> ce46ee523fc31f5e669cdbede69dd98eacf58dd9f46471fbd1f1b19c
# repeat with preprod's / mainnet's demimntmpt hash as the parameter.
```

Note the `-m`/`-v` values: `aiken blueprint apply`/`hash` match on
module=`demimntmpt`, validator=`demimntmpt` (not `spend`) — the blueprint's
double-namespaced title from aiken v1.1.22 is `demimntmpt.demimntmpt.spend`,
but `apply`/`hash` key off the module+validator pair, not the handler suffix.

The preview/preprod row confirms **this repo's `master` — WS1 label registry
(`MintLabelAssets`), WS7 sunset-window gate, `BurnDeMiHandles`, and the
free-virtual-removal cutover — is already what preview and preprod run
today.** This branch is based on `master`, so for those two networks this
PR's diff really is *only* the CIP-25 burn addition on top of what is already
live; it does not also ship WS1/WS7 to them.

Mainnet is different: mainnet has not taken any of that yet. **This PR's
compiled `demimntmpt` therefore does not fold cleanly into what's live on
mainnet** — deploying it there means deploying master's entire WS1/WS7/DeMi-burn
feature set (label registry, policy-window sunset gate, `BurnDeMiHandles`,
removed free-virtual allowance) *simultaneously* with the CIP-25 burn support,
governed by `MAINNET_CUTOVER_PREP.md`'s hard ordering, not by a narrower
CIP-25-only change. There is no way to ship "just the CIP-25 fix" to mainnet
without first (or atomically) doing the WS1/WS7 cutover that doc describes.

Also: **the mainnet target hashes already recorded in
`deploy/mainnet/decentralized-minting.yaml:27,38`
(`demimntmpt f2799138a412ce749f50fab3ae1537400cc3ce7099bbd850a6dec03c`,
`demimnt 83d1a3c701d88332edad6df0cc0cffcb7412be02774d38ff33e2302b`) and the
planner dry-run artifacts referenced in `MAINNET_CUTOVER_PREP.md` §6
(`/tmp/decentralized-minting-plan`, plan id `9db57d2e…`) are now STALE.** They
were computed for master *without* this branch's CIP-25 change. Any real
mainnet cutover that includes this PR needs a fresh build/hash/plan cycle —
do not reuse those recorded hashes or artifacts.

**On the mainnet root's contents:** the WS1 cutover prep also DECIDED
(2026-09-09, per `MAINNET_CUTOVER_PREP.md` §2A) to **fold historical `001`
labels into the migration root** at cutover, not to move the UTxO with a
byte-identical root. So — unlike a pure address-move — the mainnet MPT root's
*value* is expected to change as part of that same cutover tx, on top of
which any CIP-25 burns would also delete keys. Do not assume the mainnet root
is a passive address-move; it is a recompute, decided in favor of an accurate
root over an unchanged one.

Beyond the script-hash changes:

- The `handle_root@handle_settings` (minting-data) UTxO must move to whichever
  new `demimntmpt` address each network adopts (preview/preprod: address-move
  only, root value unchanged, since neither their compiled code nor root
  encoding is otherwise affected by this PR beyond the CIP-25 kind addition;
  mainnet: address-move **plus** the historical-001 root recompute described
  above, as part of the larger WS1/WS7 cutover, not a separate step).
- `demimnt`'s reward (stake) account changes on every network where its hash
  changes; a stake-registration cert must land before its first use (see
  `MAINNET_CUTOVER_PREP.md` §2B for the full observer list on mainnet).
- Off-chain builders that construct `LegacyHandleProof` (`is_virtual`) or the
  `BurnLegacyHandles` redeemer must be updated to emit kind `2` for CIP-25
  burns and keep emitting `0`/`1` unchanged elsewhere: the minting engine's
  proof-building helpers and `handle.me`'s
  `bff/lib/cardano/mintingDataBurn.ts` (`RevokedLegacyHandle.isVirtual: boolean`
  needs a third state, or a parallel `kind`/`isCip25` field).
- The committed merged blueprint mirrors (`src/contracts/optimized-blueprint.ts`
  / `unoptimized-blueprint.ts`, regenerated by `scripts/generateBlueprints.ts`
  from `smart-contract/plutus.json` + `smart-contract-mint-proxy/plutus.json`)
  are **not** regenerated by this PR — they still reflect the pre-CIP25
  compiled code (which is why the hash comparison above was done by hashing
  `smart-contract/plutus.json`'s validator entries directly, not through
  `buildContracts`). Regenerating them is part of the real rollout, not this
  contract-only PR.
- Reference-script UTxOs for `demimntmpt` (and `demimnt`) need redeploying on
  every network that adopts this change.

This repo does not deploy, does not touch settings/handlecontract datums,
and does not submit any tx as part of this change — see "Deploy plan" below
for the sequencing an operator would run afterward, split by network.

## Deploy plan (future work, operator-gated — NOT executed here)

### preview / preprod

Both already run master (WS1/WS7 already live — see the hash table above), so
this is a narrow, additive redeploy of just the CIP-25 change:

1. Rebuild `demimntmpt` (+ dependent `demimnt`) with each network's real
   params from this branch; the table above already gives the expected
   hashes for commit `b5939c6` (`92367457…`/`ce46ee52…` preview,
   `74b2c62e…`/`a9edd503…` preprod) — **rebuild and confirm at deploy time
   using the exact commands above; any later contract change invalidates
   these numbers.**
2. Update `deploy/<network>/decentralized-minting.yaml` target hashes; run
   `npm run deployment-plan:<network>` and review drift — expect
   `script_hash_only` (root datum content unchanged on these two networks).
3. Deploy the new `demimntmpt`/`demimnt` reference scripts (manual
   local-planner -> Eternl per `MANUAL-DEPLOY-RUNBOOK.md`).
4. Register `demimnt`'s new reward account before first withdrawal use.
5. Run the planner-generated `handle_root@handle_settings` address-migration
   tx (address-move only; root value unchanged on these two networks).
6. Update `SettingsV1.mint_governor` / `minting_data_script_hash` via the
   operator multisig.
7. Ship the off-chain builder changes (engine + `handle.me` BFF, see below)
   so a CIP-25 burn can actually be constructed.

### mainnet

Mainnet does **not** get this as a standalone change. It only lands as part
of the full WS1/WS7 cutover in `MAINNET_CUTOVER_PREP.md`, with this branch's
CIP-25 support folded into that cutover's contract build, and that doc's hard
ordering followed exactly:

1. Deploy the WS1-aware `api.handle.me` **first** (mainnet's api currently
   404s `GET /mpt-root/registry-labels`, which the planner's
   `computeMptRootHash` needs).
2. Ship the minting engine's mainnet branch (sessionStatus + vendored SDK)
   **before or atomic with** the BFF.
3. Rebuild `demimntmpt`/`demimnt`/`demiord` with mainnet params **from this
   branch, not from the stale recorded hashes** (`f2799138…`/`83d1a3c7…` are
   stale — see above); this branch's (commit `b5939c6`) mainnet-param hashes
   are `10db6dde1525e8263373be65f64df7f02fda91df6ad5ad8d0abd20e4`
   (`demimntmpt`) / `aa9d62d4bfd182fb4e220d634a984e711ec8c1f8b67341c4ce24a468`
   (`demimnt`) — **rebuild and confirm at deploy time using the exact
   commands above; any later contract change invalidates these numbers.**
4. Deploy those contracts + register `demimnt`'s new reward account
   **before** its first withdrawal use.
5. Run the MPT migration: address-move **and** the decided historical-001
   root recompute (§2A), not a bare address-move.
6. Update `SettingsV1` (mint_governor, minting_data_script_hash, order_script_hash)
   via the operator multisig.
7. Only then promote frontend/BFF (per `MAINNET_CUTOVER_PREP.md` ordering
   rule 3 — promoting the UI/BFF ahead of the contracts strands user funds in
   pre-WS1/WS7 flows).
8. Ship the off-chain builder changes (below).
9. Re-verify with scalus before/after, per the existing DeMi cutover runbook.

### Off-chain builder changes needed on every network before this is usable

- Update the minting engine's legacy-burn proof builder and `handle.me`'s
  `bff/lib/cardano/mintingDataBurn.ts` / `bff/handlers/buildBurnHandleTx` to:
  - detect a CIP-25 (bare-name, non-`00`-prefixed) legacy handle,
  - build a `LegacyHandleProof` with `is_virtual: 2` and a bare-name mint
    value (`-1 name`, no prefix) instead of the current always-100+222 shape,
  - keep requiring the wallet to hold+spend the bare CIP-25 asset (mirroring
    today's LBL_222 possession check) and the same
    `[ownerKeyHash, policy.policyKeyHash]` required-signer + bound-intent JWT
    co-sign pattern.
- `admin.handle.me`'s "Danger Zone" burn UI/selector needs to stop excluding
  CIP-25 handles from the burn flow (if it currently does) and route them
  through the updated `buildBurnHandleTx` path — same UX, new handle-shape
  branch.

### Operator-decision checklist

- [ ] Confirm preview/preprod are the intended first targets; mainnet is
      gated on the full WS1/WS7 cutover regardless of this PR (see above).
- [ ] **Before any CIP-25 burn, verify off-chain that no `222` or `000` asset
      of the SAME handle name exists under either policy (legacy or DeMi).**
      The MPT stores one key per handle name regardless of token shape,
      shared across kinds 0/1/2 and across the legacy/DeMi split — burning
      one form deletes the shared key and frees the name for a fresh mint
      while a `222`/`000` of the *same name* could still be circulating under
      the other policy/shape. That is a double-mint risk, not something
      `demimntmpt` can detect on-chain (it only ever sees the assets in the
      one tx it's asked to validate). This check belongs in the off-chain
      burn-tx builder (query the registry API / both policies' live supply
      for the handle name before building the proof), not in the contract.
- [ ] Confirm the live on-chain root already contains the target CIP-25
      handle(s) as keys (or reconcile via the WS1-era `computeMptRootHash` /
      `build-true-root.ts` tooling) before attempting any real burn.
- [ ] Approve the mainnet-side deploy (per this repo's higher-risk-mainnet
      merge rule — this touches minting/burning authorization data, and on
      mainnet specifically means approving the full WS1/WS7 cutover, not a
      narrow patch).
- [ ] Decide whether `admin.handle.me`'s Danger Zone should ship the CIP-25
      burn UI at the same time as the contract deploy, or gate it behind a
      follow-up release once the new `demimntmpt` is live everywhere it needs
      to be.
