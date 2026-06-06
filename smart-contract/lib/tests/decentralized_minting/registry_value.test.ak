use aiken/bytearray
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
  encode([#"6162", #"6364"], #"00001070") == encode(
    [#"6162", #"6364"],
    #"00001070",
  )
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
