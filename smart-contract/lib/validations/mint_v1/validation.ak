use aiken/list
use aiken/transaction.{InlineDatum, Output, Transaction}
use aiken/transaction/credential.{Address, ScriptCredential}
use aiken/transaction/value
use decentralized_minting/minting_data.{find_minting_data}
use decentralized_minting/settings.{Settings, find_settings}
use decentralized_minting/settings_v1.{SettingsV1}
use validations/mint_v1/utils.{all_orders_are_satisfied}

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
    expected_new_mint_value,
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
  expect value.from_minted_value(mint) == expected_new_mint_value

  True
}

pub fn can_burn_handles(_transaction: Transaction) -> Bool {
  trace @"Burn is disabled now"
  False
}
