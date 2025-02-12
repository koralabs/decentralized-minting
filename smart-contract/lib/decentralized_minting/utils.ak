use aiken/list
use aiken/transaction.{InlineDatum, Input, Output}
use aiken/transaction/value
use decentralized_minting/constants.{
  legacy_handle_policy_id, settings_asset_name,
}
use decentralized_minting/types.{Settings}

pub fn find_settings_datum(inputs: List<Input>) -> (Output, Settings) {
  expect Some(settings_output) =
    list.find(
      inputs,
      fn(i) {
        value.quantity_of(
          i.output.value,
          legacy_handle_policy_id,
          settings_asset_name,
        ) == 1
      },
    )
  expect InlineDatum(settings_datum) = settings_output.output.datum
  expect settings_datum: Settings = settings_datum
  (settings_output.output, settings_datum)
}
