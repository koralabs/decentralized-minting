use aiken/merkle_patricia_forestry as mpt

// with out asset name label
// #0: NewHandle(new_handle_name)
// #1: LegacyHandle(legacy_handle_name)
// #2: LegacySubHandle(legacy_sub_handle_name, legacy_root_handle_name)
// #3: LegacyVirtualSubHandle(legacy_virtual_sub_handle_name, legacy_root_handle_name)

pub type Handle {
  NewHandle(ByteArray)
  LegacyHandle(ByteArray)
  LegacySubHandle(ByteArray, ByteArray)
  LegacyVirtualSubHandle(ByteArray, ByteArray)
}

pub type Proof {
  mpt_proof: mpt.Proof,
  handle: Handle,
  amount: Int,
}

pub fn get_handle_name(handle: Handle) -> ByteArray {
  when handle is {
    NewHandle(handle_name) -> handle_name
    LegacyHandle(handle_name) -> handle_name
    LegacySubHandle(handle_name, _) -> handle_name
    LegacyVirtualSubHandle(handle_name, _) -> handle_name
  }
}
