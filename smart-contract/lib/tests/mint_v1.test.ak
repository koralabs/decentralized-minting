use aiken/bytearray
use aiken/transaction.{Input, Output}
use aiken/transaction/credential
use aiken/transaction/value.{Value}
use common/cip68.{prefix_100, prefix_222}
use tests/mocks/fake_constants.{
  allowed_minter_1, min_order_lovelace, minter_fee, minting_data_script_hash,
  new_policy_id, pz_script_address, treasury_address, treasury_fee,
}
use tests/mocks/fake_tx.{
  make_fee_output, make_minting_data_input, make_minting_data_output,
  make_order_input, make_output, make_settings_reference_input,
  make_test_address, make_transaction,
}
use validations/mint_v1.{can_mint_handles}

test can_mint_handles_0() {
  let settings_ref_input = make_settings_reference_input()

  // mpt root hash is checked by minting_data validator
  let old_mpt_root_hash = #"0000"
  let new_mpt_root_hash = #"1111"
  let minting_data_input =
    make_minting_data_input(old_mpt_root_hash, minting_data_script_hash)
  let minting_data_output =
    make_minting_data_output(new_mpt_root_hash, minting_data_script_hash)

  let user_verification_key_hash_1 = #"0001"
  let user_verification_key_hash_2 = #"0002"
  let ref_handle_value_1: Value =
    value.zero()
      |> value.add(new_policy_id, bytearray.concat(prefix_100, "handle_1"), 1)
  let user_handle_value_1: Value =
    value.from_lovelace(min_order_lovelace)
      |> value.add(new_policy_id, bytearray.concat(prefix_222, "handle_1"), 1)
  let ref_handle_value_2: Value =
    value.zero()
      |> value.add(new_policy_id, bytearray.concat(prefix_100, "handle_2"), 1)
  let user_handle_value_2: Value =
    value.from_lovelace(min_order_lovelace)
      |> value.add(new_policy_id, bytearray.concat(prefix_222, "handle_2"), 1)

  let inputs: List<Input> =
    [
      minting_data_input,
      make_order_input(user_verification_key_hash_1, "handle_1"),
      make_order_input(user_verification_key_hash_2, "handle_2"),
    ]
  let outputs: List<Output> =
    [
      minting_data_output,
      make_fee_output(treasury_address(), treasury_fee * 2),
      make_fee_output(make_test_address(), minter_fee * 2),
      make_output(pz_script_address(), ref_handle_value_1),
      make_output(
        credential.from_verification_key(user_verification_key_hash_1),
        user_handle_value_1,
      ),
      make_output(pz_script_address(), ref_handle_value_2),
      make_output(
        credential.from_verification_key(user_verification_key_hash_2),
        user_handle_value_2,
      ),
    ]

  let mint_value: Value =
    value.zero()
      |> value.merge(ref_handle_value_1)
      |> value.merge(value.without_lovelace(user_handle_value_1))
      |> value.merge(ref_handle_value_2)
      |> value.merge(value.without_lovelace(user_handle_value_2))

  let transaction =
    make_transaction(
      inputs,
      [settings_ref_input],
      outputs,
      mint_value,
      [],
      [allowed_minter_1],
    )
  can_mint_handles(transaction)
}

