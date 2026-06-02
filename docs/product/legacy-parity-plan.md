# Decentralized Minting — Legacy Parity Plan

Status: **IN PROGRESS** · Last updated: 2026-06-02

> **Progress (2026-06-02).** Verified green end-to-end: **aiken 109 checks / 0 warnings · DeMi
> tsc clean · DeMi 46 vitest · kora-labs-common tsc + 9 utils tests · BFF nfts 5 tests.**
> **Policy-stable** throughout (`demimntprx` hash `02333b54…` unchanged == deployed blueprint;
> only the runtime-swappable `demimntmpt` / `demiord` validators moved).
>
> - **On-chain modules:** `label_set.ak` (WS1 value), `registry_value.ak` (WS5 free-virtual
>   counter, backward-compatible with WS1), `handle_policies.ak` (WS7 window-check core),
>   `discounts.ak` (WS5 eligibility); `validations/orders/validation.ak` (WS8 extracted + tested).
> - **On-chain wiring:** `MintLabelAssets`(4) + `BurnLegacyHandles`(3) redeemers, `Refund`,
>   `max_handle_length` 28. Redeemer variants appended after `UpdateMPT` to preserve ABI indices.
> - **Off-chain engine:** redeemer-builder ABI fix (UpdateMPT back to 2; Burn=3, MintLabelAssets=4),
>   `LabelAssetProof` type + builders, `store/labelSet.ts` (byte-identical to `label_set.ak`),
>   `prepareLegacyBurn.ts` + `prepareLabelAssets.ts` flows. ABI-index + encoding round-trip tested.
> - **WS4 cross-repo:** regex/length fixed in kora-labs-common, BFF (incl. the literal-`|` bug),
>   minting.handle.me. (kora-labs-common needs a republish for consumers.)
> - **WS3:** confirmed the BFF pz flow is already policy-agnostic (keyed off the api handle
>   record + latest persprx, no legacy-policy gate) — DeMi handles personalize identically.
>
> **Remaining (each needs a real artifact / decision, not just code):** validator-wiring of WS5
> (OG/partner allowlist on-chain home — admin-datum pattern, **open D6 sub-item**) and WS7 (the
> `$handle_policies` datum encoding + slot↔time conversion — **no on-chain writer/example in-repo**);
> orders.ak discounted-lovelace plumbing; MPT-redeemer full-tx tests (need `mpt.Proof` fixtures —
> validated via the off-chain round-trip + scalus); the coordinated validator **redeploy**
> (preview→preprod→mainnet, mainnet needs explicit auth) + kora-labs-common republish.

This document tracks the work required to bring **decentralized minting (DeMi)** to
feature parity with the **legacy** minting system (`minting.handle.me`) and to close
known correctness gaps. It is a planning/tracker doc — the *what* and *why* with
enough *where* (file:line) to scope each item. Implementation detail belongs in
`../spec/spec.md` and `../spec/data-model.md` once a workstream is locked.

Sibling repos referenced throughout:

- `decentralized-minting` — DeMi Aiken contracts + TS engine (this repo)
- `minting.handle.me` — legacy engine + the parity reference
- `kora-labs-common` — canonical handle types, regex, label enum
- `handle.me/bff` + `handle.me/static` — frontend + BFF validation
- `api.handle.me` — scanner / resolver, owner of `$handle_policies` datum
- `cip-68-444-minting`, `handles-personalization` — partner/pz contracts

> **Verify before you implement.** Every file:line below was captured during a
> read-only survey. Re-confirm the cited line still says what this doc claims
> before changing it — the engine and contracts move quickly.

---

## Status matrix

| # | Workstream | Legacy | DeMi today | Gap | Risk / surface |
| --- | --- | --- | --- | --- | --- |
| 1 | Asset-label registry in MPT | n/a (legacy is DB-of-record) | MPT value = empty `#""` (presence only) | Value should be the per-handle list of minted labels | Contract + engine, load-bearing MPT change |
| 2 | Virtual burn → MPT delete | Burns 000 asset, deletes DB session, **never touches MPT** | `can_burn_handles` hard-`False`; `update_root` *supports* delete but unused | MPT root drifts on every legacy virtual burn | Contract + cross-repo burn flow |
| 3 | Personalization parity | 100 ref → persprx (V3) + initial CIP-68 datum at mint | 100 ref → **same persprx (V3)**, no initial datum | **App-side only** — apps don't drive pz for DeMi handles (contract is already correct) | Frontend + BFF |
| 4 | SubHandle fee-target enforcement | Owner sets subhandle prices; Kora fee enforced | Owner-set `tier_pricing` works; treasury fee enforced on new-root path only, **not legacy/subhandle path** | Kora fee not guaranteed on every subhandle mint | Contract (validation branch) |
| 5 | Minting discounts | NFT-project, OG, rarity, buy-down, 3 free virtual/root | **None** (buy-down already blocked, intentionally) | Rarity+OG, partner-NFT, free-virtual missing in DeMi | Engine + order datum + contract |
| 6 | 28-char handles | Capped 15 (mostly) | On-chain cap **15** (`max_handle_length`) | Root cap + regex inconsistency across 4 repos | Contract redeploy + multi-repo |
| 7 | Sunset enforcement via `$handle_policies` | api reads datum; map of policyId → [first,last,sunset] | **No sunset/window gating on mint at all**; single `legacy_policy_id` baked in | DeMi must respect legacy + own sunset (cutover) | Contract + ref-input read + redeploy |
| 8 | Admin refund of invalid orders | n/a | `demiord` Cancel requires **owner** multisig only; stuck orders unrefundable | Admin/operator can't refund unfulfillable orders | Contract (`demiord.ak`) + redeploy |

