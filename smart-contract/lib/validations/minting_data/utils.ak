use aiken/builtin
use aiken/bytearray
use aiken/merkle_patricia_forestry as mpt
use aiken/transaction/value.{PolicyId, Value}
use common/assert.{assert}
use common/cip68.{prefix_000, prefix_100, prefix_222}
use validations/minting_data/types.{Proof}

const max_handle_length = 15

const max_sub_handle_length = 28

// This function also check handle_name is valid or not
pub fn all_proofs_are_valid(
  proofs: List<Proof>,
  root: mpt.MerklePatriciaForestry,
  minting_policy_id: PolicyId,
  expected_mint_value: Value,
  is_minting_new_handles: Bool,
  continuation: fn(mpt.MerklePatriciaForestry, Value) -> result,
) -> result {
  when proofs is {
    [] -> continuation(root, expected_mint_value)
    [proof, ..rest_proofs] -> {
      let Proof { mpt_proof, handle_name, is_virtual, amount } = proof

      // check handle is valid
      expect is_handle_valid(handle_name, is_virtual, is_minting_new_handles)

      all_proofs_are_valid(
        rest_proofs,
        update_root(root, handle_name, amount, mpt_proof),
        minting_policy_id,
        update_mint_value(
          expected_mint_value,
          minting_policy_id,
          handle_name,
          is_virtual,
          amount,
        ),
        is_minting_new_handles,
        continuation,
      )
    }
  }
}

fn update_root(
  root: mpt.MerklePatriciaForestry,
  handle_name: ByteArray,
  amount: Int,
  mpt_proof: mpt.Proof,
) -> mpt.MerklePatriciaForestry {
  when amount is {
    1 ->
      // mint
      mpt.insert(root, handle_name, #"", mpt_proof)
    -1 ->
      // burn
      mpt.delete(root, handle_name, #"", mpt_proof)
    _ -> fail @"INVALID_AMOUNT"
  }
}

fn update_mint_value(
  mint_value: Value,
  minting_policy_id: PolicyId,
  handle_name: ByteArray,
  is_virtual: Bool,
  amount: Int,
) -> Value {
  if is_virtual {
    mint_value
      |> value.add(
          minting_policy_id,
          bytearray.concat(prefix_000, handle_name),
          amount,
        )
  } else {
    mint_value
      |> value.add(
          minting_policy_id,
          bytearray.concat(prefix_100, handle_name),
          amount,
        )
      |> value.add(
          minting_policy_id,
          bytearray.concat(prefix_222, handle_name),
          amount,
        )
  }
}

pub fn is_handle_valid(
  handle_name: ByteArray,
  is_virtual: Bool,
  is_minting_new_handles: Bool,
) -> Bool {
  let (root_handle_name, is_sub_handle) = parse_handle_name(handle_name)

  // New sub handle is not supported for now
  let is_sub_handle_supported =
    if is_minting_new_handles {
      !is_sub_handle
    } else {
      True
    }

  assert(is_sub_handle_supported, @"NEW_SUB_HANDLE_NOT_SUPPORTED")

  if is_sub_handle {
    assert(
      bytearray.length(handle_name) <= max_sub_handle_length,
      @"SUB_HANDLE_TOO_LONG",
    )
    assert(
      bytearray.length(root_handle_name) <= max_handle_length,
      @"ROOT_HANDLE_TOO_LONG",
    )
    True
  } else {
    // if not sub handle, it should not be virtual
    assert(!is_virtual, @"ONLY_SUB_HANDLE_SUPPORTS_VIRTUAL_HANDLE")
    assert(
      bytearray.length(handle_name) <= max_handle_length,
      @"ROOT_HANDLE_TOO_LONG",
    )
    True
  }
}

// parse handle name
// get root handle name and is sub handle
pub fn parse_handle_name(handle_name: ByteArray) -> (ByteArray, Bool) {
  when index_of_at_symbol(handle_name) is {
    Some(idx) -> {
      // if handle_name contains @ symbol, it is a sub handle
      let root_handle_name = bytearray.drop(handle_name, idx + 1)
      // root_handle_name should not contain @ symbol
      assert(
        index_of_at_symbol(root_handle_name) == None,
        @"ROOT_HANDLE_SHOULD_NOT_CONTAIN_AT_SYMBOL",
      )
      (root_handle_name, True)
    }
    None -> (#"", False)
  }
}

fn index_of_at_symbol(handle_name: ByteArray) -> Option<Int> {
  let length = bytearray.length(handle_name)
  do_index_of_at_symbol(handle_name, 0, length)
}

fn do_index_of_at_symbol(
  handle_name: ByteArray,
  idx: Int,
  length: Int,
) -> Option<Int> {
  if idx >= length {
    None
  } else {
    if builtin.index_bytearray(handle_name, idx) == 0x40 {
      Some(idx)
    } else {
      do_index_of_at_symbol(handle_name, idx + 1, length)
    }
  }
}