// fail when orders input and handles output 
// are in different order
test can_mint_handles_1() fail {
  let settings_ref_input = make_settings_reference_input()

  // mpt root hash is checked by minting_data validator
  let old_mpt_root_hash = #"0000"
  let new_mpt_root_hash = #"1111"
  let minting_data_input =
    make_minting_data_input(old_mpt_root_hash, minting_data_script_hash)
  let minting_data_output =
    make_minting_data_output(new_mpt_root_hash, minting_data_script_hash)

  let user_verification_key_hash_1 = #"0001"
  let user_verification_key_hash_2 = #"0002"
  let ref_handle_value_1: Value =
    value.zero()
      |> value.add(new_policy_id, bytearray.concat(prefix_100, "handle_1"), 1)
  let user_handle_value_1: Value =
    value.from_lovelace(min_order_lovelace)
      |> value.add(new_policy_id, bytearray.concat(prefix_222, "handle_1"), 1)
  let ref_handle_value_2: Value =
    value.zero()
      |> value.add(new_policy_id, bytearray.concat(prefix_100, "handle_2"), 1)
  let user_handle_value_2: Value =
    value.from_lovelace(min_order_lovelace)
      |> value.add(new_policy_id, bytearray.concat(prefix_222, "handle_2"), 1)

  let inputs: List<Input> =
    [
      minting_data_input,
      make_order_input(user_verification_key_hash_2, "handle_2"),
      make_order_input(user_verification_key_hash_1, "handle_1"),
    ]
  let outputs: List<Output> =
    [
      minting_data_output,
      make_fee_output(treasury_address(), treasury_fee * 2),
      make_fee_output(make_test_address(), minter_fee * 2),
      make_output(pz_script_address(), ref_handle_value_1),
      make_output(
        credential.from_verification_key(user_verification_key_hash_1),
        user_handle_value_1,
      ),
      make_output(pz_script_address(), ref_handle_value_2),
      make_output(
        credential.from_verification_key(user_verification_key_hash_2),
        user_handle_value_2,
      ),
    ]

  let mint_value: Value =
    value.zero()
      |> value.merge(ref_handle_value_1)
      |> value.merge(value.without_lovelace(user_handle_value_1))
      |> value.merge(ref_handle_value_2)
      |> value.merge(value.without_lovelace(user_handle_value_2))

  let transaction =
    make_transaction(
      inputs,
      [settings_ref_input],
      outputs,
      mint_value,
      [],
      [allowed_minter_1],
    )
  can_mint_handles(transaction)
}

// fail when minting data is not spent from minting_data script
test can_mint_handles_2() fail {
  let settings_ref_input = make_settings_reference_input()

  let user_verification_key_hash_1 = #"0001"
  let user_verification_key_hash_2 = #"0002"
  let ref_handle_value_1: Value =
    value.zero()
      |> value.add(new_policy_id, bytearray.concat(prefix_100, "handle_1"), 1)
  let user_handle_value_1: Value =
    value.from_lovelace(min_order_lovelace)
      |> value.add(new_policy_id, bytearray.concat(prefix_222, "handle_1"), 1)
  let ref_handle_value_2: Value =
    value.zero()
      |> value.add(new_policy_id, bytearray.concat(prefix_100, "handle_2"), 1)
  let user_handle_value_2: Value =
    value.from_lovelace(min_order_lovelace)
      |> value.add(new_policy_id, bytearray.concat(prefix_222, "handle_2"), 1)

  let inputs: List<Input> =
    [
      make_order_input(user_verification_key_hash_1, "handle_1"),
      make_order_input(user_verification_key_hash_2, "handle_2"),
    ]
  let outputs: List<Output> =
    [
      make_fee_output(treasury_address(), treasury_fee * 2),
      make_fee_output(make_test_address(), minter_fee * 2),
      make_output(pz_script_address(), ref_handle_value_1),
      make_output(
        credential.from_verification_key(user_verification_key_hash_1),
        user_handle_value_1,
      ),
      make_output(pz_script_address(), ref_handle_value_2),
      make_output(
        credential.from_verification_key(user_verification_key_hash_2),
        user_handle_value_2,
      ),
    ]

  let mint_value: Value =
    value.zero()
      |> value.merge(ref_handle_value_1)
      |> value.merge(value.without_lovelace(user_handle_value_1))
      |> value.merge(ref_handle_value_2)
      |> value.merge(value.without_lovelace(user_handle_value_2))

  let transaction =
    make_transaction(
      inputs,
      [settings_ref_input],
      outputs,
      mint_value,
      [],
      [allowed_minter_1],
    )
  can_mint_handles(transaction)
}
