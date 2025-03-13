use aiken/bytearray
use aiken/list
use aiken/transaction.{InlineDatum, Input, Output, Transaction}
use aiken/transaction/credential.{Address, ScriptCredential}
use aiken/transaction/value.{PolicyId, Value, ada_asset_name, ada_policy_id}
use common/cip68.{prefix_100, prefix_222}
use common/hashes.{ScriptHash}
use decentralized_minting/minting_data.{find_minting_data}
use decentralized_minting/orders.{Destination, OrderDatum}
use decentralized_minting/settings.{Settings, find_settings}
use decentralized_minting/settings_v1.{SettingsV1}

// Validation:
// Main validation logic for new handles' minting
//
// Checks
// - check transaction is signed by one of allowed minters
// - check minting data asset is spent from minting_data script which assures
// minting_data (mpt_root_hash) is correctly updated corresponding real minted asset
// - all orders (from order script) are correctly formated (Order Datum) 
// and has enough lovelace to cover fees (minter fee, treasury fee)
// - all orders are satisfied correcly which means 
// corresponding assets (ref asset & user asset) are correctly minted,
// and are sent to correct addresses (ref asset to pz_script, user asset to destination)
// - confirm no other assets than new handles (from orders) are minted
//
pub fn can_mint_handles(transaction: Transaction) -> Bool {
  let Transaction {
    inputs,
    reference_inputs,
    outputs,
    extra_signatories,
    mint,
    ..
  } = transaction

  // find settings and parse
  let Settings { data, .. } = find_settings(reference_inputs)
  expect settings_datum: SettingsV1 = data
  let SettingsV1 {
    policy_id,
    allowed_minters,
    treasury_address,
    treasury_fee,
    minter_fee,
    pz_script_address,
    order_script_hash,
    minting_data_script_hash,
  } = settings_datum

  // check mpt root hash is correctly updated
  // find minting_data and check that is spent from minting data proxy
  let (minting_data_input, _) = find_minting_data(inputs)
  expect
    minting_data_input.address.payment_credential == ScriptCredential(
      minting_data_script_hash,
    )

  // check if allowed_minters sign tx
  expect list.any(allowed_minters, fn(m) { list.has(extra_signatories, m) })

  // parse outputs
  expect [_minting_data_output, treasury_output, minter_output, ..rest_outputs] =
    outputs

  // check all orders
  // and calculate total fee and expected mint assets
  let
    total_treasury_fee,
    total_minter_fee,
    expected_mint_value,
  <-
    all_orders_are_satisfied(
      order_script_hash,
      policy_id,
      treasury_fee,
      minter_fee,
      pz_script_address,
      inputs,
      rest_outputs,
      0,
      0,
      value.zero(),
    )

  // check treasury output
  expect treasury_output.address == treasury_address
  expect treasury_output.datum == InlineDatum(Void)
  expect value.lovelace_of(treasury_output.value) >= total_treasury_fee
  expect treasury_output.reference_script == None

  // check minter output
  expect minter_output.datum == InlineDatum(Void)
  expect value.lovelace_of(minter_output.value) >= total_minter_fee
  expect minter_output.reference_script == None

  // check minted handles
  expect value.from_minted_value(mint) == expected_mint_value

  True
}

pub fn can_burn_handles(_transaction: Transaction) -> Bool {
  trace @"Burn is disabled now"
  False
}

fn all_orders_are_satisfied(
  order_script_hash: ScriptHash,
  handle_policy_id: PolicyId,
  treasury_fee: Int,
  minter_fee: Int,
  pz_script_address: Address,
  inputs: List<Input>,
  outputs: List<Output>,
  total_treasury_fee: Int,
  total_minter_fee: Int,
  expected_mint_value: Value,
  continuation: fn(Int, Int, Value) -> result,
) -> result {
  when inputs is {
    [] ->
      continuation(total_treasury_fee, total_minter_fee, expected_mint_value)
    [input, ..rest_inputs] -> {
      let Output { address: Address { payment_credential, .. }, datum, .. } =
        input.output
      when payment_credential is {
        // check input is order or not
        ScriptCredential(sc) if sc == order_script_hash -> {
          // parse order datum
          expect InlineDatum(datum) = datum
          expect datum: OrderDatum = datum
          let OrderDatum { requested_handle, destination, .. } = datum

          // extract ref & user output
          expect [ref_output, user_output, ..rest_outputs] = outputs

          // make ref asset name and user asset name from requested_handle
          let ref_asset_name = bytearray.concat(prefix_100, requested_handle)
          let user_asset_name = bytearray.concat(prefix_222, requested_handle)

          // check ref output
          expect ref_output.address == pz_script_address
          let expected_ref_value =
            value.zero() |> value.add(handle_policy_id, ref_asset_name, 1)
          expect value.without_lovelace(ref_output.value) == expected_ref_value
          // ref asset's datum is set by minter
          expect ref_output.reference_script == None

          // check user output
          expect user_output.address == destination.address
          // user output value = order value - treasury_fee - minter_fee + minted handle (user)
          let expected_user_value =
            input.output.value
              |> value.add(
                  ada_policy_id,
                  ada_asset_name,
                  -(treasury_fee + minter_fee),
                )
              |> value.add(handle_policy_id, user_asset_name, 1)
          expect user_output.value == expected_user_value

          all_orders_are_satisfied(
            order_script_hash,
            handle_policy_id,
            treasury_fee,
            minter_fee,
            pz_script_address,
            rest_inputs,
            rest_outputs,
            total_treasury_fee + treasury_fee,
            total_minter_fee + minter_fee,
            // this also check only 1 user and 1 ref assets are minted
            expected_mint_value
              |> value.add(handle_policy_id, user_asset_name, 1)
              |> value.add(handle_policy_id, ref_asset_name, 1),
            continuation,
          )
        }
        _ ->
          all_orders_are_satisfied(
            order_script_hash,
            handle_policy_id,
            treasury_fee,
            minter_fee,
            pz_script_address,
            rest_inputs,
            outputs,
            total_treasury_fee,
            total_minter_fee,
            expected_mint_value,
            continuation,
          )
      }
    }
  }
}
