# DeMi SubHandle Minting — Feature Spec & Corrections

Status: **DRAFT / REWORK PENDING** · Last updated: 2026-06-05

This doc captures the **DeMi subhandle minting** feature set and corrects four
architectural mistakes in the current implementation. It supersedes the relevant
parts of [`legacy-parity-plan.md`](./legacy-parity-plan.md); that plan's progress log
describes some of these features as wired onto the **legacy** path, which is wrong.

## Core principle

There are two independent mint paths. They do not share enforcement.

- **Legacy path** — unchanged. Mints under the legacy native policy `f0ff48bb`,
  exactly as it does on mainnet today. No DeMi orders, no fee enforcement, no
  free-virtual allowance, no discounts. Only uniqueness (MPT root) + the 222/100
  tokens. **We are adding nothing here.**
- **DeMi path** — the new work. Mints under the DeMi policy `6c32db33` via the
  Plutus `mint_governor` (decentralized, no policy key). **Everything below lives
  here.** Roots and subhandles alike are DeMi-policy assets.

(See [Resolved: separate enforcement paths, shared pure helpers](#resolved-separate-enforcement-paths-shared-pure-helpers) for how the two paths share code without sharing behavior.)

## Principle: chain is the source of truth

The per-root label tokens (`001` settings, and the `000`/`100`/`222` handle assets)
must on their own be a **complete, accurate record** — the off-chain index should be
rebuildable from chain data alone, with no external state required. Two consequences
that shape this work:

- The root's **MPT value** (carried on the latest `001`-token tx) holds the current set
  of free virtual sub names — so the free-allowance state is on-chain, not just in a DB.
- Each subhandle mint also writes its record to **tx metadata**. Validators can't read
  metadata, so it's not load-bearing for enforcement — it's a redundant, chain-native
  trail to rebuild the index from if the off-chain store is ever lost or wrong.

## Features we are adding (DeMi path only)

### SubHandle minting
- DeMi can mint subhandles (was unsupported)
- Subhandles mint under the **DeMi policy** `6c32db33`
- Subhandle type (NFT vs virtual) stored on-chain (`is_virtual` in OrderDatum)

### Additive subhandle fees
- Three separate fees, all additive
- **Owner fee** enforced → owner's `payment_address`
- Flat minter fee enforced → an allowed minter
- Flat treasury fee enforced → `treasury_address`
- Owner fee may be zero (output skipped)
- Minter/treasury fees may be zero (output skipped)
- Owner fees merged per owner across the batch
- Flat minter/treasury fold into the batch minter/treasury outputs (design A)
- Roots keep their percentage split; only subs use the flat amounts
- Two new settings: `sub_handle_minter_fee`, `sub_handle_treasury_fee`
- Parses `payment_address` to key-or-script credential
- Dropped "price must exceed zero" check
- Removed the old percentage-based subhandle fee model

> **Terminology:** call it the **owner fee**, not "royalty" — "royalty" has a
> specific CIP-27 meaning in Cardano and is not what this is.

### Free virtual allowance
- First 3 **private** virtual subs per root are free
- Tracks the **set of free names** (≤3), not a decrementing counter
- The free names live in the root's **MPT value** (at the root key), alongside its
  label set — value becomes `(free_names, labels)` (was `(count, labels)`)
- The latest `001`-token tx is the authoritative record of current free virtuals
- Also written to **tx metadata** each mint (contracts can't read metadata, but it
  lets the off-chain index be rebuilt from chain if ever needed)
- Minting a free virtual **adds its name** to the set (free while `|set| < 3`)
- **Burning a free name removes it → reopens that slot** for another free virtual
- Burning a *paid* sub touches the set not at all
- Public virtuals never consume the allowance

**Mechanism (move 3).** Re-introduce a per-order `free_virtual: Option<FreeVirtualData>`
on the DeMi orders path (the same shape removed from the legacy path in move 2, now where
it belongs). For a private-virtual order it carries the **root key's MPT proof + current
`free_names`**, so the validator can verify the old root value and write the new one
(add the name on free mint, remove on free burn). `free_virtual = None` for nft/public/root
orders. This changes the `MintNewHandles` redeemer's proof element and the `(count,labels)`
registry encoding, which also ripples into the WS1 `LabelAssetProof` (`old_free_names`).

### Discounts
- Discount config in basis points
- Six discount classes total
- OG: handle's CIP-68 reference datum `og_number > 0`
- Legendary / Ultra Rare / Rare: by handle rarity
- Partner-NFT: policy proven in the allowlist root
- HAL: asset under the configured HAL policy
- Partner allowlist read from `$pfp_policy_ids` root
- Caller claims one class; only that class's bps applies
- Claim is forge-proof (referenced asset + shared credential + rarity/OG check)

### Sunset / minting window
- Per-policy window: first / last / sunset slot
- Reads the `$handle_policies` admin datum
- Legacy sunset is the cutover trigger to the new policy
- Windows open (`0`) until Kora sets them

### Orders (DeMi-only)
- Orders (`demiord`) are for DeMi mints **only** — legacy never uses them
- Admin `Refund` redeemer for stuck/unfulfillable orders
- Admin can refund but never redirect funds
- Refund returns lovelace to the original owner
- Refund covers **every order that can be placed** (see below)

#### Refund and "single-signature owners"
The order owner is stored as a Sundae multisig, and admin `Refund` matches
`multisig.Signature { key_hash }` and pays the lovelace back to that key's
credential. This is **not** a restriction relative to who can order: order
placement ([`txs/order.ts`](../../src/txs/order.ts)) already requires the buyer's
payment credential to be a **key hash** (`"Payment credential must be a key hash"`)
and encodes the owner as exactly that `Signature { key_hash }`. So a *simple payment
address* is the canonical — and only — supported owner, and Refund covers 100% of
placeable orders. The genuinely unsupported case is the inverse: **script-credential
wallets** (smart-contract wallets) are rejected at order *placement*, so they can't
place a DeMi order at all today — independent of Refund. Supporting them later means
relaxing the placement check *and* adding a `ScriptCredential` arm to the Refund
payout match.

## Implementation divergences to fix

The current branch (`parity/legacy-parity-foundation`) built much of the above onto
the **legacy** path. These need rework before deploy:

1. **DeMi subs mint under legacy policy.** `process_legacy_handles`
   (`validations/minting_data/utils.ak`) mints at `legacy_policy_id`. DeMi subs must
   mint under `6c32db33` via the DeMi mint path. → moves the whole subhandle mint.
2. **Fees enforced on the legacy path.** The additive three-fee check sits in
   `process_legacy_handles`. It belongs on the DeMi path; legacy enforces nothing new.
3. **Free-virtual is a counter.** `registry_value.ak` encodes a count that
   *decrements on burn* — burning a paid 4th sub re-opens a spent free slot. Replace
   with a free-**name** set (≤3); burning a paid sub leaves the set untouched.
4. **Orders execute for legacy.** Commit `97a9998` made `can_execute_order` serve
   both new and legacy. Revert — orders are DeMi-only.

## Resolved: separate enforcement paths, shared pure helpers

(Decided 2026-06-05.) The two mint paths have opposite trust models — legacy is
permissioned (Kora's policy key signs `f0ff48bb`, minter already trusted, fees are an
off-chain payment-side concern today), DeMi is permissionless (`6c32db33` Plutus mint,
nothing trusted, so fees **must** be enforced on-chain). That asymmetry decides it:

- **Enforcement is separate.** `process_legacy_handles` keeps doing only uniqueness +
  222/100 correctness — byte-for-byte today's behavior — and never calls fee/allowance/
  discount code. The DeMi subhandle path owns all three fees + the free-name allowance +
  discounts.
- **Pure math is shared as library helpers** — tier-price lookup, `owner_payment_credential`
  parsing, discount-bps arithmetic — imported **only** by the DeMi path. Legacy never
  invokes them.

Rejected "shared with legacy passing zeros": it burns ex-units on every (high-volume)
legacy mint for logic it doesn't need, re-couples legacy to DeMi fee code (the exact
entanglement that caused the original mistake), and makes "legacy behaves as today"
un-auditable. Separation is also the more resource-efficient option, not less.
