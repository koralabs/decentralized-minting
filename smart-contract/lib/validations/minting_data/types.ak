use aiken/merkle_patricia_forestry as mpt

// with out asset name label
// #0: LegacyHandle(legacy_handle_name)
// #1: LegacySubHandle(legacy_sub_handle_name, legacy_root_handle_name)
// #2: LegacyVirtualSubHandle(legacy_virtual_sub_handle_name, legacy_root_handle_name)
// #3: NewHandle(new_handle_name)

pub type Handle {
  LegacyHandle(ByteArray)
  LegacySubHandle(ByteArray, ByteArray)
  LegacyVirtualSubHandle(ByteArray, ByteArray)
  NewHandle(ByteArray)
}

pub type Proof {
  mpt_proof: mpt.Proof,
  handle: Handle,
  amount: Int,
}

pub fn get_handle_name(handle: Handle) -> ByteArray {
  when handle is {
    LegacyHandle(handle_name) -> handle_name
    LegacySubHandle(handle_name, _) -> handle_name
    LegacyVirtualSubHandle(handle_name, _) -> handle_name
    NewHandle(handle_name) -> handle_name
  }
}
