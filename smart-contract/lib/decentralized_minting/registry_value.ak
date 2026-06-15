use aiken/builtin
use aiken/collection/list
use aiken/primitive/bytearray

// Free-virtual allowance (DeMi orders path) — the registry value at a ROOT handle key carries,
// alongside the WS1 label set, the SET OF NAMES of the root's currently-held FREE private virtual
// subs (at most `free_virtual_count`). The first N private virtuals per root are free; minting a
// free one ADDS its sub-name to the set, burning a free one REMOVES it (reopening a slot). Public
// virtuals never touch the set. Coupling the set to the mint/burn the same way WS1 couples the
// label set keeps the accounting drift-proof — it rides the same `minting_data` spend, and makes
// the latest 001-token tx an authoritative on-chain record of the root's current free virtuals.
//
// **Encoding (backward compatible with WS1).** The contract only ever *encodes* a value from the
// structured state `(free_names, labels)` — it never parses raw value bytes (the off-chain engine
// tracks the structured state and supplies it; `mpt.update`'s proof verifies the reconstructed old
// bytes are actually in the trie). So:
//   - `free_names == []`  ->  the value is exactly `labels` (so an empty handle stays `#""` and any
//     pure-label-set handle is byte-identical to WS1 — no migration).
//   - `free_names != []`  ->  `0xff ++ serialise_data(free_names) ++ labels`. Label sets are
//     concatenated 4-byte CIP-67 prefixes (always starting 0x00), so a leading `0xff` marker can
//     never collide with a pure label set; the CBOR list is self-delimiting, keeping the encoding
//     injective and trivial to reproduce off-chain.
pub fn encode(free_names: List<ByteArray>, labels: ByteArray) -> ByteArray {
  when free_names is {
    [] -> labels
    _ ->
      bytearray.concat(
        #"ff",
        bytearray.concat(builtin.serialise_data(free_names), labels),
      )
  }
}

// A free slot is available iff the root currently holds fewer than the configured free count.
pub fn has_free_slot(
  free_names: List<ByteArray>,
  free_virtual_count: Int,
) -> Bool {
  list.length(free_names) < free_virtual_count
}

// Is this sub-name one of the root's current free names? (a free burn checks this to know it
// should reopen a slot; a paid burn finds the name absent and leaves the set untouched.)
pub fn has_free_name(free_names: List<ByteArray>, name: ByteArray) -> Bool {
  list.has(free_names, name)
}

// Add a sub-name to the free set (a free private-virtual MINT). Idempotent — never duplicates.
pub fn add_free_name(
  free_names: List<ByteArray>,
  name: ByteArray,
) -> List<ByteArray> {
  if list.has(free_names, name) {
    free_names
  } else {
    list.push(free_names, name)
  }
}

// Remove a sub-name from the free set (a free private-virtual BURN → reopen its slot). No-op if
// the name isn't in the set (i.e. a paid sub's burn doesn't touch the allowance).
pub fn remove_free_name(
  free_names: List<ByteArray>,
  name: ByteArray,
) -> List<ByteArray> {
  list.filter(free_names, fn(n) { n != name })
}
