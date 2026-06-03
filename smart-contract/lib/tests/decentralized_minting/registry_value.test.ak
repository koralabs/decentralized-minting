use decentralized_minting/registry_value.{
  apply_virtual_delta, encode, is_free_virtual, virtual_mint_is_free,
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
    is_free_virtual(0, 3),
    is_free_virtual(1, 3),
    is_free_virtual(2, 3),
  }
}

test paid_from_fourth() {
  and {
    is_free_virtual(3, 3) == False,
    is_free_virtual(4, 3) == False,
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
    is_free_virtual(after_burn, 3),
  }
}

test delta_burn_below_zero_fails() fail {
  apply_virtual_delta(0, -1) == 0
}

test delta_invalid_amount_fails() fail {
  apply_virtual_delta(0, 2) == 0
}

// --- virtual_mint_is_free: private draws from the free allowance; public always pays ---

test private_virtual_free_when_slots_remain() {
  and {
    virtual_mint_is_free(0, 3, False),
    virtual_mint_is_free(2, 3, False),
  }
}

test private_virtual_paid_when_slots_used() {
  virtual_mint_is_free(3, 3, False) == False
}

test public_virtual_never_free() {
  and {
    virtual_mint_is_free(0, 3, True) == False,
    virtual_mint_is_free(2, 3, True) == False,
  }
}
