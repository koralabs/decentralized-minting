# Contract Protections — DeMi + Personalization

**Purpose.** One succinct, testable "what does this protect" list per validator. This is the
**test checklist**: every bullet should become an Aiken test that asserts the protection holds
(and that its negation is rejected). Bullets marked **🔲 PLANNED** are protections we *want* but
the code does **not** enforce yet (the WS1 contract pass below) — those tests should fail today and
pass after the change. The goal is to see, property by property, whether the code reflects intent.

Repos / locations:
- **pers** — `handles-personalization/aiken/validators/` + `lib/personalization/`
- **demi** — `decentralized-minting/smart-contract/` + the mint-proxy policy in `smart-contract-mint-proxy/`

---

## Personalization contracts

### `persprx` — spend proxy (frozen, hash-stable)
Holds every handle's 100 reference token (and locks virtual 000s). Validates **nothing itself** —
it delegates to swappable withdraw observers. Its only job is to guarantee delegation is honest.
- Spend is authorized only if the `pz_settings` reference input is present and carries the settings
  token with an **inline** datum.
- A withdraw observer listed in `pz_settings.valid_contracts` must fire with a **zero-ada** withdrawal.
- The observer's redeemer envelope must be **exactly** `Constr 0 [own_ref, spend_redeemer]` (bytewise) —
  this is the cross-contract handshake; nothing else can stand in for the observer.
- The proxy hash is frozen: changing it requires a chain-wide 100 migration (so the set of contracts
  that can ever spend a 100 is itself protected).

### `perspz` — Personalize observer
Validates a `Personalize` (set/change appearance) on a handle.
- A set/changed **pfp/bg** asset must be policy-approved via an MPF proof against `pfp_policy_ids` /
  `bg_policy_ids`; a set asset with a missing/failed proof is **rejected**; an empty asset is exempt.
- A set/changed (non-reset) **designer** forces the `persdsg` observer to fire on the same tx.
- **Immutable fields** (handle name, standard image + hash, original address, nft fields bar image) are
  identical old→new.
- A set bg/pfp image must **match** the asset's on-chain CIP-68 reference datum image.
- `nsfw` in the new datum must equal the value derived from the bg/pfp approval statuses.
- Non-reset designer change must pay **treasury + provider (+ root share for subs)** fees, each tagged
  with the handle name (grace period waives them).
- **Virtual subs only** may carry `resolved_addresses`; the holder must sign if resolved-ada changes.
- Output must be re-locked at a current, `valid_contracts`-listed validator.
- Reset has a fixed shape (clears images/designer/trial/nsfw) and its own privacy rules.

### `perslfc` — Migrate / Revoke / Update / ReturnToSender observer
The lifecycle observer. One redeemer family, four branches, each with distinct auth.
- **Migrate**: admin-signed; datum byte-identical old→new; output holds the right token (100 root/nft,
  000 virtual) at a `valid_contracts` validator; 222 present if `owner_sig_required`.
- **Revoke** (virtual sub 000 burn): **private → root-signed**; **public → lease-expired**
  (`validity_start > old expiry`); the 000 is burned (−1) under legacy or a registered policy. **No admin.**
  - 🔲 **PLANNED #5**: add a **private → root-absent** path — a private sub may also be revoked when an
    MPT non-inclusion proof shows its root key is gone (orphan cleanup; verified on the demi side).
    Public stays lease-only and **inviolable** (no admin/root/proof can shorten the lease).
- **Update** (virtual sub renew/extend): protocol + root settings referenced; payload (minus virtual/
  resolved) unchanged; expiry window enforced; private vs public vs assignee-signed branches each pay
  the right price; admin required only on the private-extended-without-payment path.
- **ReturnToSender**: admin-signed; no output may carry a forbidden 100/001 handle asset.

### `persdsg` — designer-settings observer
Validates the `designer` payload for non-reset Personalize txs (split out of perspz for size).
- Reset short-circuits (designer not checked); silently dropping a present designer is **rejected**.
- Each designer property obeys its rule: forced props must equal the on-chain default; bounded props
  (`font_shadow_size`, `pfp_zoom`, `pfp_offset`) stay in range; qr eye/dot props match default or the
  `"square,"` form.
- The on-chain `designer` IPFS multihash must equal `sha2_256` of the serialized designer payload.

---

## Decentralized-minting contracts

### `demimntprx` — mint proxy policy (frozen, in `smart-contract-mint-proxy/`)
The minting policy under which DeMi handles mint. Validates **nothing about which tokens mint** —
it only delegates to the governor.
- A mint under this policy is valid **iff** the `demimnt` governor withdrawal fired
  (`is_withdrawal_script_executed(withdrawals, mint_governor)`).
- Policy id is frozen (the whole decentralized policy identity depends on it never changing).

### `demimnt` — governor / withdrawal validator
The withdrawal the proxy checks for. Gates minting on registry state being touched; redeemer-agnostic.
- `MintHandles` / `BurnHandles` are valid **iff** the `minting_data` UTxO (matching the minting-data
  script hash) is **spent** in the tx — i.e. the spend validator (`demimntmpt`) runs.
- It validates **no** token-level logic — all of that is the spend validator's job (so the protection
  here is purely "you can't mint/burn without engaging the registry").