Legend for the per-workstream checklists below: `[ ]` not started · `[~]` in progress · `[x]` done.

---

## Governing invariant: the proxy policy ID must not change

**All eight workstreams preserve the `demimntprx` policy ID.** The proxy is deliberately
minimal (`validators/demimntprx.ak`): it only checks `version == mint_version` and that the
`mint_governor` withdrawal script executed. The `mint_governor`, `minting_data_script_hash`,
and `order_script_hash` are all resolved **at runtime from the settings datum** — so mint
rules, MPT logic, order logic, and length caps are swapped by deploying new governor / spend
scripts and re-pointing the settings datum, with **no policy-ID impact**. `SettingsV1` lives
inside `Settings.data` as opaque `Data`, so it can be extended freely.

The policy ID changes ONLY if you touch one of these — **do not, in any workstream:**

- change the `version` parameter of `demimntprx`;
- change `lib/decentralized_minting/settings.ak` (the `Settings` type or `find_settings`);
- change `is_withdrawal_script_executed` / anything else compiled **into** `demimntprx`.

Deploy choreography (policy-stable): a code change to `demimntmpt` yields a new
`minting_data` hash → re-parameterize `demimnt` (governor) with it → new governor hash →
update `Settings.mint_governor` (+ `minting_data_script_hash` / `order_script_hash` in
`SettingsV1`). The proxy and its policy ID never move through any of this.

---

## 1. Asset-label registry in MPT

**Goal:** make the MPT a *per-Handle asset-label registry* — for each handle, record
which CIP-67 labels have been minted, not merely that the handle name exists. It answers
"have we minted this handle+label combo before?" without forcing all labels to participate.

### Decided design (2026-05-31)

- **Key stays the handle name** (as today). **Value becomes the list of asset labels**
  minted for that handle (was constant `#""`).
- **Single contract invariant — the only thing enforced:** *adding a label to the value
  ⟹ that label asset is in the tx mint; removing a label from the value ⟹ that label
  asset is in the tx burn.* The contract does **not** hardcode or enforce a label
  vocabulary.
- **Participation is opt-in.** Only the labels we choose to track go in the list.
  Labels handled elsewhere stay out — e.g. `000` virtual sub-handles already behave as
  handles in their own right and are validated separately, so they need not appear here.
- Designed for future features: it's fine that some tracked labels (002, etc.) aren't in
  use today; D1 is therefore **not a blocker** — we add labels to the tracked set as
  features land, with no contract change.
- This list-valued root shares the `update_root` code path with the WS2 burn delete, so
  **WS1 and WS2 are one design.**

### DeMi as the 001/002/003 minter (decided 2026-05-31)

DeMi does **not** mint 001/002/003 today — it only *reads* the 001 settings asset as a
reference input (`sub_handle.ak:44`); 001 is minted by the legacy service
(`minting.handle.me/.../subHandleSettings.ts:40`). Decision: **DeMi becomes the minter.**

- **New `demimntmpt` redeemer** `MintLabelAssets(list of { handle_name, label, amount, proof })`.
  For each entry: prove the root handle key exists with its current value, `mpt.update` it to
  add (amount `+1`) or remove (`−1`) the label, and require the tx `mint` to carry exactly
  `+1`/`−1` of `(policy, label_prefix ‖ handle_name)`. **add-to-value ⟺ mint, remove ⟺ burn.**
- **Generic:** the contract records label *existence* only; it never interprets 001/002/003
  or validates the label asset's datum (minter-set, like the 100 ref token). No hardcoded
  vocabulary; future labels need no contract change.
- **Policy:** label asset uses the **same policy as its root handle** (new-DeMi vs legacy),
  mirroring the existing `new_policy_id`/`legacy_policy_id` split.
