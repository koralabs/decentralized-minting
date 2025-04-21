use aiken/merkle_patricia_forestry as mpt

// handle_name is the asset name of the handle in hex format
//
pub type Proof {
  mpt_proof: mpt.Proof,
  // root handle settings index in reference inputs
  // this will be -1 when handle is not sub handle
  root_handle_settings_index: Int,
}
