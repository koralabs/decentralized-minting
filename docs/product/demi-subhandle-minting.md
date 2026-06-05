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

> The legacy path may *reuse* DeMi's fee/allowance code if that's cleaner and more
> resource-efficient than duplicating logic — but it must stay behaviorally
> identical to today (charges nothing new). Sharing code ≠ sharing behavior.

## Features we are adding (DeMi path only)

### SubHandle minting
- DeMi can mint subhandles (was unsupported)
- Subhandles mint under the **DeMi policy** `6c32db33`
- Subhandle type (NFT vs virtual) stored on-chain (`is_virtual` in OrderDatum)

### Additive subhandle fees
- Three separate fees, all additive
- Owner royalty enforced → owner's `payment_address`
- Flat minter fee enforced → an allowed minter
- Flat treasury fee enforced → `treasury_address`
- Owner fee may be zero (output skipped)
- Minter/treasury fees may be zero (output skipped)
- Owner fees merged per owner across the batch
- Two new settings: `sub_handle_minter_fee`, `sub_handle_treasury_fee`
- Parses `payment_address` to key-or-script credential
- Dropped "price must exceed zero" check
- Removed the old percentage-based fee model

### Free virtual allowance
- First 3 **private** virtual subs per root are free
- Tracks the **set of free names** (≤3), **not** a counter
- Burning a *paid* sub never reopens a free slot
- Public virtuals never consume the allowance
- Encoding stays backward-compatible (no 001 migration)

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
- Refund works for **single-signature** owners only; composite-multisig owners
  reclaim via owner-authorized `Cancel`

#### Why "single-signature owners only"
The order owner is stored as a Sundae-style multisig — a single key *or* a
composite (2-of-3, a script, …). Admin `Refund` must guarantee the operator can't
redirect funds to themselves, so it requires exactly one signature
(`multisig.Signature { key_hash }`) to have one unambiguous payout address.
Composite owners have no single forced target, so the contract can't safely
admin-refund them — they self-`Cancel`. Almost all orders are single-wallet, so
admin-refund covers the common case.

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

## Open decision

Do legacy and DeMi **share** the fee/allowance/discount modules (legacy passes
zeroes / empty config so it charges nothing), or stay **fully separate** code paths?
Shared is less duplication; separate is less risk of legacy accidentally enforcing
something. Leaning shared-with-zero-config pending your call.