- **Authorization (decided):** **allowed_minter signs + on-chain owner proof** — the tx must
  reference the root's `222` owner token so even a misbehaving engine can't create label
  assets for a handle the owner doesn't hold.
- **Value encoding:** empty = `#""` (no migration of existing handles); non-empty = a
  canonical encoded label set. **Batching:** redeemer takes a list, like existing mint paths.

### Migration prerequisite: dedup existing 001s (2026-05-31)

The registry asserts **one 001 per handle**, but duplicate 001s already exist on chain (the
same `00001070‖root` minted multiple times) — this is the motivation for the feature. Before
committing a registry-bearing mpt-root, the chain must be reconciled to one-per-handle:

1. **Inventory** on-chain 001s and flag duplicates. Source: enumerate root handles with
   settings from api.handle.me (`/handles/:handle/subhandle-settings/utxo`,
   `subhandle_settings` on `StoredHandle`), build each `legacy_policy ‖ 00001070 ‖ roothex`
   asset id, query Blockfrost for `quantity` / `mint_or_burn_count` / holding addresses, flag
   `quantity > 1`. (002/003 not yet on chain.)
2. **Dedup-burn** the extra copies (negative mint under the legacy policy) — **policy-key +
   mainnet-money: sanctioned signing path + explicit per-tx authorization, never freelanced.**
   This is burns, not the company-killer *mint* rule, but same care.
3. **Then** commit the mpt-root that encodes the deduped 001s.

### Current state

- MPT key = **handle name only** (UTF-8/hex), value = constant empty `#""`. It is a
  pure presence set.
  - Off-chain insert: `src/txs/prepareNewMint.ts` → `db.insert(utf8Name, "")` then `db.prove(...)`.
  - On-chain: `smart-contract/lib/validations/minting_data/utils.ak:276` `update_root` →
    `mpt.insert(root, handle_name, #"", proof)` (mint) / `mpt.delete(...)` (burn).
  - Root datum: `MintingData { mpt_root_hash }` at the `demimntmpt` UTxO,
    asset `000de140` + `handle_root@handle_settings`
    (`smart-contract/lib/decentralized_minting/minting_data.ak`).
- Minted assets that are **not** reflected in the MPT today: the 100 ref, 222 owner,
  000 virtual, and any 001/002 settings assets all mint as plain `Value` entries
  (`src/txs/mintNew.ts`, `utils.ak:293` `update_mint_value`). The trie does not
  distinguish them.

### Label reality (decision input)

Canonical enum — `kora-labs-common/src/types/index.ts:19`:

| Label | Hex prefix | Meaning | Status |
| --- | --- | --- | --- |
| 000 | `00000000` | Virtual sub-handle | In use |
| 001 | `00001070` | Root-handle settings (subhandle owner settings) | In use (UTxO, **not** MPT) |
| 002 | `000020e0` | **Defined in enum, zero usages anywhere** | Undefined purpose |
| 100 | `000643b0` | Reference token (datum/personalization) | In use |
| 222 | `000de140` | Owner NFT | In use |
| 444 | `001bc280` | Rich-fungible (partner bg) | In use (444 repo) |

> **`LBL_003` does not exist** in the enum or anywhere in the codebase. "001/002/003"
> in the original ask is shorthand for "the settings-style sub-asset labels." Closing
> this workstream **requires a product definition of what 002 and 003 represent** before
> any registry can index them — see Open Decisions D1.

### Tasks

- [x] **Define the value encoding for the label list.** `lib/decentralized_minting/label_set.ak`
      — value = canonical (sorted) concatenation of fixed 4-byte CIP-67 label prefixes; empty
      set = `#""` (existing keys need no migration). `contains/insert/remove/apply` with the
      add-only-if-absent / remove-only-if-present legality baked in. 18 unit tests pass.
- [x] **On-chain mint/burn↔list-delta invariant (the `MintLabelAssets` path).** Rather than
      overloading the legacy `update_root` (which still creates the key with empty `#""` on the
      root 100/222 mint), label assets get a dedicated redeemer + path:
      - `MintingDataRedeemer::MintLabelAssets(List<LabelAssetProof>, minter_index)` in
        `validators/demimntmpt.ak` → `can_mint_label_assets` (`validation.ak`).
      - `all_label_proofs_are_valid` + `find_owner_policy` (`utils.ak`): per proof, `mpt.update`
        the key's set via `label_set.apply(old_value, label, ±1)` and require the tx `mint` to
        carry exactly `±1` of `(policy, label ‖ handle_name)` — **add ⟺ mint, remove ⟺ burn.**
      - **Auth (decided design):** an `allowed_minter` signs (settings, by `minter_index`) **and**
        the tx references the root's `222` owner NFT (`find_owner_policy`), which also fixes the
        label asset's policy (legacy vs new) — generic, no hardcoded label vocabulary.
      - Builds green (61 checks, 0 errors). **Policy-stable:** `demimntprx` hash unchanged
        (`02333b54…`, == deployed blueprint); only `demimntmpt` moved (`41ed72bb…`) → standard
        governor re-parameterize + `Settings.mint_governor` update, no policy-ID impact.
