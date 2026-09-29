# Burning a root that holds registry labels (001–004)

Status: design approved 2026-09-29 (operator: option A, atomic teardown). Implements the intent of
`contract-protections.md` PLANNED #3 ("no orphaned label tokens") without making labeled roots unburnable.

## Problem

Since WS1 the MPT value at a root key is its registry label set: the concatenated, sorted 4-byte CIP-67
prefixes of the tracked labels it holds (`registry_value.encode`). `BurnLegacyHandles` / `BurnDeMiHandles`
delete a key with the value `#""`, so a root that holds any label (e.g. a root with SubHandles enabled holds
001) can never be burned: the delete proof cannot match. Separately, a label token cannot be burned today
because its holding contract has no burn path (`subh` requires the 001 to be re-output).

## Rule (applies to every label contract, present and future)

1. **Atomic teardown.** A root that holds labels is burned in ONE transaction that burns its 222 owner token,
   its 100 reference token, and every label token in its registry set. The MPT key is deleted with its exact
   stored value. No label token may outlive its root.
2. **Every contract that holds a tracked label token MUST have a burn path**: it allows the label token to be
   spent into a burn when, in the same transaction, the root's 222 (`label_policy, 222‖name`) is burned (-1)
   and the label token itself is burned (-1). The root owner's burn is already authorized by the handle policy
   (legacy native script / DeMi governor), so the label contract only needs to tie its token's fate to the
   root's. A label contract without this path must not be used to hold a tracked label.

## Label map

| Label | Prefix     | Purpose              | Holding contract                                   | Burn path |
|-------|------------|----------------------|----------------------------------------------------|-----------|
| 001   | `00001070` | SubHandle settings   | `subh` (handles-subhandle-settings)                | new `subh` version adds `BURN` |
| 002   | `000020e0` | Public datum         | `public_datum` (handles-public-datum)              | required before any 002 is minted |
| 003   | `00003090` | Handle identity / messaging anchor (chat.handle.me: identity key + signed pre-key). secrets.handle.me uses the same key via chat; its own "(003) guardian profile" was superseded 2026-06-20 (secrets `1ae1a6c`, `poc-state.md`: "do not build") | chat.handle.me anchor contract (not built) | required in its first version |
| 004   | `000041c0` | Reserved             | —                                                  | required in its first version |

## On-chain change (`demimntmpt`)

New redeemer, appended (existing indices unchanged): `BurnLabeledRoots(List<LabeledRootBurnProof>)`.

`LabeledRootBurnProof { mpt_proof, handle_name, labels }`, where `labels` is the root's current canonical label
set (the stored value). For each proof:
- the name must be a root (not `sub@root`) and valid;
- `mpt.delete(root, handle_name, registry_value.encode(labels), mpt_proof)`;
- expected mint gains `-1 (P, 222‖name)`, `-1 (P, 100‖name)` where `P` is the policy that actually burns the
  222 in this tx (legacy or DeMi), and `-1 (P_l, l‖name)` for every 4-byte label `l` in `labels`, where `P_l`
  is the policy actually burning it (`find_label_burn_policy`);
- `labels` must be non-empty (unlabeled roots keep using the existing redeemers, unchanged).

Then, exactly as the other paths: the minting-data output keeps its address and non-ADA value, carries the new
root, has no reference script; and `tx.mint == expected_mint_value` exactly (no other asset may be minted or
burned).

Existing redeemers and proof types are untouched, so every current off-chain builder keeps working.

## Off-chain gate (the portal and the co-sign step)

No handle burn can complete without one of our keys (legacy: policy key co-sign; DeMi: minter signature), so
the build and co-sign steps are the enforcement point for what the contract cannot see. Refuse to build or
co-sign a root burn when:
- the root has any live virtual SubHandle (API `/handles/<root>/subhandles`, virtual type); or
- its 001 settings datum has `nft.public_minting_enabled` or `virtual.public_minting_enabled` set.

A root with only private NFT SubHandle minting enabled and no outstanding virtuals may be burned.

## Rollout

1. `demimntmpt` with `BurnLabeledRoots` (all networks; rides the #50 settings/ref-script txs where not yet signed).
2. `subh` new version with `BURN`; add its hash to `sh_settings` `valid_contracts`. Existing 001s move to it via
   the current `subh` `MIGRATE` (admin-signed) as the first tx of a labeled-root burn.
3. BFF: the gate above; the labeled-root burn builder (migrate 001 if needed → burn); co-sign intent kind
   `cip68-labeled`.
4. `public_datum` gains its burn path before 002 is ever minted; the chosen 003 contract ships with one.
