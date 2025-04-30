use aiken/bytearray
use aiken/math
use aiken/merkle_patricia_forestry as mpt
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/credential.{Address, ScriptCredential}
use aiken/transaction/value.{PolicyId, Value, ada_asset_name, ada_policy_id}
use common/cip68.{prefix_000, prefix_100, prefix_222}
use common/handle.{parse_handle_name}
use common/hashes.{ScriptHash}
use common/utils.{parse_bool_from_int}
use decentralized_minting/handle_price.{HandlePriceInfo, get_handle_price}
use decentralized_minting/orders.{OrderDatum}
use decentralized_minting/settings_v1.{min_treasury_fee}
use validations/minting_data/types.{LegacyHandleProof}

const max_handle_length = 15

const max_sub_handle_length = 28

// This function checks only new handles orders are satisfied
pub fn all_orders_are_satisfied(
  order_script_hash: ScriptHash,
  inputs: List<Input>,
  outputs: List<Output>,
  policy_id: PolicyId,
  pz_script_address: Address,
  handle_price_info: HandlePriceInfo,
  proofs: List<mpt.Proof>,
  root: mpt.MerklePatriciaForestry,
  expected_mint_value: Value,
  total_handles_price: Int,
  continuation: fn(mpt.MerklePatriciaForestry, Value, Int) -> result,
) -> result {
  // go through inputs and process order UTxO
  when inputs is {
    [] -> continuation(root, expected_mint_value, total_handles_price)
    [order_input, ..rest_inputs] -> {
      let Output { address, datum, .. } = order_input.output
      let is_order = is_order_script_address(address, order_script_hash)
      when is_order is {
        True -> {
          // parse order datum
          expect InlineDatum(datum) = datum
          expect datum: OrderDatum = datum
          let OrderDatum { requested_handle, destination, .. } = datum

          // parse proofs
          expect [mpt_proof, ..rest_proofs] = proofs

          // check handle validity and get price
          let handle_price =
            check_new_handle_validity_and_get_price(
              requested_handle,
              handle_price_info,
            )
          //
          // update root
          // NOTE:
          // for now we assume that all order is for minting (not burning)
          let new_root = update_root(root, requested_handle, 1, mpt_proof)

          // check order input has enough lovelace for handle price
          let order_input_lovelace =
            value.quantity_of(
              order_input.output.value,
              ada_policy_id,
              ada_asset_name,
            )
          let order_is_enough = order_input_lovelace >= handle_price
          expect order_is_enough

          // extract ref & user output (or virtual output)
          // check minted assets are correctly sent to correct address
          // and returns rest_outputs and new_mint_value to continue processing
          let (rest_outputs, new_mint_value) =
            check_ref_and_user_outputs(
              outputs,
              policy_id,
              requested_handle,
              pz_script_address,
              destination.address,
              expected_mint_value,
            )

          all_orders_are_satisfied(
            order_script_hash,
            rest_inputs,
            rest_outputs,
            policy_id,
            pz_script_address,
            handle_price_info,
            rest_proofs,
            new_root,
            new_mint_value,
            total_handles_price + handle_price,
            continuation,
          )
        }

        False ->
          all_orders_are_satisfied(
            order_script_hash,
            rest_inputs,
            outputs,
            policy_id,
            pz_script_address,
            handle_price_info,
            proofs,
            root,
            expected_mint_value,
            total_handles_price,
            continuation,
          )
      }
    }
  }
}

pub fn all_proofs_are_valid(
  proofs: List<LegacyHandleProof>,
  root: mpt.MerklePatriciaForestry,
  legacy_policy_id: PolicyId,
  expected_mint_value: Value,
  continuation: fn(mpt.MerklePatriciaForestry, Value) -> result,
) -> result {
  when proofs is {
    [] -> continuation(root, expected_mint_value)
    [proof, ..rest_proofs] -> {
      let LegacyHandleProof { mpt_proof, handle_name, is_virtual } = proof
      let is_virtual_bool = parse_bool_from_int(is_virtual)

      // check handle is valid
      expect check_legacy_handle_validity(handle_name, is_virtual_bool)

      // update root
      // NOTE:
      // for now we assume that all order is for minting (not burning)
      let new_root = update_root(root, handle_name, 1, mpt_proof)

      // update mint value
      let new_mint_value =
        update_mint_value(
          expected_mint_value,
          legacy_policy_id,
          handle_name,
          is_virtual_bool,
          1,
        )

      all_proofs_are_valid(
        rest_proofs,
        new_root,
        legacy_policy_id,
        new_mint_value,
        continuation,
      )
    }
  }
}

