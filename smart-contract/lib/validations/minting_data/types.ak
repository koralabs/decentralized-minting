use aiken/merkle_patricia_forestry as mpt

// legacy handle proof
// handle_name is the asset name of the handle in hex format
//
// Legacy mints enforce only uniqueness + correct tokens — no free-virtual allowance (that is
// DeMi-path-only), so there is no per-proof free-virtual data here.
pub type LegacyHandleProof {
  mpt_proof: mpt.Proof,
  handle_name: ByteArray,
  is_virtual: Int,
}

// WS1 — label-asset registry proof.
// One entry per label asset (e.g. 001 settings) minted/burned for a root handle.
//   handle_name:    the root handle's asset name (hex), used as the MPT key
//   label:          the 4-byte CIP-67 label prefix being added (+1) / removed (-1)
//   old_free_names: the key's current free-virtual name set (preserved across the label change)
//   old_labels:     the key's current canonical label set
//   amount:         +1 to add the label (mint the asset) / -1 to remove it (burn)
// The key's stored value is `registry_value.encode(old_free_names, old_labels)`, so WS1 and the
// free-virtual allowance share one encoding — a label change keeps the free-name set, and vice versa.
//
pub type LabelAssetProof {
  mpt_proof: mpt.Proof,
  handle_name: ByteArray,
  label: ByteArray,
  old_free_names: List<ByteArray>,
  old_labels: ByteArray,
  amount: Int,
}
