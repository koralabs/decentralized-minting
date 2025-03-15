use aiken/bytearray
use aiken/merkle_patricia_forestry as mpt
use aiken/transaction/value.{PolicyId, Value}
use common/cip68.{prefix_000, prefix_100, prefix_222}
use validations/minting_data/types.{
  Handle, LegacyHandle, LegacySubHandle, LegacyVirtualSubHandle, NewHandle,
  Proof, get_handle_name,
}

const max_handle_length = 15

const max_sub_handle_length = 28

// This function also check handle_name is valid or not
pub fn all_proofs_are_valid(
  proofs: List<Proof>,
  root: mpt.MerklePatriciaForestry,
  legacy_policy_id: PolicyId,
  new_policy_id: PolicyId,
  expected_mint_value: Value,
  continuation: fn(mpt.MerklePatriciaForestry, Value) -> result,
) -> result {
  when proofs is {
    [] -> continuation(root, expected_mint_value)
    [proof, ..rest_proofs] -> {
      let Proof { mpt_proof, handle, amount } = proof

      // check handle is valid
      expect is_handle_valid(handle)

      // get handle name
      let handle_name = get_handle_name(handle)

      // check handle name length
      expect bytearray.length(handle_name) <= max_handle_length

      all_proofs_are_valid(
        rest_proofs,
        update_root(root, handle_name, amount, mpt_proof),
        legacy_policy_id,
        new_policy_id,
        update_mint_value(
          expected_mint_value,
          legacy_policy_id,
          new_policy_id,
          handle,
          amount,
        ),
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
    _ -> fail @"proof amount can only be 1 or -1"
  }
}

fn update_mint_value(
  mint_value: Value,
  legacy_policy_id: PolicyId,
  new_policy_id: PolicyId,
  handle: Handle,
  amount: Int,
) -> Value {
  when handle is {
    LegacyHandle(legacy_handle_name) ->
      mint_value
        |> value.add(
            legacy_policy_id,
            bytearray.concat(prefix_100, legacy_handle_name),
            amount,
          )
        |> value.add(
            legacy_policy_id,
            bytearray.concat(prefix_222, legacy_handle_name),
            amount,
          )
    LegacySubHandle(legacy_sub_handle_name, _) ->
      mint_value
        |> value.add(
            legacy_policy_id,
            bytearray.concat(prefix_100, legacy_sub_handle_name),
            amount,
          )
        |> value.add(
            legacy_policy_id,
            bytearray.concat(prefix_222, legacy_sub_handle_name),
            amount,
          )
    LegacyVirtualSubHandle(legacy_virtual_sub_handle_name, _) ->
      mint_value
        |> value.add(
            legacy_policy_id,
            bytearray.concat(prefix_000, legacy_virtual_sub_handle_name),
            amount,
          )
    NewHandle(handle_name) ->
      mint_value
        |> value.add(
            new_policy_id,
            bytearray.concat(prefix_100, handle_name),
            amount,
          )
        |> value.add(
            new_policy_id,
            bytearray.concat(prefix_222, handle_name),
            amount,
          )
  }
}

pub fn is_handle_valid(handle: Handle) -> Bool {
  when handle is {
    LegacyHandle(legacy_handle_name) -> {
      expect is_handle_name_valid(legacy_handle_name)
      True
    }
    LegacySubHandle(legacy_sub_handle_name, legacy_root_handle_name) -> {
      expect
        is_sub_handle_name_and_root_handle_name_valid(
          legacy_sub_handle_name,
          legacy_root_handle_name,
        )
      True
    }
    LegacyVirtualSubHandle(
      legacy_virtual_sub_handle_name,
      legacy_root_handle_name,
    ) -> {
      expect
        is_sub_handle_name_and_root_handle_name_valid(
          legacy_virtual_sub_handle_name,
          legacy_root_handle_name,
        )
      True
    }
    NewHandle(new_handle_name) -> {
      expect is_handle_name_valid(new_handle_name)
      True
    }
  }
}

fn is_handle_name_valid(handle_name: ByteArray) -> Bool {
  expect !contains_at_symbol(handle_name)
  expect bytearray.length(handle_name) <= max_handle_length
  True
}

fn is_sub_handle_name_and_root_handle_name_valid(
  sub_handle_name: ByteArray,
  root_handle_name: ByteArray,
) -> Bool {
  expect contains_at_symbol(sub_handle_name)
  expect !contains_at_symbol(root_handle_name)
  expect bytearray.length(sub_handle_name) <= max_sub_handle_length
  expect bytearray.length(root_handle_name) <= max_handle_length
  expect bytearray_ends_with(sub_handle_name, root_handle_name)
  True
}

fn contains_at_symbol(handle_name: ByteArray) -> Bool {
  handle_name
    |> bytearray.foldl(False, fn(char, result) { result || char == 0x40 })
}

fn bytearray_ends_with(target: ByteArray, suffix: ByteArray) -> Bool {
  let target_length = bytearray.length(target)
  let suffix_length = bytearray.length(suffix)
  expect target_length >= suffix_length
  expect
    bytearray.slice(target, target_length - suffix_length, target_length) == suffix
  True
}
