use aiken/list
use aiken/merkle_patricia_forestry as mpt
use aiken/transaction.{
  InlineDatum, Input, OutputReference, Transaction, find_input,
}
use aiken/transaction/value.{PolicyId}
use common/hashes.{VerificationKeyHash}
use decentralized_minting/handle_price.{find_handle_price_info}
use decentralized_minting/minting_data.{MintingData, resolve_minting_data}
use decentralized_minting/settings.{Settings, find_settings}
use decentralized_minting/settings_v1.{
  SettingsV1, get_allowed_minter_and_valid_handle_price_asset,
}
use validations/minting_data/types.{Proof}
use validations/minting_data/utils.{
  all_orders_are_satisfied, calculate_treasury_fee_and_minter_fee,
}

// Validation:
// All Decentralized Minting logic is here
//
// Checks
// - signed by allowed_minter
// - all orders are satisfied correctly (handle price, treasury fee, minter fee) 
// and minted values are sent to correct addresses
// - Proofs are valid (NOTE: must be in same order as orders UTxOs)
//
pub fn can_mint_handles(
  transaction: Transaction,
  spending_output_reference: OutputReference,
  proofs: List<Proof>,
  legacy_policy_id: PolicyId,
  minter_index: Int,
) -> Bool {
  trace @"Start Minting Data"
  let Transaction {
    inputs,
    reference_inputs,
    outputs,
    extra_signatories,
    mint,
    ..
  } = transaction

  // find settings 
  // find settings and parse
  let Settings { data: settings_data, .. } = find_settings(reference_inputs)
  expect settings_datum: SettingsV1 = settings_data
  let SettingsV1 {
    policy_id: new_policy_id,
    allowed_minters,
    valid_handle_price_assets,
    treasury_address,
    treasury_fee_percentage,
    pz_script_address,
    order_script_hash,
    ..
  } = settings_datum

  // get allowed minter and valid handle price asset
  let (allowed_minter, valid_handle_price_asset) =
    get_allowed_minter_and_valid_handle_price_asset(
      allowed_minters,
      valid_handle_price_assets,
      minter_index,
    )

  // check if allowed_minter sign tx
  expect list.has(extra_signatories, allowed_minter)

  // find minting data input which is own input
  expect Some(spending_input) = find_input(inputs, spending_output_reference)
  let Input { output: minting_data_input, .. } = spending_input
  let MintingData { mpt_root_hash } = resolve_minting_data(minting_data_input)

  // find handle price info using valid handle price info asset
  let handle_price_info =
    find_handle_price_info(reference_inputs, valid_handle_price_asset)

  // parse outputs
  expect [minting_data_output, treasury_output, minter_output, ..rest_outputs] =
    outputs

  // expect proofs are not empty
  expect list.length(proofs) > 0

  // build merkle patricia trie from old root hash
  let root = mpt.from_root(mpt_root_hash)

  // check orders with proofs
  let
    new_root,
    expected_mint_value,
    total_handles_price,
  <-
    all_orders_are_satisfied(
      order_script_hash,
      inputs,
      rest_outputs,
      reference_inputs,
      new_policy_id,
      legacy_policy_id,
      pz_script_address,
      handle_price_info,
      proofs,
      root,
      value.zero(),
      0,
    )

  // calculate new root and expected mint value
  let new_mpt_root_hash = new_root |> mpt.root

  // check minting data output
  expect minting_data_output.address == minting_data_input.address
  expect
    value.without_lovelace(minting_data_output.value) == value.without_lovelace(
      minting_data_input.value,
    )
  expect
    minting_data_output.datum == InlineDatum(
      MintingData { mpt_root_hash: new_mpt_root_hash },
    )
  expect minting_data_output.reference_script == None

  // calculate treasury fee and minter fee
  let (treasury_fee, minter_fee) =
    calculate_treasury_fee_and_minter_fee(
      total_handles_price,
      treasury_fee_percentage,
    )

  // check treasury output
  expect treasury_output.address == treasury_address
  expect treasury_output.datum == InlineDatum(Void)
  expect value.lovelace_of(treasury_output.value) >= treasury_fee
  expect treasury_output.reference_script == None

  // check minter output
  expect minter_output.datum == InlineDatum(Void)
  expect value.lovelace_of(minter_output.value) >= minter_fee
  expect minter_output.reference_script == None

  // check minted handles
  expect
    value.merge(
      value.from_minted_value(mint),
      value.negate(expected_mint_value),
    ) == value.zero()

  True
}

pub fn can_update_mpt(
  transaction: Transaction,
  admin_verification_key_hash: VerificationKeyHash,
) -> Bool {
  let Transaction { extra_signatories, mint, .. } = transaction

  // must not mint anything
  expect value.from_minted_value(mint) == value.zero()

  // must be signed by god
  expect list.has(extra_signatories, admin_verification_key_hash)

  True
}