- [ ] Extend the off-chain store + proof builder (`src/store/index.ts`, `src/txs/prepareNewMint.ts`,
      `src/txs/prepareLegacyMint.ts`) to carry/prove list values + build `LabelAssetProof`s
      (old_value + single `mpt.update` proof; attach the 222 owner ref input).
- [ ] Decide the initial tracked-label set (001 is the first opt-in; 000 stays out).
- [ ] Backfill/migration: existing on-chain handles must get their current label lists
      reflected in the root without a mass re-mint (ties to the manual `syncMintingDataRoot`
      operator path; see WS2). **Prereq done:** mainnet 001 dedup complete (one 001 per handle).
- [ ] Tests: aiken validation-level test (full tx: 222 ref + mint coupling) on top of the
      `label_set` unit tests; engine round-trip proof tests for list values.

---

## 2. Virtual burn → MPT delete (root-drift fix)

**This is a correctness bug, not just parity.** Every legacy virtual-subhandle burn
silently drifts the DeMi MPT root.

### The drift

- Legacy burn flow burns the 000 asset on chain and **only deletes the DB session** —
  it never spends the `minting_data` UTxO, so the MPT root is never updated:
  - `minting.handle.me/src/express/handlers/burnHandles.ts` (request → `BURN_PENDING`)
  - `.../jobs/burnConfirm.ts` (waits 20 blocks → `burnSubHandle`)
  - `.../models/dynamo/lib/burnHandle.ts` → `removeActiveSessionsByTxId` (DB only).
- DeMi *can* delete from the trie but never does:
  - `smart-contract/lib/validations/minting_data/utils.ak:276` `update_root` handles
    `amount == -1` via `mpt.delete`.
  - But `smart-contract/lib/validations/mint_v1/validation.ak:29` `can_burn_handles`
    is hard-coded `False` ("Burn is disabled now"); `LegacyHandleProof` handling assumes
    mint-only (`utils.ak:137` comment).
- No automatic reconciliation exists, and auto-sync is explicitly **forbidden**
  (`minting.handle.me/AGENTS.md`: `syncMintingDataRoot` is manual-operator-only;
  on mismatch → NOTIFY and stop). So today the only "fix" is a manual root push, which
  trusts api.handle.me as ground truth.

### Decided architecture (2026-05-31)

**Per-burn MPT-delete tx.** Every legacy virtual burn is routed through a tx that spends
`minting_data` and applies an `mpt.delete` proof, keeping the root always-correct. This is
a legitimate state-change tx (the asset is genuinely burned in the same tx) — it is **not**
the forbidden bare root-push helper, which trusts api.handle.me as ground truth without a
real burn.

### Tasks

- [x] **Enable the legacy-burn MPT-delete path** (the operative fix for the drift). The drift
      is from **legacy**-policy virtual burns (000 under the legacy native script) — these
      never traverse `demimnt`/`can_burn_handles`; they only need `minting_data` spent to
      authorize the root delete. Added `MintingDataRedeemer::BurnLegacyHandles(List<LegacyHandleProof>)`
      → `can_burn_legacy_handles` → shared `process_legacy_handles(.., amount = -1)`
      (`validation.ak`), which `mpt.delete`s each handle and requires the tx to burn exactly the
      matching assets (`all_proofs_are_valid` generalized to take `amount`). Builds green;
      policy-stable (same `demimntmpt` redeploy as WS1).
      - Note: `mint_v1/validation.ak:29` `can_burn_handles` (hard-`False`) is a *separate*
        gate for **new-DeMi-policy** asset burns via the `demimnt` governor — out of scope for
        the legacy-virtual-burn drift; revisit if/when new-policy handle burns are needed.
- [ ] Build the off-chain burn-proof path (mirror of `prepareLegacyMint.ts` with
      `db.delete` + `prove`).
- [ ] Wire `minting.handle.me`'s `burnConfirm` job to produce/submit the MPT-delete tx
      instead of a DB-only delete — coordinating with the "no auto-sync" rule (the delete
      tx *is* the legitimate state change, unlike the bare root-push helper).
- [ ] Regression test reproducing the drift: mint virtual → burn → assert MPT root equals
      a freshly-recomputed trie without that handle.

---

## 3. Personalization parity — app-side, not contract

