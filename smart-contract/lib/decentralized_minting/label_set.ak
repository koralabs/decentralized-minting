use aiken/bytearray

// WS1 — per-Handle asset-label registry value encoding.
//
// The MPT value for a handle key was a constant empty `#""` (presence set). It now becomes
// the canonical set of CIP-67 label prefixes minted for that handle: a sorted concatenation
// of fixed-width (4-byte) label prefixes. Empty set = `#""` (so existing keys need no
// migration). Sorting makes the encoding canonical, so the same set always hashes to the
// same root on- and off-chain regardless of the order labels were added.
//
// The contract records label *existence* only — it never interprets which label (001/002/…)
// it is, so new tracked labels need no change here.

pub const label_width: Int = 4

// Does the set contain `label`?
pub fn contains(set: ByteArray, label: ByteArray) -> Bool {
  if bytearray.is_empty(set) {
    False
  } else {
    let head = bytearray.take(set, label_width)
    if head == label {
      True
    } else {
      contains(bytearray.drop(set, label_width), label)
    }
  }
}

// Insert `label` into the set, keeping it sorted ascending. Fails if already present
// (a label can only be added once — its asset is minted exactly once).
pub fn insert(set: ByteArray, label: ByteArray) -> ByteArray {
  expect bytearray.length(label) == label_width
  do_insert(set, label)
}

fn do_insert(set: ByteArray, label: ByteArray) -> ByteArray {
  if bytearray.is_empty(set) {
    label
  } else {
    let head = bytearray.take(set, label_width)
    when bytearray.compare(label, head) is {
      // label sorts before head -> prepend
      Less -> bytearray.concat(label, set)
      // already present -> not allowed
      Equal -> fail @"LABEL_ALREADY_PRESENT"
      // keep head, recurse into the tail
      Greater ->
        bytearray.concat(
          head,
          do_insert(bytearray.drop(set, label_width), label),
        )
    }
  }
}

// Remove `label` from the set. Fails if absent (can't burn a label that was never recorded).
pub fn remove(set: ByteArray, label: ByteArray) -> ByteArray {
  expect bytearray.length(label) == label_width
  do_remove(set, label)
}

fn do_remove(set: ByteArray, label: ByteArray) -> ByteArray {
  expect !bytearray.is_empty(set)
  let head = bytearray.take(set, label_width)
  if head == label {
    bytearray.drop(set, label_width)
  } else {
    bytearray.concat(head, do_remove(bytearray.drop(set, label_width), label))
  }
}

// Apply a +1 (add label) or -1 (remove label) delta to the set. This is the single point
// that couples the MPT value change to the tx mint/burn: add-to-set ⟺ mint, remove ⟺ burn.
pub fn apply(set: ByteArray, label: ByteArray, amount: Int) -> ByteArray {
  when amount is {
    1 -> insert(set, label)
    -1 -> remove(set, label)
    _ -> fail @"INVALID_AMOUNT"
  }
}
