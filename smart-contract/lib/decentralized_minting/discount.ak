use aiken/merkle_patricia_forestry as mpt
use aiken/transaction/value.{PolicyId}

// WS5 — discount configuration + amount math. Mirrors legacy (minting.handle.me nft.ts:238,
// `feeAfterDiscount = handleCost - handleCost * discount`) with the fraction expressed as
// BASIS POINTS (bps/10000) so the validator can use integer arithmetic. Lives inside
// `SettingsV1` (the sanctioned, policy-stable extension point). A single best discount applies
// per order (the caller picks the winning class); only the claimed class's bps is used here.

pub type DiscountConfig {
  // percent-off in basis points (e.g. 5000 = 50% off)
  partner_nft_bps: Int,
  // H.A.L. holders
  hal_bps: Int,
  og_bps: Int,
  // 1-char (none minted today, so 0%)
  legendary_bps: Int,
  // 2-char
  ultra_rare_bps: Int,
  // 3-char
  rare_bps: Int,
  // number of free private-virtual mints per root (legacy = 3)
  free_virtual_count: Int,
  // the H.A.L. policy id (a referenced asset under this policy qualifies for hal_bps)
  hal_policy_id: PolicyId,
}

// The discount class an order claims.
pub type DiscountClass {
  PartnerNft
  Hal
  Og
  Legendary
  UltraRare
  Rare
}

// An order's discount claim — names the qualifying asset (referenced as a reference input,
// and whose holder must share a credential with the order's destination) so eligibility is
// deterministic and bound to the order. Per class:
//   RarityClaim  — a handle (222 owner) you hold; its name length sets the tier
//   OgClaim      — a handle you hold whose CIP-68 reference datum has og_number > 0
//   PartnerClaim — a partner NFT you hold whose policy is proven in the partner allowlist root
//   HalClaim     — a H.A.L. asset you hold (policy == config.hal_policy_id)
pub type DiscountClaim {
  RarityClaim { handle_name: ByteArray }
  OgClaim { handle_name: ByteArray }
  PartnerClaim {
    policy_id: PolicyId,
    asset_name: ByteArray,
    value: ByteArray,
    proof: mpt.Proof,
  }
  HalClaim { asset_name: ByteArray }
}

// The configured bps for a claimed class.
pub fn discount_bps(config: DiscountConfig, class: DiscountClass) -> Int {
  when class is {
    PartnerNft -> config.partner_nft_bps
    Hal -> config.hal_bps
    Og -> config.og_bps
    Legendary -> config.legendary_bps
    UltraRare -> config.ultra_rare_bps
    Rare -> config.rare_bps
  }
}

// Effective price after a bps percent-off discount. Floor division; clamped at 0. `bps` is
// validated to be within [0, 10000] so a discount can never exceed the price or go negative.
pub fn apply_discount(price: Int, bps: Int) -> Int {
  expect bps >= 0
  expect bps <= 10000
  let reduction = price * bps / 10000
  price - reduction
}