### Finding (2026-05-31): the contract is already correct

DeMi and legacy send the 100 reference asset to the **same** personalization contract —
the V3 `persprx1` proxy:

- DeMi `pz_script_address` (preview) `addr_test1wp70zp2c…9ad65m` is byte-identical to
  `handles-personalization/contract/aiken.persprx.addr_testnet`.
- Legacy resolves the target via `requireLatestScriptAddress(scripts, 'persprx', 'pers')`
  = latest persprx (V3) — `minting.handle.me/src/helpers/fetchHandlesApi.ts:189-193`.
- The DeMi engine path explicitly trusts `settings_v1.pz_script_address` so the ref token
  lands at the same place — `minting.handle.me/src/helpers/demi/processMintingTransaction.ts:196-205`
  — and `demimntmpt` enforces `ref_output_address == settings_v1.pz_script_address`.

So once a DeMi handle's 100 ref asset exists, it personalizes through the **identical** V3
flow. The only mint-time difference is that legacy attaches an initial CIP-68 datum to the
ref asset while DeMi attaches none (`src/txs/mintNew.ts:118-125`) — a *default-appearance*
detail, not a wiring gap, and explicitly **not** something parity requires us to change in
the contract.

### Gap (app-side)

The frontend/BFF don't yet recognize DeMi-minted handles as personalizable / surface the
pz flow for them. There is no DeMi contract or settings change required here.

### Tasks

- [ ] Confirm the frontend pz flow (handle.me/static + BFF) treats a DeMi-minted handle
      identically to a legacy handle once its 100 ref asset is at persprx.
- [ ] If desired, seed a sensible default CIP-68 datum at DeMi mint time so freshly minted
      DeMi handles have a default appearance before the owner personalizes (optional polish,
      not parity).
- [ ] Tests: personalize a DeMi-minted handle end-to-end through the existing pz path.

---

## 4. SubHandle fee-target enforcement

**Scope clarification (2026-05-31):** this workstream is about **NFT and virtual SubHandle
pricing/fees**, not root-handle pricing. Root-handle dynamic pricing is already handled via
`HandlePriceInfo` (operator-refreshed tiers). The requirement here: a root-handle owner may
sell their SubHandles at *whatever prices they choose*, **as long as the mint covers Kora's
fee**.

### State

- SubHandle pricing already matches the intent: `get_sub_handle_price` reads the owner's
  `tier_pricing: List<(Int,Int)>` from `OwnerSettings` (NFT vs virtual settings selected by
  `is_virtual`) — `smart-contract/lib/decentralized_minting/sub_handle.ak:7-81`. Owners set
  their own prices. ✅
- **The gap is fee-target enforcement:** treasury fee is enforced in `can_mint_new_handles`
  (`smart-contract/lib/validations/minting_data/validation.ak:132-147` — checks a
  `treasury_output` ≥ `treasury_fee` to `treasury_address`), but `can_mint_legacy_handles`
  (`validation.ak:173+`) performs **no treasury/fee validation**. Depending on which branch
  SubHandle mints flow through, the Kora fee may not be guaranteed.

### Tasks

- [ ] Confirm which validation branch SubHandle mints (NFT + virtual) actually traverse,
      and whether the Kora fee target is enforced there today.
- [ ] Enforce a minimum Kora fee (treasury cut) on **every** SubHandle mint regardless of
      branch — owner price floats above it, Kora's cut is mandatory.
- [ ] Tests: subhandle mint with owner price below the Kora fee floor fails; above it
      succeeds with the correct treasury output; NFT and virtual both covered.

---

## 5. Feature parity — Minting discounts

**Largest pure-parity gap. DeMi has no discount mechanism at all.**

### Legacy mechanisms (all applied at order/request time)

- NFT-project, OG, and rarity (UltraRare/Rare) discounts —
  `minting.handle.me/src/helpers/nft.ts:94-143`, types in `models/Settings.ts:3-15`.
- **3 free virtual subhandle mints** per root owner — `nft.ts:189-206` zeroes
  `minter_fee`/`treasury_fee` after counting existing virtuals (DB + api), `freeVirtualMint`
  flag on the session.
- Subhandle **buy-down** (flat or percent, best-of) — `nft.ts:175-181`.

### In scope for DeMi (decided 2026-05-31)

- ✅ **Rarity + OG** and **Partner-NFT-project** discounts.
- ✅ **Free virtual mints** — *correction:* this is **NOT** already covered in DeMi. The
  3-free logic exists only in the legacy engine (`nft.ts:189-206`); DeMi's `sub_handle.ak`
  always charges `tier_pricing` with no free-mint counter or zero-price path. It must be
  built for DeMi.
