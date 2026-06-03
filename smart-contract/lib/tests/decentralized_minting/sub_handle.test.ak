use decentralized_minting/sub_handle.{
  get_sub_handle_price_from_tier_pricing, sub_handle_kora_fee,
}

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

// --- WS4: Kora (treasury) fee derived from the owner's tier pricing, floored at min ---

fn as_data(x: Data) -> Data {
  x
}

// OwnerSettings is a tuple alias: (nft, virtual, buy_down*3, agreed_terms, migrate_sig, payment)
// SubHandleSettings tuple: (public_minting, pz_enabled, tier_pricing, default_styles, save_addr)
fn owner_settings() {
  let nft = (0, 1, [(1, 100_000_000), (3, 50_000_000)], as_data(0), 0)
  let virtual = (0, 1, [(1, 2_000_000)], as_data(0), 0)
  (nft, virtual, 0, 0, 0, as_data(0), 0, #"")
}

test kora_fee_nft_is_treasury_cut() {
  // nft price (len 1) = 100_000_000; 10% = 10_000_000 (above the 2_000_000 floor)
  sub_handle_kora_fee(owner_settings(), 1, False, 10) == 10_000_000
}

test kora_fee_virtual_floored_to_min() {
  // virtual price = 2_000_000; 10% = 200_000 -> floored at min_treasury_fee (2_000_000)
  sub_handle_kora_fee(owner_settings(), 1, True, 10) == 2_000_000
}
