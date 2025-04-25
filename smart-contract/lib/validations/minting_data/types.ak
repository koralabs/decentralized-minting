use aiken/merkle_patricia_forestry as mpt

// handle_name is the asset name of the handle in hex format
//
pub type LegacyHandleProof {
  mpt_proof: mpt.Proof,
  handle_name: ByteArray,
  is_virtual: Int,
}