- ❌ **Buy-down — out of scope, already correctly disabled.** The BFF hard-blocks buy-down
  (`handle.me/bff/handlers/updateSubSettings/index.ts:38-46` → 400 "not allowed at this
  time", asserted by a test), and the DeMi contract never validates the `buy_down_*` fields
  in `OwnerSettings` (`sub_handle.ak:17-28`) — they remain dormant placeholders. Leave them
  reserved for a possible future re-enable; do not wire them up.

### DeMi today

No `discount`/`promo`/`allowlist`/`free` mechanism: order lovelace must equal the full
computed price (`src/txs/order.ts:46-109`, `orders.ak:11`). README lists "Handle Price
Discounts (Not implemented yet)".

### Eligibility proof — D6 (decided 2026-05-31)

Rarity / OG / Partner-NFT eligibility is proven by **referencing the qualifying asset as a
reference input** and checking that its address shares the **payment credential OR stake
credential** with the minter's owner/destination — possession without spending. Per class:

- **Rarity** — check the referenced handle's name length (UltraRare = 2, Rare = 3).
- **OG** — referenced handle ∈ the OG list.
- **Partner-NFT** — referenced asset's policy ∈ the allowlisted partner-policy set.

Open sub-item: the **OG list** and **partner-policy allowlist** need an on-chain home (legacy
hardcodes `MINTED_OG_LIST`). Likely an admin/settings datum the validator reads (mirrors the
`$handle_policies` / `pfp_policy_ids` pattern).

### Free virtual mints — design (recommended, pending final confirm)

Legacy semantics: free iff the root's **current count of private virtuals < 3** (counts live
existing privates; **burning one refunds the slot**). DeMi design:

- Store a **counter** (not the set of names — counter is sufficient and cheaper) of current
  private virtuals **in the root handle's MPT value** (alongside the WS1 label list:
  `{ labels, free_virtual_count }`).
- Enforce the coupling like WS1's label invariant: **private-virtual mint ⟹ counter +1,
  private-virtual burn ⟹ counter −1** (public virtuals never touch it). Free iff the pre-mint
  counter `< 3`. The coupling makes drift impossible.
- Rides existing machinery: every mint/burn already spends `minting_data` and updates the MPT
  root, and WS2's virtual-burn-delete is the same tx that decrements — atomic, no extra UTxO,
  **no `OwnerSettings` schema migration** and no "mint mutates the owner's settings UTxO
  without the owner's signature" authorization problem (the reason the 001-datum location was
  rejected — 001 settings are read as a *reference* input today, not spent).
- A free-virtual mint/burn proves+updates two MPT keys: the sub's own key + the root's counter.

### Tasks

- [ ] Implement D6 reference-input + shared payment/stake-credential check for rarity/OG/partner.
- [ ] Decide + build the on-chain home for the OG list and partner-policy allowlist.
- [ ] Extend the root's MPT value to carry `free_virtual_count`; enforce the +1/−1 mint/burn
      coupling and the `< 3` free gate (build with WS1 value redesign + WS2 burn-delete).
- [ ] Extend `orders.ak` + order build (`src/txs/order.ts`) for discounted/zero lovelace.
- [ ] Enforce discount validity in the mint validator so a discounted order can't be forged.
- [ ] Tests: rarity, OG, partner-NFT each succeed when eligible / fail unbacked; free-virtual
      free for first 3 private, paid for the 4th, and **slot refunded after a private burn**.

---

## 6. 28-character handles

The on-chain validator is the real gatekeeper and **still caps roots at 15**. Frontend
state is inconsistent across repos, and the BFF regex has live bugs.

### Inventory (re-verify lines before editing)

| Repo | File:line | Rule | Current | Change for 28? |
| --- | --- | --- | --- | --- |
| decentralized-minting | `smart-contract/lib/validations/minting_data/utils.ak:16` | root cap `max_handle_length` | **15** | **YES — gatekeeper** |
| decentralized-minting | `.../utils.ak:18` | sub cap `max_sub_handle_length` | 28 (full `sub@root`) | no |
| kora-labs-common | `src/handles/constants.ts:11` | `REGEX_HANDLE` | `{1,15}`, mixed case | **YES** (28 + lowercase) |
| kora-labs-common | `src/handles/constants.ts:12` | `REGEX_SUB_HANDLE` | root part `{1,15}` | **YES** (root → 28) |
| handle.me/bff | `lib/constants.ts:103-104` | `ALLOWED_CHAR` etc. | mixed case + **literal `\|` bug** | **YES** (fix pipes + lowercase) |
| handle.me/bff | `lib/nfts.ts:3` | `isValid` length | `<= 15` | **YES** (→ 28) |
| handle.me/static | `lib/constants.ts:22,92` + `lib/helpers/nfts.ts:8` | root | 28, lowercase, no pipes | already correct ✅ |
| minting.handle.me | `src/helpers/constants.ts:46,54` | root + sub pattern | `{1,15}`, mixed case | YES (lower priority) |

