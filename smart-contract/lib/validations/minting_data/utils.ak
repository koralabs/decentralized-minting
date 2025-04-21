use aiken/builtin
use aiken/bytearray
use aiken/math
use aiken/merkle_patricia_forestry as mpt
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/credential.{Address, ScriptCredential}
use aiken/transaction/value.{PolicyId, Value, ada_asset_name, ada_policy_id}
use common/cip68.{prefix_000, prefix_100, prefix_222}
use common/hashes.{ScriptHash}
use common/utils.{parse_bool_from_int}
use decentralized_minting/handle_price.{HandlePriceInfo, get_handle_price}
use decentralized_minting/orders.{OrderDatum}
use validations/minting_data/types.{Proof}

const max_handle_length = 15

const max_sub_handle_length = 28

// min lovelace to send with User NFT
const min_user_handle_utxo_lovelace = 2_000_000

// This function also check handle_name is valid or not
pub fn all_orders_are_satisfied(
  inputs: List<Input>,
  outputs: List<Output>,
  reference_inputs: List<Input>,
  order_script_hash: ScriptHash,
  pz_script_address: Address,
  handle_price_info: HandlePriceInfo,
  proofs: List<Proof>,
  new_policy_id: PolicyId,
  legacy_policy_id: PolicyId,
  treasury_fee: Int,
  minter_fee: Int,
  root: mpt.MerklePatriciaForestry,
  expected_mint_value: Value,
  total_handles_price: Int,
  total_treasury_fee: Int,
  total_minter_fee: Int,
  continuation: fn(mpt.MerklePatriciaForestry, Value, Int, Int, Int) -> result,
) -> result {
  // go through inputs and process order UTxO
  when inputs is {
    [] ->
      continuation(
        root,
        expected_mint_value,
        total_handles_price,
        total_treasury_fee,
        total_minter_fee,
      )
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
              is_virtual_bool,
              handle_price,
              pz_script_address,
              destination.address,
              treasury_fee,
              minter_fee,
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
            rest_inputs,
            rest_outputs,
            reference_inputs,
            order_script_hash,
            pz_script_address,
            handle_price_info,
            rest_proofs,
            new_policy_id,
            legacy_policy_id,
            treasury_fee,
            minter_fee,
            new_root,
            new_mint_value,
            total_handles_price + handle_price,
            total_treasury_fee + treasury_fee,
            total_minter_fee + minter_fee,
            continuation,
          )
        }

        False ->
          all_orders_are_satisfied(
            rest_inputs,
            outputs,
            reference_inputs,
            order_script_hash,
            pz_script_address,
            handle_price_info,
            proofs,
            new_policy_id,
            legacy_policy_id,
            treasury_fee,
            minter_fee,
            root,
            expected_mint_value,
            total_handles_price,
            total_treasury_fee,
            total_minter_fee,
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
  _reference_inputs: List<Input>,
  _root_handle_settings_index: Int,
) -> Int {
  // parse handle name
  // get root handle name and is sub handle
  let (root_handle_name, is_sub_handle) = parse_handle_name(handle_name)

  if is_sub_handle {
    expect bytearray.length(handle_name) <= max_sub_handle_length
    expect bytearray.length(root_handle_name) <= max_handle_length
    // TODO:
    // get root handle settings from reference inputs
    // and get sub handle price
    // add sub handle price logic
    // until then, disable sub handle minting
    fail @"SUB_HANDLE_MINTING_DISABLED"
  } else {
    // if not sub handle, it should not be virtual
    expect !is_virtual
    let handle_length = bytearray.length(handle_name)
    expect handle_length <= max_handle_length
    let (current_price, prev_price) =
      get_handle_price(handle_price_info, handle_length)
    let price = math.min(current_price, prev_price)
    price
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
      expect index_of_at_symbol(root_handle_name) == None
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
  is_virtual: Bool,
  handle_price: Int,
  pz_script_address: Address,
  order_destination_address: Address,
  treasury_fee: Int,
  minter_fee: Int,
) -> List<Output> {
  // make ref asset name and user asset name from requested_handle
  let virtual_asset_name = bytearray.concat(prefix_000, requested_handle)
  let ref_asset_name = bytearray.concat(prefix_100, requested_handle)
  let user_asset_name = bytearray.concat(prefix_222, requested_handle)

  when is_virtual is {
    True -> {
      expect [virtual_output, ..rest_outputs] = outputs
      // check virtual output
      expect virtual_output.address == pz_script_address
      let expected_virtual_value =
        value.zero()
          |> value.add(minting_handle_policy_id, virtual_asset_name, 1)
      expect
        value.without_lovelace(virtual_output.value) == expected_virtual_value
      // virtual asset's datum is set by minter
      expect virtual_output.reference_script == None

      rest_outputs
    }
    False -> {
      expect [ref_output, user_output, ..rest_outputs] = outputs
      // check ref output
      expect ref_output.address == pz_script_address
      let expected_ref_value =
        value.zero()
          |> value.add(minting_handle_policy_id, ref_asset_name, 1)
      expect value.without_lovelace(ref_output.value) == expected_ref_value
      // ref asset's datum is set by minter
      expect ref_output.reference_script == None

      // check user output
      expect user_output.address == order_destination_address
      // user output value = order value - handle_price - treasury_fee - minter_fee + minted handle (user)
      // also check order input lovelace is enough
      let order_input_lovelace =
        value.quantity_of(
          order_input.output.value,
          ada_policy_id,
          ada_asset_name,
        )
      let user_handle_utxo_lovelace =
        order_input_lovelace - ( handle_price + treasury_fee + minter_fee )
      expect user_handle_utxo_lovelace >= min_user_handle_utxo_lovelace

      let expected_user_value =
        value.from_lovelace(user_handle_utxo_lovelace)
          |> value.add(minting_handle_policy_id, user_asset_name, 1)
      expect user_output.value == expected_user_value

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