fn is_order_script_address(
  address: Address,
  order_script_hash: ScriptHash,
) -> Bool {
  when address.payment_credential is {
    ScriptCredential(sc) -> sc == order_script_hash
    _ -> False
  }
}

// This function checks if new handle is valid or not
// and returns the price of the handle
//
pub fn check_new_handle_validity_and_get_price(
  handle_name: ByteArray,
  handle_price_info: HandlePriceInfo,
) -> Int {
  // parse handle name
  // get root handle name and is sub handle
  let (_root_handle_name, is_sub_handle, _sub_handle_name) =
    parse_handle_name(handle_name)

  // sub handle is not supported for new handles
  expect !is_sub_handle

  // check handle's length
  let handle_length = bytearray.length(handle_name)
  expect handle_length <= max_handle_length
  expect handle_length > 0

  let (current_price, prev_price) =
    get_handle_price(handle_price_info, handle_length)

  // we only consider the miniume price for user's sake
  let handle_price = math.min(current_price, prev_price)
  handle_price
}

pub fn check_legacy_handle_validity(
  handle_name: ByteArray,
  is_virtual: Bool,
) -> Bool {
  // parse handle name
  // get root handle name and is sub handle
  let (root_handle_name, is_sub_handle, sub_handle_name) =
    parse_handle_name(handle_name)
  let handle_length = bytearray.length(handle_name)
  let root_handle_length = bytearray.length(root_handle_name)
  let sub_handle_length = bytearray.length(sub_handle_name)

  if is_sub_handle {
    expect handle_length <= max_sub_handle_length
    expect root_handle_length <= max_handle_length
    expect root_handle_length > 0
    expect sub_handle_length > 0

    True
  } else {
    // only subhandle can be virtual
    expect !is_virtual

    expect handle_length <= max_handle_length
    expect handle_length > 0

    True
  }
}

fn check_ref_and_user_outputs(
  outputs: List<Output>,
  policy_id: PolicyId,
  handle_name: ByteArray,
  pz_script_address: Address,
  order_destination_address: Address,
  mint_value: Value,
) -> (List<Output>, Value) {
  // make ref asset name and user asset name from handle_name
  let ref_asset_name = bytearray.concat(prefix_100, handle_name)
  let user_asset_name = bytearray.concat(prefix_222, handle_name)

  // parse ref and user outputs
  expect [ref_output, user_output, ..rest_outputs] = outputs
  let Output {
    address: ref_output_address,
    value: ref_output_value,
    reference_script: ref_output_reference_script,
    ..
  } = ref_output
  let Output { address: user_output_address, value: user_output_value, .. } =
    user_output

  // check ref output
  expect ref_output_address == pz_script_address
  let expected_ref_value =
    value.zero()
      |> value.add(policy_id, ref_asset_name, 1)
  expect value.without_lovelace(ref_output_value) == expected_ref_value
  // ref asset's datum is set by minter
  expect ref_output_reference_script == None

  // check user output
  expect user_output_address == order_destination_address
  let user_output_value_has_handle =
    value.quantity_of(user_output_value, policy_id, user_asset_name) == 1
  expect user_output_value_has_handle

  // update mint value
  let new_mint_value =
    mint_value
      |> value.add(policy_id, ref_asset_name, 1)
      |> value.add(policy_id, user_asset_name, 1)

  (rest_outputs, new_mint_value)
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
  policy_id: PolicyId,
  handle_name: ByteArray,
  is_virtual: Bool,
  amount: Int,
) -> Value {
  if is_virtual {
    mint_value
      |> value.add(policy_id, bytearray.concat(prefix_000, handle_name), amount)
  } else {
    mint_value
      |> value.add(policy_id, bytearray.concat(prefix_100, handle_name), amount)
      |> value.add(policy_id, bytearray.concat(prefix_222, handle_name), amount)
  }
}

pub fn calculate_treasury_fee_and_minter_fee(
  total_handles_price: Int,
  treasury_fee_percentage: Int,
) -> (Int, Int) {
  expect treasury_fee_percentage >= 0
  expect treasury_fee_percentage <= 100

  let treasury_fee =
    math.max(
      total_handles_price * treasury_fee_percentage / 100,
      min_treasury_fee,
    )
  let minter_fee = total_handles_price - treasury_fee
  (treasury_fee, minter_fee)
}
