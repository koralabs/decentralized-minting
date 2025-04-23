use aiken/bytearray
use aiken/math
use aiken/merkle_patricia_forestry as mpt
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/credential.{
  Address, ScriptCredential, VerificationKeyCredential,
}
use aiken/transaction/value.{PolicyId, Value, ada_asset_name, ada_policy_id}
use common/cip68.{prefix_000, prefix_100, prefix_222}
use common/handle.{parse_handle_name}
use common/hashes.{ScriptHash, VerificationKeyHash}
use common/utils.{parse_bool_from_int}
use decentralized_minting/handle_price.{HandlePriceInfo, get_handle_price}
use decentralized_minting/orders.{OrderDatum}
use decentralized_minting/settings_v1.{min_minter_fee, min_treasury_fee}
use decentralized_minting/sub_handle.{
  get_root_handle_settings, get_sub_handle_price,
}
use validations/minting_data/types.{Proof}

const max_handle_length = 15

const max_sub_handle_length = 28

// This function also check handle_name is valid or not
pub fn all_orders_are_satisfied(
  order_script_hash: ScriptHash,
  inputs: List<Input>,
  outputs: List<Output>,
  reference_inputs: List<Input>,
  new_policy_id: PolicyId,
  legacy_policy_id: PolicyId,
  pz_script_address: Address,
  handle_price_info: HandlePriceInfo,
  proofs: List<Proof>,
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
          let OrderDatum {
            requested_handle,
            destination,
            is_legacy,
            is_virtual,
            ..
          } = datum

          let is_legacy_bool = parse_bool_from_int(is_legacy)
          let is_virtual_bool = parse_bool_from_int(is_virtual)

          // get minting policy id (new or legacy)
          let minting_handle_policy_id =
            get_minting_handle_policy_id(
              is_legacy_bool,
              legacy_policy_id,
              new_policy_id,
            )

          // parse proofs
          expect [proof, ..rest_proofs] = proofs
          let Proof { mpt_proof, root_handle_settings_index } = proof

          // check handle validity and get price
          let handle_price =
            check_handle_validity_and_get_price(
              requested_handle,
              is_virtual_bool,
              handle_price_info,
              reference_inputs,
              root_handle_settings_index,
              new_policy_id,
              legacy_policy_id,
            )
          //
          // update root
          // NOTE:
          // for now we assume that all order is for minting (not burning)
          let new_root = update_root(root, requested_handle, 1, mpt_proof)

          // extract ref & user output (or virtual output)
          // check minted assets are correctly sent to correct address
          // and returns rest_outputs to continue processing
          let rest_outputs: List<Output> =
            check_ref_and_user_outputs(
              order_input,
              outputs,
              minting_handle_policy_id,
              requested_handle,
              handle_price,
              is_virtual_bool,
              pz_script_address,
              destination.address,
            )

          let new_mint_value =
            update_mint_value(
              expected_mint_value,
              minting_handle_policy_id,
              requested_handle,
              is_virtual_bool,
              1,
            )

          all_orders_are_satisfied(
            order_script_hash,
            rest_inputs,
            rest_outputs,
            reference_inputs,
            new_policy_id,
            legacy_policy_id,
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
            reference_inputs,
            new_policy_id,
            legacy_policy_id,
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

fn is_order_script_address(
  address: Address,
  order_script_hash: ScriptHash,
) -> Bool {
  when address.payment_credential is {
    ScriptCredential(sc) -> sc == order_script_hash
    _ -> False
  }
}

fn get_minting_handle_policy_id(
  is_legacy_handle: Bool,
  legacy_policy_id: PolicyId,
  new_policy_id: PolicyId,
) -> PolicyId {
  when is_legacy_handle is {
    True -> legacy_policy_id
    False -> new_policy_id
  }
}

// This function checks if handle is valid or not
// and returns the price of the handle
//
pub fn check_handle_validity_and_get_price(
  handle_name: ByteArray,
  is_virtual: Bool,
  handle_price_info: HandlePriceInfo,
  reference_inputs: List<Input>,
  root_handle_settings_index: Int,
  new_policy_id: PolicyId,
  legacy_policy_id: PolicyId,
) -> Int {
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

    // get root handle settings from reference inputs
    let root_handle_settings =
      get_root_handle_settings(
        reference_inputs,
        root_handle_settings_index,
        root_handle_name,
        new_policy_id,
        legacy_policy_id,
      )

    // get sub handle price
    let sub_handle_price =
      get_sub_handle_price(root_handle_settings, sub_handle_name, is_virtual)

    sub_handle_price
  } else {
    expect handle_length <= max_handle_length
    expect handle_length > 0

    // if not sub handle, it should not be virtual
    expect !is_virtual

    let (current_price, prev_price) =
      get_handle_price(handle_price_info, handle_length)
    let handle_price = math.min(current_price, prev_price)
    handle_price
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

fn check_ref_and_user_outputs(
  order_input: Input,
  outputs: List<Output>,
  minting_handle_policy_id: PolicyId,
  requested_handle: ByteArray,
  handle_price: Int,
  is_virtual: Bool,
  pz_script_address: Address,
  order_destination_address: Address,
) -> List<Output> {
  // make ref asset name and user asset name from requested_handle
  let virtual_asset_name = bytearray.concat(prefix_000, requested_handle)
  let ref_asset_name = bytearray.concat(prefix_100, requested_handle)
  let user_asset_name = bytearray.concat(prefix_222, requested_handle)

  // check order input value
  let order_input_lovelace =
    value.quantity_of(order_input.output.value, ada_policy_id, ada_asset_name)
  let order_is_enough = order_input_lovelace >= handle_price
  expect order_is_enough

  when is_virtual is {
    True -> {
      expect [virtual_output, ..rest_outputs] = outputs
      let Output {
        address: virtual_output_address,
        value: virtual_output_value,
        reference_script: virtual_output_reference_script,
        ..
      } = virtual_output

      // check virtual output
      expect virtual_output_address == pz_script_address
      let expected_virtual_value =
        value.zero()
          |> value.add(minting_handle_policy_id, virtual_asset_name, 1)
      expect
        value.without_lovelace(virtual_output_value) == expected_virtual_value
      // virtual asset's datum is set by minter
      expect virtual_output_reference_script == None

      rest_outputs
    }
    False -> {
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
          |> value.add(minting_handle_policy_id, ref_asset_name, 1)
      expect value.without_lovelace(ref_output_value) == expected_ref_value
      // ref asset's datum is set by minter
      expect ref_output_reference_script == None

      // check user output
      expect user_output_address == order_destination_address
      // user output value = min_lovelace + minted handle (user)
      let user_output_value_has_handle =
        value.quantity_of(
          user_output_value,
          minting_handle_policy_id,
          user_asset_name,
        ) == 1
      expect user_output_value_has_handle

      rest_outputs
    }
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
  let minter_fee =
    math.max(
      total_handles_price * ( 100 - treasury_fee_percentage ) / 100,
      min_minter_fee,
    )
  (treasury_fee, minter_fee)
}

pub fn is_minter_address_match_with_verification_key_hash(
  minter_output_address: Address,
  allowed_minter: VerificationKeyHash,
) -> Bool {
  let Address { payment_credential, .. } = minter_output_address
  when payment_credential is {
    VerificationKeyCredential(vkh) -> vkh == allowed_minter
    _ -> False
  }
}