### Notes / bugs found

- BFF `ALLOWED_CHAR = /^[a-zA-Z|0-9|\-|\_|\.]*$/g` puts literal `|` inside the class —
  pipes are currently *accepted* as valid handle chars. The corrected form is the
  `handle.me/static` version: `/^[a-z0-9\-_.]*$/` (lowercase only, no pipes).
- Subhandle regex caps the **root portion after `@`** at 15 independently of the total
  length — that sub-cap must also move to 28 for a 28-char root to be usable as a parent.

### Tasks

- [ ] Bump `max_handle_length` → 28 in `utils.ak` (this is the change that actually lets
      28-char handles mint) — requires contract rebuild + redeploy.
- [ ] Update `kora-labs-common` `REGEX_HANDLE` / `REGEX_SUB_HANDLE` (28 + lowercase) and
      republish; ripples to every consumer.
- [ ] Fix BFF `lib/constants.ts` regex (pipes + lowercase) and `lib/nfts.ts` length cap.
- [ ] Align `minting.handle.me` constants.
- [ ] Tests: 28-char accept, 29-char reject, uppercase reject, pipe reject, subhandle
      with 28-char root accept.

---

## 7. Sunset enforcement via `$handle_policies`

**Scope clarification (2026-05-31):** DeMi does **not** need general multi-policy support.
A new policy would be a new contract, so DeMi has no business validating arbitrary unknown
policies. What DeMi *does* need is to respect **two** sunset slots: the **legacy** policy's
and its **own**. Neither is sunset today, so this is forward-looking infrastructure.

### The cutover interpretation (confirmed 2026-05-31)

The legacy sunset slot is the **cutover trigger**: before it, DeMi mints under the legacy
policy (migration); at/after it, DeMi refuses legacy-policy mints and only mints under its own
new policy (whose window is bounded by its `first`/`last`/`sunset`). Sunset enforcement *is*
the controlled hand-off from legacy-policy to new-policy minting.

**Timing:** nothing sunsets in the near term. Legacy sunset is set only **after DeMi reaches
legacy parity** (the rest of this doc). So build the mechanism now and leave the slots unset
/ open until then — it lies dormant until Kora writes a legacy sunset slot to trigger cutover.

### State

- `$handle_policies` is an admin root-handle datum, read by api.handle.me:
  `api.handle.me/utils/policies.ts:3` (`HANDLE_POLICIES_NAME`), decoded to a map of
  policyId → `[first_minting_slot, last_minting_slot, sunset_slot]`
  (`routes/policies.route.test.ts:46-72`; `0` ⇒ `null`). Exposed via `GET /policies`.
- **DeMi enforces no time/slot/sunset window on minting at all** — confirmed across
  `minting_data/validation.ak`, `utils.ak`, `settings_v1.ak`, and `demimnt.ak`. The only
  slot tracking that exists is for MPT root-hash mismatch detection, not mint gating.
- DeMi knows one legacy policy, hard-coded (`src/constants/index.ts:46` `LEGACY_POLICY_ID`,
  `demimntmpt.ak:34` compile-time param).

### Recommended design (Open Decision D7)

Read the two relevant policy windows from `$handle_policies` as a **reference input** at
runtime rather than baking sunset slots into `SettingsV1`. Single source of truth shared
with api.handle.me; Kora can sunset/adjust the cutover without redeploying DeMi. Enforce via
the tx **validity interval** (the same `buildKoiosValidityInterval` mechanism that already
caps partner mints ≤ 900 slots) — a mint is allowed only if the tx's validity upper bound
proves it falls inside the policy's permitted window.

### Tasks

- [ ] Confirm the cutover interpretation above with product (Open Decision D7).
- [ ] Add a `$handle_policies` reference-input read to the mint validators; extract the
      legacy + DeMi-own windows (`first`/`last`/`sunset`).
- [ ] Gate legacy-policy mints on `tx.validity_range` vs. legacy sunset; gate new-policy
      mints on the DeMi-own window. Tie into existing `buildKoiosValidityInterval`.
- [ ] Engine: fetch + attach the `$handle_policies` ref input when building mint txs.
- [ ] Tests: legacy mint before sunset succeeds, at/after sunset fails; new-policy mint
      inside its window succeeds, outside fails.

---

## 8. Admin refund of invalid orders

**Goal:** let Kora/an operator refund orders that can never be fulfilled (handle already
taken, malformed, etc.), instead of leaving the funds stuck until the owner cancels.

### State