### `demimntmpt` — minting-data spend validator (holds the MPT root)
The heart of the registry. Every handle mint/burn/label-change spends this UTxO and must advance the
single MPT root correctly. Six redeemers.

**All redeemers:**
- The `minting_data` output keeps the same address + value and only the datum (new MPT root) changes;
  it carries **no** reference script.
- The new root is the result of applying every supplied MPF proof to the old root (old/new value proven).
- The proof list is non-empty.

**`MintNewHandles`** (DeMi mint):
- **allowed_minter** must sign.
- Mints fall inside the new policy's `$handle_policies` window (when set).
- Each order is satisfied: right 100→pz, 222→destination, correct price (rarity − discount; subs at
  owner tier + flat fees); treasury/minter/owner fees all paid; `tx.mint` exactly equals the proofs.
- Free private virtuals consume a free slot and bump the root's free-name set.
- Handle charset/length (≤28) valid.

**`MintLegacyHandles`** / **`BurnLegacyHandles`**:
- Each proof inserts (+1) / deletes (−1) the handle key; `tx.mint` exactly equals the proofs; charset/
  length valid. No fees.
- Gated by the **legacy native policy** (no DeMi minter sig). *(Confirm this is the intended trust model
  for legacy — it's a deliberate non-protection, worth an explicit test asserting the native gate.)*

**`MintLabelAssets`** (001–004 mint **and** burn, via ±1):
- **allowed_minter** must sign.
- The root's **222** owner NFT is referenced; `find_owner_policy` resolves the label's policy from it.
- The registry value at the key is `encode(free_names, label_set.apply(old_labels, label, ±1))`; `tx.mint`
  is exactly ±1 of `(owner_policy, label‖name)`.
- 🔲 **PLANNED #2**: on **−1 (burn)** only, resolve the label's **actual** policy (legacy *and* new)
  instead of pinning to the 222's, so cross-pollinated f0ff-001 / DeMi-222 handles can clear. The **+1
  mint keeps the pin** (no fake-label registration).

**`BurnNewHandles`** (000 / 222 key removal):
- Each proof deletes the handle key; a free-virtual burn re-opens the root's free-name slot; `tx.mint`
  exactly equals the (negative) proofs.
- 🔲 **PLANNED #1**: require **allowed_minter** to sign (today it does **not**, unlike the mint path).
  This is *not* about unauthorized burns — you still can't delete a key without burning its token
  (`mint == expected_mint_value`), and that token burn is gated by pers (000) / the owner (222). It's
  about making the **minter the single serialized writer of the registry root**: without it, a handle
  owner advances the shared MPT root directly, contending on the one minting-data UTxO. It also makes
  the orphan path (#4) minter-*executed*, not truly permissionless. Backstops #3/#4 (same function);
  the label burn (#2) already has its own minter sig.
- 🔲 **PLANNED #3**: refuse to delete a key whose **old registry value is non-empty** (clear the 001s
  before a 222 can burn — no orphaned label tokens).
- 🔲 **PLANNED #4**: support the **orphan path** — a private-sub burn may carry an MPT non-inclusion
  proof of the **root** key; verify the root is genuinely absent (a live root's sub is unprovable-absent).

**`UpdateMPT`** (operator root sync — the `syncMintingDataRoot` path):
- `tx.mint == 0` (mints nothing) and **admin_verification_key_hash** signs.
- *Deliberately a bare datum swap — operator-gated, never automated. Its only protections are "no mint"
  and "admin signs"; everything else (root correctness) is trusted to the human operator.*

### `demiord` — orders spend validator
Gates order fulfilment / cancel / refund.
- **Execute**: valid iff the `mint_governor` withdrawal fired (an order is only consumed when a mint
  actually happens).
- **Cancel**: the order owner's multisig must authorize.
- **Refund**: governor fired; owner is a single-sig; some output pays ≥ the order's lovelace to the
  **owner's** payment credential (refunds can't be redirected).

---

## WS1 contract pass — the changes these flags imply

All currently **unstarted**; none block shipping the registry + reconcile. Each must land with the
failing-invariant tests above turned green.

1. **`demimntmpt` `can_burn_new_handles`: require `allowed_minter`** — close the burn-side sig hole.
2. **`demimntmpt` label burn: drop the policy pin on −1** — resolve the label's real policy; keep the
   pin on +1.
3. **`demimntmpt` key delete: empty-registry guard** — no deleting a key with a non-empty value.
4. **`demimntmpt` orphan path: root non-inclusion proof** — verify the root is gone for a non-root-signed
   private-sub burn.
5. **`pers` `revoke`: private root-absent branch** — add the orphan revoke; public stays lease-only.

## Test-matrix shape (per the "crossing-streams" concern)
- **Per-protection unit tests** — every bullet above, positive **and** negated, with exact-byte registry
  vectors where a value is encoded.
- **"Must never be possible" suite** — a demimntmpt burn accepted without the minter sig; delete a key
  without burning its token (`mint != proofs`); burn a 222 while its registry value is non-empty;
  orphan-burn a live root's sub (forged non-inclusion proof); burn any public sub before expiry; a
  relaxed label-burn used to forge a label mint.
- **Cross-contract (pers ↔ demi) combined-tx tests** — the 000 burn validated by both halves at once
  (root-signed, orphan, public-expired) — the #4/#5 handoff is where streams cross.
- **Regression** — every existing redeemer test stays green.
