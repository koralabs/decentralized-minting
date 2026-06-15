use aiken/primitive/bytearray
use decentralized_minting/registry_value.{
  add_free_name, encode, has_free_name, has_free_slot, remove_free_name,
}

// --- encode: backward-compatible with WS1 label sets ---

test encode_empty_set_is_backward_compatible() {
  // no free names, no labels -> empty value (existing handles unchanged)
  encode([], #"") == #""
}

test encode_empty_set_is_pure_labels() {
  // pure label set, no free names -> byte-identical to the WS1 value (no migration)
  encode([], #"00001070000020e0") == #"00001070000020e0"
}

test encode_nonempty_set_differs_from_labels() {
  encode([#"6162"], #"00001070") != #"00001070"
}

test encode_nonempty_set_has_marker_and_labels_suffix() {
  let v = encode([#"6162"], #"00001070")
  and {
    // 0xff marker can never collide with a label set (label prefixes start 0x00)
    bytearray.take(v, 1) == #"ff",
    // the label set is the suffix
    bytearray.drop(v, bytearray.length(v) - 4) == #"00001070",
  }
}

test encode_is_deterministic() {
  encode([#"6162",
      #"6364"], #"00001070") == encode([#"6162", #"6364"], #"00001070")
}

test encode_distinct_sets_distinct_values() {
  encode([#"6162"], #"00001070") != encode([#"6162", #"6364"], #"00001070")
}

// --- has_free_slot: first 3 are free ---

test free_slot_for_first_three() {
  and {
    has_free_slot([], 3),
    has_free_slot([#"61"], 3),
    has_free_slot([#"61", #"62"], 3),
  }
}

test no_free_slot_once_three_held() {
  has_free_slot([#"61", #"62", #"63"], 3) == False
}

// --- add / remove / has name ---

test add_free_name_records_it() {
  has_free_name(add_free_name([], #"61"), #"61")
}

test add_free_name_is_idempotent() {
  add_free_name([#"61"], #"61") == [#"61"]
}

test remove_free_name_reopens_a_slot() {
  // 3 held (full) -> remove one free name -> back under the cap (free again)
  let after = remove_free_name([#"61", #"62", #"63"], #"62")
  and {
    !has_free_name(after, #"62"),
    has_free_slot(after, 3),
  }
}

test remove_absent_name_is_noop() {
  // burning a PAID sub (name not in the free set) leaves the allowance untouched
  remove_free_name([#"61", #"62"], #"99") == [#"61", #"62"]
}

// --- free-virtual mint value transition (what add_root_free_name feeds mpt.update) ---
// A free private-virtual MINT moves the root value from encode(names, labels) to
// encode(names + sub, labels). This pins both the transition and the prepend ordering the
// off-chain engine must replicate byte-for-byte (else mpt.update's old/new bytes won't match).
test free_virtual_mint_value_transition() {
  let names =
    [#"6162"]
  let labels = #"00001070"
  let sub = #"6364"
  let old_value = encode(names, labels)
  let new_value = encode(add_free_name(names, sub), labels)
  and {
    // there was a free slot to claim
    has_free_slot(names, 3),
    // the value actually changes
    old_value != new_value,
    // add prepends, so the new value is encode([sub, ..names], labels)
    new_value == encode([#"6364", #"6162"], labels),
  }
}

// The reverse (a free burn) moves it back — symmetric with the mint, reopening the slot.
test free_virtual_burn_value_transition() {
  let names =
    [#"6364", #"6162"]
  let labels = #"00001070"
  let after = remove_free_name(names, #"6364")
  and {
    encode(after, labels) == encode([#"6162"], labels),
    has_free_slot(after, 3),
  }
}

// Burn is the EXACT inverse of mint: a free-virtual mint then burn returns the root value to its
// start — the core correctness BurnNewHandles' remove_root_free_name relies on (DSH-203).
test free_virtual_mint_then_burn_roundtrips() {
  let start =
    [#"6162"]
  let labels = #"00001070"
  let sub = #"6364"
  let after_mint = add_free_name(start, sub)
  let after_burn = remove_free_name(after_mint, sub)
  encode(after_burn, labels) == encode(start, labels)
}
