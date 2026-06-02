use decentralized_minting/discount.{
  Hal, Legendary, Og, PartnerNft, Rare, UltraRare, apply_discount, discount_bps,
}

fn config() -> discount.DiscountConfig {
  discount.DiscountConfig {
    partner_nft_bps: 5000,
    hal_bps: 4000,
    og_bps: 7500,
    legendary_bps: 0,
    ultra_rare_bps: 3000,
    rare_bps: 2000,
    free_virtual_count: 3,
    hal_policy_id: #"abcd",
  }
}

// --- discount_bps maps each class to its configured value ---

test bps_partner() {
  discount_bps(config(), PartnerNft) == 5000
}

test bps_hal() {
  discount_bps(config(), Hal) == 4000
}

test bps_og() {
  discount_bps(config(), Og) == 7500
}

test bps_legendary_zero_today() {
  discount_bps(config(), Legendary) == 0
}

test bps_ultra_rare() {
  discount_bps(config(), UltraRare) == 3000
}

test bps_rare() {
  discount_bps(config(), Rare) == 2000
}

// --- apply_discount: percent-off via bps ---

test apply_50_percent() {
  apply_discount(1_000_000_000, 5000) == 500_000_000
}

test apply_75_percent() {
  apply_discount(800_000_000, 7500) == 200_000_000
}

test apply_zero_is_full_price() {
  apply_discount(5_000_000, 0) == 5_000_000
}

test apply_full_is_free() {
  apply_discount(5_000_000, 10000) == 0
}

test apply_floor_division() {
  // 3 * 3333 / 10000 = 0 (floor) -> price unchanged
  apply_discount(3, 3333) == 3
}

test apply_negative_bps_fails() fail {
  apply_discount(100, -1) == 0
}

test apply_over_100_percent_fails() fail {
  apply_discount(100, 10001) == 0
}