`smart-contract/validators/demiord.ak` has two redeemers:

- `Execute` — requires the `mint_governor` withdrawal script (`is_withdrawal_script_executed`),
  i.e. fulfillment via a mint.
- `Cancel` — `multisig.satisfied(datum.owner, …)`: **only the order's owner** can spend the
  order UTxO to get their lovelace back. `OrderDatum = { owner: Data (MultisigScript),
  requested_handle, destination_address }` (`smart-contract/lib/decentralized_minting/orders.ak`).

So a stuck/invalid order whose owner never cancels has its locked lovelace trapped forever.

### Recommended design — admin refund that can't steal

Add an admin-authorized refund path **gated on returning the order's lovelace to the owner**.
The funds-to-owner constraint is what makes it safe: the admin can clear any order but can
only ever send the money back to the party that funded it — no need to prove "invalidity"
on-chain (which would require an MPT existence proof).

- Authorize via the admin / `mint_governor` already in `Settings` (the same source `Execute`
  uses), as a new `Refund` redeemer (preferred over overloading `Cancel`).
- Enforce: an output returns the order UTxO's lovelace to the owner. **Open sub-item:** the
  exact refund target — an address derived from the `owner` multisig credential vs.
  `destination_address`. Owner-credential is the safer default (funds go back to who paid).
- Off-chain: add a refund builder beside the existing cancel in `src/txs/order.ts`.

### Tasks

- [ ] Add a `Refund` redeemer to `OrderRedeemer` + `demiord.ak`, authorized by admin /
      `mint_governor`, enforcing lovelace-returned-to-owner.
- [ ] Decide the refund target (owner credential vs `destination_address`).
- [ ] Off-chain refund tx builder (`src/txs/order.ts`) + operator CLI entry.
- [ ] Tests: admin refunds a stuck order → owner receives the lovelace; admin **cannot**
      redirect funds elsewhere; owner `Cancel` still works.

---

## Open decisions (need a product/architecture call)

| ID | Decision | Status |
| --- | --- | --- |
| D1 | What do labels 002/003 mean? | **Resolved** — non-blocking; the registry tracks an opt-in label set with no contract vocabulary, so labels are added as features land (003 doesn't exist yet; fine) |
| D2 | MPT registry encoding | **Resolved** — key=handle, value=label list, enforce add⟺mint / remove⟺burn |
| D3 | Burn architecture | **Resolved** — per-burn MPT-delete tx |
| D4 | Personalization scope | **Resolved** — app-side only; same persprx V3 contract, no DeMi contract change |
| D5 | WS4 scope | **Resolved** — not root pricing; **enforce Kora fee target on every subhandle mint** (owner sets price above the floor). Impl detail open |
| D6 | Discount classes + eligibility proof | **Resolved** — Rarity+OG+Partner-NFT+free-virtual (buy-down out). Eligibility = reference the qualifying asset + shared payment/stake credential. Free-virtual = counter in root MPT value (+1 mint / −1 burn, free if <3). **Open sub-item:** on-chain home for OG list + partner allowlist |
| D7 | Sunset enforcement | **Resolved** — respect legacy + own sunset only (no multi-policy); read `$handle_policies` as ref input + validity-interval gate. Forward-looking: **nothing sunsets near-term**; legacy sunset is set *after* DeMi reaches parity and is the cutover trigger |

## Suggested sequencing

1. **WS2 (virtual burn drift)** and **WS6 (28-char)** are the most contained correctness
   wins. WS6's on-chain bump and WS2's burn-enable both require a contract redeploy — batch
   them into one validator release if the deployment pipeline allows.
2. **WS7 (`$handle_policies`)** is also a validator-parameter change → fold into the same
   redeploy cycle as WS2/WS6 to avoid three separate deployments.
3. **WS1 (MPT registry)** interacts with WS2 (both rewrite `update_root`); design and ship
   them together. **WS4 (subhandle fee)** is a small added validation branch — fold into
   the same validator release.
4. **WS5 (discounts)** is the largest engine + datum + contract effort and gates full
   parity. **WS3 (personalization)** is app-side only (frontend/BFF), independent of the
   validator releases and can proceed in parallel.
5. **WS8 (admin refund)** is a small, self-contained `demiord.ak` change — it can ride any
   validator release; ship it early since it's low-risk and de-risks stuck operator funds.

> Deployment note: every validator-touching workstream (WS1, WS2, WS4, WS6, WS7, WS8) shares
> one redeploy surface (WS5 too, once designed; WS8 touches the separate `demiord` validator).
> The env branches (`preview` → `preprod` → `mainnet`) and the `minting.handle.me` Lambda are
> propagation-staged — do not push concurrently, and never propagate to mainnet without
> explicit per-deploy authorization.
