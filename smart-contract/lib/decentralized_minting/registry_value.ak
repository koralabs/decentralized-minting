use aiken/builtin

// WS5 (free virtual mints) — the registry value carries, alongside the WS1 label set, a
// counter of the root's current *private* virtual sub-handles. The first 3 private virtuals
// per root are free; minting one increments the counter, burning one decrements it (public
// virtuals never touch it). Coupling the counter to the mint/burn the same way WS1 couples the
// label set makes the free-slot accounting drift-proof — it rides the same `minting_data` spend.
//
// **Encoding (backward compatible with WS1).** The contract only ever *encodes* a value from
// the structured state `(free_virtual_count, labels)` — it never parses raw value bytes (the
// off-chain engine tracks the structured state and supplies it; `mpt.update`'s proof verifies
// the reconstructed old bytes are actually in the trie). So:
//   - count <= 0  ->  the value is exactly `labels` (so an empty handle stays `#""` and any
//     pure-label-set handle is byte-identical to WS1 — no migration).
//   - count  > 0  ->  `serialise_data((count, labels))`, whose CBOR tag byte can never collide
//     with a label set (label prefixes start at 0x00), keeping the encoding injective.

pub fn encode(free_virtual_count: Int, labels: ByteArray) -> ByteArray {
  if free_virtual_count <= 0 {
    labels
  } else {
    builtin.serialise_data((free_virtual_count, labels))
  }
}

// Free iff the root's pre-mint private-virtual counter is below the configured free count
// (legacy = 3; sourced from SettingsV1.discount_config.free_virtual_count).
pub fn is_free_virtual(pre_mint_count: Int, free_virtual_count: Int) -> Bool {
  pre_mint_count < free_virtual_count
}

// A virtual-sub mint is free iff it's PRIVATE and the root still has a free slot. Public
// virtuals never count toward / draw from the free allowance — they always pay.
pub fn virtual_mint_is_free(
  pre_mint_private_count: Int,
  free_virtual_count: Int,
  is_public: Bool,
) -> Bool {
  if is_public {
    False
  } else {
    is_free_virtual(pre_mint_private_count, free_virtual_count)
  }
}

// Apply a private-virtual mint (+1) / burn (-1) to the counter. Burning below 0 is impossible
// (a burn refunds a previously-counted slot), so it fails — keeping the counter honest.
pub fn apply_virtual_delta(count: Int, amount: Int) -> Int {
  when amount is {
    1 -> count + 1
    -1 -> {
      expect count > 0
      count - 1
    }
    _ -> fail @"INVALID_AMOUNT"
  }
}
