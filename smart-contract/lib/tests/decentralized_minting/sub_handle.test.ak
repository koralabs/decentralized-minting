use decentralized_minting/sub_handle.{get_sub_handle_price_from_tier_pricing}

fn tier_pricing_0() -> List<(Int, Int)> {
  [(1, 100_000_000), (3, 50_000_000), (6, 5_000_000)]
}

test get_sub_handle_price_from_tier_pricing_0() {
  get_sub_handle_price_from_tier_pricing(tier_pricing_0(), 1) == 100_000_000
}

test get_sub_handle_price_from_tier_pricing_1() {
  get_sub_handle_price_from_tier_pricing(tier_pricing_0(), 2) == 100_000_000
}

test get_sub_handle_price_from_tier_pricing_2() {
  get_sub_handle_price_from_tier_pricing(tier_pricing_0(), 3) == 50_000_000
}

test get_sub_handle_price_from_tier_pricing_3() {
  get_sub_handle_price_from_tier_pricing(tier_pricing_0(), 5) == 50_000_000
}

test get_sub_handle_price_from_tier_pricing_4() {
  get_sub_handle_price_from_tier_pricing(tier_pricing_0(), 6) == 5_000_000
}

test get_sub_handle_price_from_tier_pricing_5() {
  get_sub_handle_price_from_tier_pricing(tier_pricing_0(), 7) == 5_000_000
}

test get_sub_handle_price_from_tier_pricing_6() {
  get_sub_handle_price_from_tier_pricing(tier_pricing_0(), 10) == 5_000_000
}
