use decentralized_minting/label_set.{apply, contains, insert, remove}

// CIP-67 label prefixes used in the registry (4 bytes each), in ascending byte order:
//   001 = 00001070, 002 = 000020e0, 100 = 000643b0, 222 = 000de140
const lbl_001: ByteArray = #"00001070"
const lbl_002: ByteArray = #"000020e0"
const lbl_100: ByteArray = #"000643b0"
const lbl_222: ByteArray = #"000de140"

// --- contains ---

test contains_empty_is_false() {
  contains(#"", lbl_001) == False
}

test contains_present() {
  contains(#"00001070000020e0", lbl_002) == True
}

test contains_absent() {
  contains(#"00001070000020e0", lbl_100) == False
}

// --- insert keeps canonical (sorted) order regardless of insertion order ---

test insert_into_empty() {
  insert(#"", lbl_001) == lbl_001
}

test insert_appends_in_order() {
  insert(#"00001070", lbl_002) == #"00001070000020e0"
}

test insert_prepends_smaller() {
  // 002 (000020e0) sorts after 001 (00001070); insert 001 into {002} -> {001,002}
  insert(#"000020e0", lbl_001) == #"00001070000020e0"
}

test insert_middle() {
  // {001, 222} + 100 -> {001, 100, 222}
  let with_001_222 = insert(insert(#"", lbl_001), lbl_222)
  insert(with_001_222, lbl_100) == #"00001070000643b0000de140"
}

test insert_order_independent() {
  // building {001,002,100} in two different orders yields the identical canonical bytes
  let a = insert(insert(insert(#"", lbl_100), lbl_001), lbl_002)
  let b = insert(insert(insert(#"", lbl_002), lbl_100), lbl_001)
  and {
    a == b,
    a == #"00001070000020e0000643b0",
  }
}

test insert_duplicate_fails() fail {
  insert(#"00001070", lbl_001) == #""
}

// --- remove ---

test remove_only() {
  remove(#"00001070", lbl_001) == #""
}

test remove_head() {
  remove(#"00001070000020e0", lbl_001) == #"000020e0"
}

test remove_tail() {
  remove(#"00001070000020e0", lbl_002) == #"00001070"
}

test remove_absent_fails() fail {
  remove(#"00001070", lbl_002) == #""
}

test remove_from_empty_fails() fail {
  remove(#"", lbl_001) == #""
}

// --- apply couples the value delta to mint(+1)/burn(-1) ---

test apply_add() {
  apply(#"00001070", lbl_002, 1) == #"00001070000020e0"
}

test apply_remove() {
  apply(#"00001070000020e0", lbl_002, -1) == #"00001070"
}

test apply_add_then_remove_roundtrip() {
  let added = apply(#"", lbl_001, 1)
  apply(added, lbl_001, -1) == #""
}

test apply_invalid_amount_fails() fail {
  apply(#"", lbl_001, 2) == #""
}
