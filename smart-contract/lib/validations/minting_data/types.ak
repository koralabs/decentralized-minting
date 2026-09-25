use aiken/merkle_patricia_forestry as mpt

// One per DeMi order (paired 1:1 with the order inputs, same order). A paid order: a root handle,
// an nft sub, a public virtual, or a private virtual. `mpt_proof` inserts the handle's own key.
pub type OrderProof {
  mpt_proof: mpt.Proof,
}

// Burn proof for a DeMi-policy handle (root, nft sub, or virtual sub). The mirror of a mint: the
// `mpt_proof` proves the key is PRESENT and deletes it (absence after); the `-1` mint destroys the
// tokens (000 for a virtual, 100+222 for an nft/root).
pub type BurnProof {
  mpt_proof: mpt.Proof,
  handle_name: ByteArray,
  is_virtual: Int,
  // WS1 orphan reap: a non-inclusion proof of the sub's ROOT key. `Some` => DeMi verifies the root
  // is provably gone from the MPT (mpt.miss), authorizing the reap of a private orphan. `None` for a
  // normal burn (root still present), gated by the minter sig + pers.
  root_absence: Option<mpt.Proof>,
}

// legacy handle proof
// handle_name is the asset name of the handle in hex format
//
// Legacy mints enforce only uniqueness + correct tokens.
//
// `is_virtual` doubles as a 3-way KIND selector (kept as an Int, at the same field position, to
// preserve the existing proof shape / on-chain ABI -- 0 and 1 keep their original bool meaning):
//   0 = non-virtual CIP-68-style root/nft handle minted under the legacy policy -> mint/burn 100+222
//   1 = virtual sub handle                                          -> mint/burn the 000 token
//   2 = bare CIP-25 legacy handle (no label prefix at all -- the original pre-2023 $handle mint,
//       e.g. mainnet `$xar12345`) -> mint/burn the bare handle_name asset
// Kind 2 is BURN-ONLY: `can_mint_legacy_handles` rejects it (there must never be a new bare-name
// mint under the legacy policy), while `can_burn_legacy_handles` accepts it so a CIP-25 handle can
// be burned and its key deleted from the MPT root, same as any other legacy handle.
pub type LegacyHandleProof {
  mpt_proof: mpt.Proof,
  handle_name: ByteArray,
  is_virtual: Int,
}

// WS1 — label-asset registry proof.
// One entry per label asset (e.g. 001 settings) minted/burned for a root handle.
//   handle_name:    the root handle's asset name (hex), used as the MPT key
//   label:          the 4-byte CIP-67 label prefix being added (+1) / removed (-1)
//   old_labels:     the key's current canonical label set
//   amount:         +1 to add the label (mint the asset) / -1 to remove it (burn)
// The key's stored value is `registry_value.encode(old_labels)`.
//
pub type LabelAssetProof {
  mpt_proof: mpt.Proof,
  handle_name: ByteArray,
  label: ByteArray,
  old_labels: ByteArray,
  amount: Int,
}
