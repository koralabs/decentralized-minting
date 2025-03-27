use aiken/merkle_patricia_forestry as mpt

// handle_name is the asset name of the handle in hex format
//
pub type Proof {
  mpt_proof: mpt.Proof,
  handle_name: ByteArray,
  is_virtual: Bool,
  amount: Int,
}
