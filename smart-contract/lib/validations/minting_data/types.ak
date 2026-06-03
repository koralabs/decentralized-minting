use aiken/merkle_patricia_forestry as mpt

// WS5 free-virtual — for a PRIVATE virtual sub-handle mint/burn, the data needed to bump the
// root's private-virtual counter atomically. The counter lives in the ROOT handle's MPT value,
// alongside the WS1 label set, encoded by `registry_value.encode(count, labels)`. `Some` marks
// a private virtual (counter ±1, free while count < free_virtual_count); `None` = a public
// virtual / nft sub / root handle (no counter, pays the normal fee).
//   root_proof:      MPT proof for the ROOT handle key (to update its value)
//   root_pre_count:  the root's current private-virtual count
//   root_labels:     the root's current label set (preserved across the counter bump)
pub type FreeVirtualData {
  root_proof: mpt.Proof,
  root_pre_count: Int,
  root_labels: ByteArray,
}

// legacy handle proof
// handle_name is the asset name of the handle in hex format
//
pub type LegacyHandleProof {
  mpt_proof: mpt.Proof,
  handle_name: ByteArray,
  is_virtual: Int,
  // WS5 free-virtual: Some for a PRIVATE virtual sub (the root counter update), else None.
  free_virtual: Option<FreeVirtualData>,
}

// WS1 — label-asset registry proof.
// One entry per label asset (e.g. 001 settings) minted/burned for a root handle.
//   handle_name:            the root handle's asset name (hex), used as the MPT key
//   label:                  the 4-byte CIP-67 label prefix being added (+1) / removed (-1)
//   old_free_virtual_count: the key's current private-virtual counter (preserved)
//   old_labels:             the key's current canonical label set
//   amount:                 +1 to add the label (mint the asset) / -1 to remove it (burn)
// The key's stored value is `registry_value.encode(old_free_virtual_count, old_labels)`, so WS1
// and free-virtual share one encoding — a label change keeps the counter, and vice versa.
//
pub type LabelAssetProof {
  mpt_proof: mpt.Proof,
  handle_name: ByteArray,
  label: ByteArray,
  old_free_virtual_count: Int,
  old_labels: ByteArray,
  amount: Int,
}
