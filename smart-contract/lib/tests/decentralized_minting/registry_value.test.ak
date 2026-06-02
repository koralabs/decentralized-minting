use decentralized_minting/registry_value.{
  apply_virtual_delta, encode, is_free_virtual,
}

// --- encode: backward-compatible with WS1 label sets ---

test encode_empty_is_backward_compatible() {
  // no virtuals, no labels -> empty value (existing handles unchanged)
  encode(0, #"") == #""
}

test encode_count_zero_is_pure_labels() {
  // pure label set, count 0 -> byte-identical to the WS1 value
  encode(0, #"00001070000020e0") == #"00001070000020e0"
}

test encode_count_positive_differs_from_labels() {
  // once a counter exists the value is the serialised pair, distinct from the bare labels
  encode(1, #"00001070") != #"00001070"
}

test encode_is_deterministic() {
  encode(2, #"00001070") == encode(2, #"00001070")
}

test encode_distinct_counts_distinct_values() {
  encode(1, #"00001070") != encode(2, #"00001070")
}

// --- is_free_virtual: first 3 are free ---

test free_for_first_three() {
  and {
    is_free_virtual(0),
    is_free_virtual(1),
    is_free_virtual(2),
  }
}

test paid_from_fourth() {
  and {
    is_free_virtual(3) == False,
    is_free_virtual(4) == False,
  }
}

// --- apply_virtual_delta: +1 mint / -1 burn (slot refund) ---

test delta_mint_increments() {
  apply_virtual_delta(0, 1) == 1
}

test delta_burn_decrements() {
  apply_virtual_delta(2, -1) == 1
}

test delta_burn_refunds_a_slot() {
  // 3 used (paid territory) -> burn one -> back to 2 (free again)
  let after_burn = apply_virtual_delta(3, -1)
  and {
    after_burn == 2,
    is_free_virtual(after_burn),
  }
}

test delta_burn_below_zero_fails() fail {
  apply_virtual_delta(0, -1) == 0
}

test delta_invalid_amount_fails() fail {
  apply_virtual_delta(0, 2) == 0
}
