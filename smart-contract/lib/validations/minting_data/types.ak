use aiken/merkle_patricia_forestry as mpt

// legacy handle proof
// handle_name is the asset name of the handle in hex format
//
pub type LegacyHandleProof {
  mpt_proof: mpt.Proof,
  handle_name: ByteArray,
  is_virtual: Int,
}

// WS1 — label-asset registry proof.
// One entry per label asset (e.g. 001 settings) minted/burned for a root handle.
//   handle_name: the root handle's asset name (hex), used as the MPT key
//   label:       the 4-byte CIP-67 label prefix being added (+1) or removed (-1)
//   old_value:   the handle key's current canonical label set (for `mpt.update`)
//   amount:      +1 to add the label (mint the asset) / -1 to remove it (burn)
//
pub type LabelAssetProof {
  mpt_proof: mpt.Proof,
  handle_name: ByteArray,
  label: ByteArray,
  old_value: ByteArray,
  amount: Int,
}
